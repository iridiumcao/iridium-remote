mod credentials;
mod database;
mod errors;
mod models;
mod recording;
mod session;
mod terminal_detection;
mod transfer;
mod update;

use std::{env, fs, process::Command, sync::Arc};

use database::Database;
use errors::{AppError, AppResult};
use models::{
    AppSettings, ConnectionHistoryDateRange, ConnectionHistoryHostDetails,
    ConnectionHistoryOverview, ConnectionListChangedEvent, ConnectionRecord,
    ConnectionsExportPayload, CreateConnectionInput, FileTransferInput, FileTransferResult,
    ImportConnectionsResult, RemotePathListing, SessionLogPreview,
    SessionRecordingSettings, SessionRecordingStatus, SessionStatePayload,
    UpdateCheckResult, UpdateConnectionInput, UpdateSessionRecordingSettingsResult,
};
use recording::RecordingManager;
use session::SessionManager;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

struct AppState {
    database: Database,
    credentials: credentials::CredentialStore,
    recording: RecordingManager,
    sessions: SessionManager,
}

#[tauri::command]
fn list_connections(state: State<'_, Arc<AppState>>) -> AppResult<Vec<ConnectionRecord>> {
    let connections = state.database.list_connections()?;
    log::info!("Loaded {} saved connections.", connections.len());
    Ok(connections)
}

#[tauri::command]
fn create_connection(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    input: CreateConnectionInput,
) -> AppResult<ConnectionRecord> {
    let password = normalized_password(input.password.clone());
    let mut connection = state.database.create_connection(input)?;

    if let Some(password) = password {
        state.credentials.set_for_connection(&connection, &password)?;
        state
            .database
            .set_connection_has_password(&connection.id, true)?;
        connection.has_password = true;
    }

    log::info!("Created connection '{}'.", connection.name);
    emit_connection_list_changed(&app, "created", &connection.id)?;
    Ok(connection)
}

#[tauri::command]
fn update_connection(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    input: UpdateConnectionInput,
) -> AppResult<ConnectionRecord> {
    let existing = state.database.get_connection(&input.id)?;
    let password = normalized_password(input.password.clone());
    let clear_saved_password = input.clear_saved_password;
    let mut updated = state.database.update_connection(input)?;

    updated.has_password =
        handle_updated_credentials(&state, &existing, &updated, password, clear_saved_password)?;
    state
        .database
        .set_connection_has_password(&updated.id, updated.has_password)?;

    log::info!("Updated connection '{}'.", updated.name);
    emit_connection_list_changed(&app, "updated", &updated.id)?;
    Ok(updated)
}

#[tauri::command]
fn delete_connection(app: AppHandle, state: State<'_, Arc<AppState>>, id: String) -> AppResult<()> {
    state.sessions.close_by_connection(app.clone(), &id)?;

    let deleted = state.database.delete_connection(&id)?;
    state.credentials.delete_for_connection(&deleted)?;
    log::info!("Deleted connection '{}'.", deleted.name);
    emit_connection_list_changed(&app, "deleted", &deleted.id)?;
    Ok(())
}

#[tauri::command]
fn connect_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    connection_id: String,
) -> AppResult<SessionStatePayload> {
    let connection = state.database.get_connection(&connection_id)?;
    let saved_password = load_saved_password_for_connection(&state, &connection)?;
    log::info!("Connecting to '{}'.", connection.name);
    state.sessions.connect(app, &connection, saved_password)
}

#[tauri::command]
fn write_session_input(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: String,
) -> AppResult<()> {
    state.sessions.write_input(&session_id, &data)
}

#[tauri::command]
fn resize_session(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    state.sessions.resize(&session_id, cols, rows)
}

#[tauri::command]
fn disconnect_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> AppResult<SessionStatePayload> {
    log::info!("Disconnecting session {}.", session_id);
    state.sessions.disconnect(app, &session_id)
}

#[tauri::command]
fn close_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> AppResult<()> {
    state.sessions.close(app, &session_id)
}

#[tauri::command]
fn get_session_states(state: State<'_, Arc<AppState>>) -> AppResult<Vec<SessionStatePayload>> {
    Ok(state.sessions.current_states())
}

#[tauri::command]
fn get_connection_history_overview(
    state: State<'_, Arc<AppState>>,
    range: ConnectionHistoryDateRange,
) -> AppResult<ConnectionHistoryOverview> {
    state.database.get_connection_history_overview(range)
}

#[tauri::command]
fn get_connection_history_host_details(
    state: State<'_, Arc<AppState>>,
    history_key: String,
    range: ConnectionHistoryDateRange,
) -> AppResult<ConnectionHistoryHostDetails> {
    state
        .database
        .get_connection_history_host_details(&history_key, range)
}

#[tauri::command]
async fn transfer_file(
    state: State<'_, Arc<AppState>>,
    input: FileTransferInput,
) -> AppResult<FileTransferResult> {
    let connection = state.database.get_connection(&input.connection_id)?;
    let saved_password = load_saved_password_for_connection(&state, &connection)?;
    log::info!(
        "Starting {:?} transfer for '{}'.",
        input.direction,
        connection.name
    );
    transfer::transfer_file(&connection, saved_password, input).await
}

#[tauri::command]
async fn list_remote_directory(
    state: State<'_, Arc<AppState>>,
    connection_id: String,
    path: Option<String>,
) -> AppResult<RemotePathListing> {
    let connection = state.database.get_connection(&connection_id)?;
    let saved_password = load_saved_password_for_connection(&state, &connection)?;
    transfer::list_remote_directory(&connection, saved_password, path).await
}

#[tauri::command]
fn get_app_settings(state: State<'_, Arc<AppState>>) -> AppResult<AppSettings> {
    state.database.get_app_settings()
}

#[tauri::command]
fn update_app_settings(
    state: State<'_, Arc<AppState>>,
    settings: AppSettings,
) -> AppResult<AppSettings> {
    let saved = state.database.set_app_settings(&settings)?;
    state
        .recording
        .sync_settings(saved.session_recording.clone())?;
    log::info!("Updated app settings.");
    Ok(saved)
}

#[tauri::command]
fn get_session_recording_status(
    state: State<'_, Arc<AppState>>,
) -> AppResult<SessionRecordingStatus> {
    state.recording.status()
}

#[tauri::command]
fn update_session_recording_settings(
    state: State<'_, Arc<AppState>>,
    settings: SessionRecordingSettings,
    password: Option<String>,
) -> AppResult<UpdateSessionRecordingSettingsResult> {
    let trimmed_password = password
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(value) = trimmed_password {
        if value.len() < 8 {
            return Err(AppError::validation(
                "Session recording requires an encryption password with at least 8 characters.",
            ));
        }
    }
    let current_status = state.recording.status()?;
    if settings.enabled && trimmed_password.is_none() && !current_status.password_loaded {
        return Err(AppError::validation(
            "Session recording requires an encryption password with at least 8 characters.",
        ));
    }

    let mut app_settings = state.database.get_app_settings()?;
    app_settings.session_recording = settings;
    let saved = state.database.set_app_settings(&app_settings)?;
    let status = state
        .recording
        .update_settings(saved.session_recording.clone(), password)?;

    Ok(UpdateSessionRecordingSettingsResult {
        app_settings: saved,
        status,
    })
}

#[tauri::command]
fn preview_session_logs(
    state: State<'_, Arc<AppState>>,
    paths: Vec<String>,
    password: String,
) -> AppResult<SessionLogPreview> {
    state.recording.preview_logs(paths, password)
}

#[tauri::command]
fn export_session_logs(
    state: State<'_, Arc<AppState>>,
    paths: Vec<String>,
    password: String,
    output_path: String,
) -> AppResult<()> {
    state.recording.export_logs(paths, password, output_path)
}

#[tauri::command]
fn open_session_logs_directory(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    let path = state.recording.logs_directory();
    fs::create_dir_all(&path).map_err(|error| {
        AppError::internal(
            "Failed to initialize the session log directory.",
            error.to_string(),
        )
    })?;

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(&path);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&path);
        command
    };

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&path);
        command
    };

    command.spawn().map_err(|error| {
        AppError::internal(
            "Failed to open the session log directory.",
            error.to_string(),
        )
    })?;
    Ok(())
}

#[tauri::command]
fn export_connections(state: State<'_, Arc<AppState>>) -> AppResult<ConnectionsExportPayload> {
    let payload = state.database.export_connections()?;
    log::info!("Exported {} connections.", payload.connections.len());
    Ok(payload)
}

#[tauri::command]
fn write_export_file(path: String, payload: ConnectionsExportPayload) -> AppResult<()> {
    let contents = serde_json::to_string_pretty(&payload).map_err(|error| {
        AppError::internal("Failed to encode the export file.", error.to_string())
    })?;

    fs::write(&path, contents).map_err(|error| {
        AppError::internal("Failed to write the export file.", error.to_string())
    })?;

    log::info!("Saved the connection export file.");
    Ok(())
}

#[tauri::command]
fn import_connections(
    state: State<'_, Arc<AppState>>,
    payload: ConnectionsExportPayload,
) -> AppResult<ImportConnectionsResult> {
    let result = state.database.import_connections(payload)?;
    let settings = state.database.get_app_settings()?;
    state
        .recording
        .sync_settings(settings.session_recording)?;
    log::info!(
        "Imported {} connections, skipped {} duplicates, settings restored: {}.",
        result.imported,
        result.skipped,
        result.settings_applied
    );
    Ok(result)
}

#[tauri::command]
async fn check_for_updates() -> AppResult<UpdateCheckResult> {
    log::info!("Checking GitHub for a newer release.");
    update::check_for_updates().await
}

fn emit_connection_list_changed(
    app: &AppHandle,
    reason: &str,
    connection_id: &str,
) -> AppResult<()> {
    let payload = ConnectionListChangedEvent {
        reason: reason.to_string(),
        connection_id: connection_id.to_string(),
    };

    app.emit("connection-list-changed", payload)
        .map_err(|error| {
            AppError::internal("Failed to emit connection list event.", error.to_string())
        })
}

fn build_state(app: &AppHandle) -> AppResult<Arc<AppState>> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        AppError::internal(
            "Failed to resolve the app data directory.",
            error.to_string(),
        )
    })?;

    fs::create_dir_all(&app_data_dir).map_err(|error| {
        AppError::internal(
            "Failed to initialize the app data directory.",
            error.to_string(),
        )
    })?;

    let database = Database::new(app_data_dir.join("iridium-remote.db"));
    database.initialize()?;
    let recovered_history_rows = database.recover_connection_history_sessions()?;
    database.cleanup_connection_history()?;
    let app_settings = database.get_app_settings()?;

    let credentials = credentials::CredentialStore::new()?;
    let recording = RecordingManager::new(resolve_session_logs_dir()?, app_settings.session_recording)?;
    let sessions = SessionManager::new(database.clone(), recording.clone());

    if recovered_history_rows > 0 {
        log::info!(
            "Recovered {} unfinished connection history session(s) after startup.",
            recovered_history_rows
        );
    }

    Ok(Arc::new(AppState {
        database,
        credentials,
        recording,
        sessions,
    }))
}

fn resolve_session_logs_dir() -> AppResult<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            return Ok(std::path::PathBuf::from(local_app_data)
                .join("Iridium Remote")
                .join("SessionLogs"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = env::var_os("HOME") {
            return Ok(std::path::PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("Iridium Remote")
                .join("SessionLogs"));
        }
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        if let Some(home) = env::var_os("HOME") {
            return Ok(std::path::PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("Iridium Remote")
                .join("SessionLogs"));
        }
    }

    Err(AppError::internal(
        "Failed to resolve the session log directory.",
        "No suitable user data directory is available.",
    ))
}

fn load_saved_password_for_connection(
    state: &AppState,
    connection: &ConnectionRecord,
) -> AppResult<Option<String>> {
    let saved_password = state.credentials.get_for_connection(connection)?;
    let has_password = saved_password.is_some();

    if connection.has_password != has_password {
        state
            .database
            .set_connection_has_password(&connection.id, has_password)?;
    }

    Ok(saved_password)
}

fn handle_updated_credentials(
    state: &AppState,
    existing: &ConnectionRecord,
    updated: &ConnectionRecord,
    password: Option<String>,
    clear_saved_password: bool,
) -> AppResult<bool> {
    let old_account = state.credentials.account_for_connection(existing);
    let new_account = state.credentials.account_for_connection(updated);

    if clear_saved_password {
        if old_account != new_account {
            state.credentials.delete_for_connection(existing)?;
        }
        state.credentials.delete_for_connection(updated)?;
        return Ok(false);
    }

    if let Some(password) = password {
        if old_account != new_account {
            state.credentials.delete_for_connection(existing)?;
        }
        state.credentials.set_for_connection(updated, &password)?;
        return Ok(true);
    }

    if old_account != new_account {
        if let Some(existing_password) = state.credentials.get_for_connection(existing)? {
            state
                .credentials
                .set_for_connection(updated, &existing_password)?;
            state.credentials.delete_for_connection(existing)?;
            return Ok(true);
        }
        return Ok(false);
    }

    Ok(existing.has_password)
}

fn normalized_password(password: Option<String>) -> Option<String> {
    password
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut log_targets = vec![Target::new(TargetKind::LogDir {
        file_name: Some("iridium-remote".into()),
    })];
    if cfg!(debug_assertions) {
        log_targets.push(Target::new(TargetKind::Stdout));
    }

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets(log_targets)
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .max_file_size(512_000)
                .rotation_strategy(RotationStrategy::KeepAll)
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            log::info!(
                "Rejected a secondary instance launch from '{}' with args {:?}.",
                cwd,
                args
            );

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = build_state(app.handle()).map_err(|error| {
                tauri::Error::Anyhow(anyhow::anyhow!("{}: {:?}", error.message, error.details))
            })?;

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_connections,
            create_connection,
            update_connection,
            delete_connection,
            connect_session,
            write_session_input,
            resize_session,
            disconnect_session,
            close_session,
            get_session_states,
            get_connection_history_overview,
            get_connection_history_host_details,
            get_app_settings,
            update_app_settings,
            get_session_recording_status,
            update_session_recording_settings,
            list_remote_directory,
            export_connections,
            write_export_file,
            import_connections,
            check_for_updates,
            transfer_file,
            preview_session_logs,
            export_session_logs,
            open_session_logs_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
