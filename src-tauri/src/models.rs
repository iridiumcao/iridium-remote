use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionListDisplayMode {
    Normal,
    Compact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub locale: String,
    pub theme: String,
    pub connection_list_display_mode: ConnectionListDisplayMode,
    pub collapsed_groups: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            locale: "en".into(),
            theme: "dark".into(),
            connection_list_display_mode: ConnectionListDisplayMode::Normal,
            collapsed_groups: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRecord {
    pub id: String,
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub has_password: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConnectionInput {
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConnectionInput {
    pub id: String,
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub clear_saved_password: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Idle,
    Connecting,
    Connected,
    Disconnected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatePayload {
    pub session_id: String,
    pub connection_id: String,
    pub connection_name: String,
    pub status: SessionStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub session_id: String,
    pub stream: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionListChangedEvent {
    pub reason: String,
    pub connection_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRemovedEvent {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileTransferDirection {
    Upload,
    Download,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTransferInput {
    pub connection_id: String,
    pub direction: FileTransferDirection,
    pub local_path: String,
    pub remote_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTransferResult {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePathEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePathListing {
    pub current_path: String,
    pub entries: Vec<RemotePathEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionExportRecord {
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionsExportPayload {
    pub version: u32,
    pub exported_at: String,
    pub settings: Option<AppSettings>,
    pub connections: Vec<ConnectionExportRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConnectionsResult {
    pub imported: usize,
    pub skipped: usize,
    pub settings_applied: bool,
}
