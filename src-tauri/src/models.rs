use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionListDisplayMode {
    Normal,
    Compact,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionRecordingMode {
    InputOnly,
    Full,
}

impl Default for SessionRecordingMode {
    fn default() -> Self {
        Self::InputOnly
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecordingSettings {
    pub enabled: bool,
    pub mode: SessionRecordingMode,
    pub max_file_size_mb: u32,
    pub max_total_storage_gb: u32,
    pub retention_days: u32,
    #[serde(default)]
    pub log_directory: Option<String>,
}

impl Default for SessionRecordingSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: SessionRecordingMode::InputOnly,
            max_file_size_mb: 100,
            max_total_storage_gb: 5,
            retention_days: 30,
            log_directory: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub locale: String,
    pub theme: String,
    pub connection_list_display_mode: ConnectionListDisplayMode,
    pub collapsed_groups: Vec<String>,
    #[serde(default)]
    pub connection_history_collapsed_sections: Vec<String>,
    #[serde(default)]
    pub connection_history_time_zone: String,
    #[serde(default)]
    pub session_recording: SessionRecordingSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            locale: "en".into(),
            theme: "dark".into(),
            connection_list_display_mode: ConnectionListDisplayMode::Normal,
            collapsed_groups: Vec::new(),
            connection_history_collapsed_sections: Vec::new(),
            connection_history_time_zone: String::new(),
            session_recording: SessionRecordingSettings::default(),
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
    #[serde(default)]
    pub recording_active: bool,
    pub recording_mode: Option<SessionRecordingMode>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecordingStatus {
    pub configured_enabled: bool,
    pub password_configured: bool,
    pub password_loaded: bool,
    pub can_record: bool,
    pub paused_for_run: bool,
    pub needs_password_verification: bool,
    pub log_directory: String,
    pub current_storage_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionRecordingSettingsResult {
    pub app_settings: AppSettings,
    pub status: SessionRecordingStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogFileInfo {
    pub file_name: String,
    pub path: String,
    pub created_at: String,
    pub host: String,
    pub username: String,
    pub recording_mode: SessionRecordingMode,
    pub part: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogPreview {
    pub files: Vec<SessionLogFileInfo>,
    pub preview_text: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ConnectionHistoryDateRange {
    #[serde(rename = "last_7_days", alias = "last7_days")]
    Last7Days,
    #[serde(rename = "last_30_days", alias = "last30_days")]
    Last30Days,
    #[serde(rename = "last_90_days", alias = "last90_days")]
    Last90Days,
    #[serde(rename = "all_time")]
    AllTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionHistoryCloseStatus {
    InProgress,
    Normal,
    Abnormal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionHistoryDurationBucketKind {
    Under5Minutes,
    Between5And30Minutes,
    Between30MinutesAnd2Hours,
    Over2Hours,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHistoryHostSummary {
    pub history_key: String,
    pub connection_id: Option<String>,
    pub connection_name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub deleted: bool,
    pub latest_connection_at: Option<String>,
    pub total_connection_count: u64,
    pub total_duration_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHistorySessionRecord {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: u64,
    pub close_status: ConnectionHistoryCloseStatus,
    pub is_estimated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHistoryDurationBucket {
    pub bucket: ConnectionHistoryDurationBucketKind,
    pub session_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHistoryDailyHostUsage {
    pub history_key: String,
    pub connection_id: Option<String>,
    pub connection_name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub deleted: bool,
    pub connection_count: u64,
    pub total_duration_seconds: u64,
}

#[cfg(test)]
mod tests {
    use serde_json::{from_str, to_string};

    use super::ConnectionHistoryDateRange;

    #[test]
    fn connection_history_date_range_accepts_frontend_range_values() {
        assert_eq!(
            from_str::<ConnectionHistoryDateRange>(r#""last_7_days""#).unwrap(),
            ConnectionHistoryDateRange::Last7Days
        );
        assert_eq!(
            from_str::<ConnectionHistoryDateRange>(r#""last_30_days""#).unwrap(),
            ConnectionHistoryDateRange::Last30Days
        );
        assert_eq!(
            from_str::<ConnectionHistoryDateRange>(r#""last_90_days""#).unwrap(),
            ConnectionHistoryDateRange::Last90Days
        );
        assert_eq!(
            from_str::<ConnectionHistoryDateRange>(r#""all_time""#).unwrap(),
            ConnectionHistoryDateRange::AllTime
        );
    }

    #[test]
    fn connection_history_date_range_serializes_with_expected_names() {
        assert_eq!(
            to_string(&ConnectionHistoryDateRange::Last7Days).unwrap(),
            r#""last_7_days""#
        );
        assert_eq!(
            to_string(&ConnectionHistoryDateRange::Last30Days).unwrap(),
            r#""last_30_days""#
        );
        assert_eq!(
            to_string(&ConnectionHistoryDateRange::Last90Days).unwrap(),
            r#""last_90_days""#
        );
        assert_eq!(
            to_string(&ConnectionHistoryDateRange::AllTime).unwrap(),
            r#""all_time""#
        );
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHistoryDailyUsage {
    pub date: String,
    pub total_connection_count: u64,
    pub total_duration_seconds: u64,
    pub hosts: Vec<ConnectionHistoryDailyHostUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHistoryOverview {
    pub hosts: Vec<ConnectionHistoryHostSummary>,
    pub daily_usage: Vec<ConnectionHistoryDailyUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHistoryHostDetails {
    pub host: ConnectionHistoryHostSummary,
    pub sessions: Vec<ConnectionHistorySessionRecord>,
    pub duration_buckets: Vec<ConnectionHistoryDurationBucket>,
    pub summarized_session_count: u64,
    pub summarized_duration_seconds: u64,
}
