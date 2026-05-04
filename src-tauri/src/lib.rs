mod credentials;
mod database;
mod errors;
mod models;
mod session;

use std::{fs, sync::Arc};

use database::Database;
use errors::{AppError, AppResult};
use models::{
    ConnectionListChangedEvent, ConnectionRecord, CreateConnectionInput, SessionStatePayload,
    UpdateConnectionInput,
};
use session::SessionManager;
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    database: Database,
    credentials: credentials::CredentialStore,
    sessions: SessionManager,
}

#[tauri::command]
fn list_connections(state: State<'_, Arc<AppState>>) -> AppResult<Vec<ConnectionRecord>> {
    state.database.list_connections()
}

#[tauri::command]
fn create_connection(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    input: CreateConnectionInput,
) -> AppResult<ConnectionRecord> {
    let connection = state.database.create_connection(input)?;
    emit_connection_list_changed(&app, "created", &connection.id)?;
    Ok(connection)
}

#[tauri::command]
fn update_connection(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    input: UpdateConnectionInput,
) -> AppResult<ConnectionRecord> {
    let connection = state.database.update_connection(input)?;
    emit_connection_list_changed(&app, "updated", &connection.id)?;
    Ok(connection)
}

#[tauri::command]
fn delete_connection(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
) -> AppResult<()> {
    let session_state = state.sessions.current_state();
    if session_state.connection_id.as_deref() == Some(id.as_str()) {
        let _ = state.sessions.disconnect(app.clone());
    }

    let deleted = state.database.delete_connection(&id)?;
    state.credentials.delete_for_connection(&deleted)?;
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
    state.sessions.connect(app, &connection, saved_password)
}

#[tauri::command]
fn write_session_input(
    state: State<'_, Arc<AppState>>,
    data: String,
) -> AppResult<()> {
    state.sessions.write_input(&data)
}

#[tauri::command]
fn resize_session(
    state: State<'_, Arc<AppState>>,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    state.sessions.resize(cols, rows)
}

#[tauri::command]
fn disconnect_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> AppResult<SessionStatePayload> {
    state.sessions.disconnect(app)
}

#[tauri::command]
fn get_session_state(state: State<'_, Arc<AppState>>) -> AppResult<SessionStatePayload> {
    Ok(state.sessions.current_state())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

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
            get_session_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
