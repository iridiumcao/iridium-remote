mod credentials;
mod database;
mod errors;
mod models;
mod session;
mod transfer;

use std::{fs, sync::Arc};

use database::Database;
use errors::{AppError, AppResult};
use models::{
    AppSettings, ConnectionListChangedEvent, ConnectionRecord, ConnectionsExportPayload, CreateConnectionInput,
    FileTransferInput, FileTransferResult, ImportConnectionsResult, SessionStatePayload, UpdateConnectionInput,
};
use session::SessionManager;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

struct AppState {
    database: Database,
    credentials: credentials::CredentialStore,
    sessions: SessionManager,
}

#[tauri::command]
fn list_connections(state: State<'_, Arc<AppState>>) -> AppResult<Vec<ConnectionRecord>> {
    let connections = state.database.list_connections()?;
    log::info!("Loaded {} saved connections.", connections.len());
    enrich_connections(&state, connections)
}

#[tauri::command]
fn create_connection(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    input: CreateConnectionInput,
) -> AppResult<ConnectionRecord> {
    let password = normalized_password(input.password.clone());
    let connection = state.database.create_connection(input)?;

    if let Some(password) = password {
        state.credentials.set_for_connection(&connection, &password)?;
    }

    let connection = enrich_connection(&state, connection)?;
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
    let updated = state.database.update_connection(input)?;

    handle_updated_credentials(&state, &existing, &updated, password, clear_saved_password)?;

    let updated = enrich_connection(&state, updated)?;
    log::info!("Updated connection '{}'.", updated.name);
    emit_connection_list_changed(&app, "updated", &updated.id)?;
    Ok(updated)
}

#[tauri::command]
fn delete_connection(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
) -> AppResult<()> {
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
    let saved_password = state.credentials.get_for_connection(&connection)?;
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
fn close_session(app: AppHandle, state: State<'_, Arc<AppState>>, session_id: String) -> AppResult<()> {
    state.sessions.close(app, &session_id)
}

#[tauri::command]
fn get_session_states(state: State<'_, Arc<AppState>>) -> AppResult<Vec<SessionStatePayload>> {
    Ok(state.sessions.current_states())
}

#[tauri::command]
fn transfer_file(state: State<'_, Arc<AppState>>, input: FileTransferInput) -> AppResult<FileTransferResult> {
    let connection = state.database.get_connection(&input.connection_id)?;
    let saved_password = state.credentials.get_for_connection(&connection)?;
    log::info!("Starting {:?} transfer for '{}'.", input.direction, connection.name);
    transfer::transfer_file(&connection, saved_password, input)
}

#[tauri::command]
fn get_app_settings(state: State<'_, Arc<AppState>>) -> AppResult<AppSettings> {
    state.database.get_app_settings()
}

#[tauri::command]
fn update_app_settings(state: State<'_, Arc<AppState>>, settings: AppSettings) -> AppResult<AppSettings> {
    let saved = state.database.set_app_settings(&settings)?;
    log::info!("Updated app settings.");
    Ok(saved)
}

#[tauri::command]
fn export_connections(state: State<'_, Arc<AppState>>) -> AppResult<ConnectionsExportPayload> {
    let payload = state.database.export_connections()?;
    log::info!("Exported {} connections.", payload.connections.len());
    Ok(payload)
}

#[tauri::command]
fn import_connections(
    state: State<'_, Arc<AppState>>,
    payload: ConnectionsExportPayload,
) -> AppResult<ImportConnectionsResult> {
    let result = state.database.import_connections(payload)?;
    log::info!(
        "Imported {} connections, skipped {} duplicates, settings restored: {}.",
        result.imported,
        result.skipped,
        result.settings_applied
    );
    Ok(result)
}

fn emit_connection_list_changed(app: &AppHandle, reason: &str, connection_id: &str) -> AppResult<()> {
    let payload = ConnectionListChangedEvent {
        reason: reason.to_string(),
        connection_id: connection_id.to_string(),
    };

    app.emit("connection-list-changed", payload)
        .map_err(|error| AppError::internal("Failed to emit connection list event.", error.to_string()))
}

fn build_state(app: &AppHandle) -> AppResult<Arc<AppState>> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::internal("Failed to resolve the app data directory.", error.to_string()))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| AppError::internal("Failed to initialize the app data directory.", error.to_string()))?;

    let database = Database::new(app_data_dir.join("iridium-remote.db"));
    database.initialize()?;

    let credentials = credentials::CredentialStore::new();
    let sessions = SessionManager::new();

    Ok(Arc::new(AppState {
        database,
        credentials,
        sessions,
    }))
}

fn enrich_connections(state: &AppState, connections: Vec<ConnectionRecord>) -> AppResult<Vec<ConnectionRecord>> {
    connections
        .into_iter()
        .map(|connection| enrich_connection(state, connection))
        .collect()
}

fn enrich_connection(state: &AppState, mut connection: ConnectionRecord) -> AppResult<ConnectionRecord> {
    connection.has_password = state.credentials.get_for_connection(&connection)?.is_some();
    Ok(connection)
}

fn handle_updated_credentials(
    state: &AppState,
    existing: &ConnectionRecord,
    updated: &ConnectionRecord,
    password: Option<String>,
    clear_saved_password: bool,
) -> AppResult<()> {
    let old_account = state.credentials.account_for_connection(existing);
    let new_account = state.credentials.account_for_connection(updated);

    if clear_saved_password {
        if old_account != new_account {
            state.credentials.delete_for_connection(existing)?;
        }
        state.credentials.delete_for_connection(updated)?;
        return Ok(());
    }

    if let Some(password) = password {
        if old_account != new_account {
            state.credentials.delete_for_connection(existing)?;
        }
        state.credentials.set_for_connection(updated, &password)?;
        return Ok(());
    }

    if old_account != new_account {
        if let Some(existing_password) = state.credentials.get_for_connection(existing)? {
            state.credentials.set_for_connection(updated, &existing_password)?;
            state.credentials.delete_for_connection(existing)?;
        }
    }

    Ok(())
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
            get_app_settings,
            update_app_settings,
            export_connections,
            import_connections,
            transfer_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
