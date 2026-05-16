use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, BufWriter, Cursor, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::SystemTime,
};

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::{
    errors::{AppError, AppResult},
    models::{
        ConnectionRecord, SessionLogFileInfo, SessionLogPreview, SessionRecordingMode,
        SessionRecordingSettings, SessionRecordingStatus,
    },
    terminal_detection::normalize_visible_text,
};

const CHUNK_SIZE_BYTES: usize = 1_048_576;
const FILE_MAGIC: &str = "IRLOG1";
const PREVIEW_LIMIT_BYTES: usize = 200_000;

#[derive(Clone)]
pub struct RecordingManager {
    inner: Arc<Mutex<RecordingManagerState>>,
}

struct RecordingManagerState {
    default_logs_dir: PathBuf,
    logs_dir: PathBuf,
    settings: SessionRecordingSettings,
    password: Option<String>,
}

pub struct SessionRecorder {
    logs_dir: PathBuf,
    settings: SessionRecordingSettings,
    password: String,
    base_name: String,
    host: String,
    username: String,
    created_at: String,
    pending_buffer: Vec<u8>,
    input_line: String,
    input_suppressed: bool,
    current_file: ActiveLogFile,
}

struct ActiveLogFile {
    writer: BufWriter<File>,
    size_bytes: u64,
    chunk_index: u64,
    key: [u8; 32],
    part: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LogMetadata {
    version: u32,
    host: String,
    username: String,
    recording_mode: SessionRecordingMode,
    created_at: String,
    part: u32,
    compression: String,
    cipher: String,
    kdf: String,
    salt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChunkEnvelope {
    index: u64,
    nonce: String,
    ciphertext: String,
}

#[derive(Debug)]
struct ExistingLogFile {
    path: PathBuf,
    size_bytes: u64,
    modified_at: SystemTime,
}

impl RecordingManager {
    pub fn new(default_logs_dir: PathBuf, settings: SessionRecordingSettings) -> AppResult<Self> {
        let logs_dir = resolve_logs_dir(&default_logs_dir, &settings);
        fs::create_dir_all(&logs_dir).map_err(|error| {
            AppError::internal(
                "Failed to initialize the session log directory.",
                error.to_string(),
            )
        })?;

        let manager = Self {
            inner: Arc::new(Mutex::new(RecordingManagerState {
                default_logs_dir,
                logs_dir,
                settings,
                password: None,
            })),
        };
        manager.cleanup_storage()?;
        Ok(manager)
    }

    pub fn status(&self) -> AppResult<SessionRecordingStatus> {
        let inner = self.inner.lock().expect("recording mutex poisoned");
        Ok(SessionRecordingStatus {
            configured_enabled: inner.settings.enabled,
            password_loaded: inner.password.is_some(),
            can_record: inner.settings.enabled && inner.password.is_some(),
            log_directory: inner.logs_dir.display().to_string(),
            current_storage_bytes: storage_usage_bytes(&inner.logs_dir)?,
        })
    }

    pub fn update_settings(
        &self,
        settings: SessionRecordingSettings,
        password: Option<String>,
    ) -> AppResult<SessionRecordingStatus> {
        let mut inner = self.inner.lock().expect("recording mutex poisoned");
        inner.settings = settings;
        inner.logs_dir = resolve_logs_dir(&inner.default_logs_dir, &inner.settings);

        if inner.settings.enabled {
            if let Some(password) = normalize_password(password) {
                inner.password = Some(password);
            } else if inner.password.is_none() {
                return Err(AppError::validation(
                    "Session recording requires an encryption password with at least 8 characters.",
                ));
            }
        } else {
            inner.password = None;
        }

        fs::create_dir_all(&inner.logs_dir).map_err(|error| {
            AppError::internal(
                "Failed to initialize the session log directory.",
                error.to_string(),
            )
        })?;
        let logs_dir = inner.logs_dir.clone();
        let settings = inner.settings.clone();
        drop(inner);

        cleanup_storage(&logs_dir, &settings)?;
        self.status()
    }

    pub fn sync_settings(&self, settings: SessionRecordingSettings) -> AppResult<SessionRecordingStatus> {
        let mut inner = self.inner.lock().expect("recording mutex poisoned");
        inner.settings = settings;
        inner.logs_dir = resolve_logs_dir(&inner.default_logs_dir, &inner.settings);
        if !inner.settings.enabled {
            inner.password = None;
        }
        let logs_dir = inner.logs_dir.clone();
        let settings = inner.settings.clone();
        drop(inner);

        cleanup_storage(&logs_dir, &settings)?;
        self.status()
    }

    pub fn start_session(&self, connection: &ConnectionRecord) -> AppResult<Option<SessionRecorder>> {
        let inner = self.inner.lock().expect("recording mutex poisoned");
        if !inner.settings.enabled {
            return Ok(None);
        }

        let Some(password) = inner.password.clone() else {
            return Err(AppError::validation(
                "Session recording is enabled but the encryption password is not loaded. Open Settings > Session Recording and enter it again.",
            ));
        };

        let logs_dir = inner.logs_dir.clone();
        let settings = inner.settings.clone();
        drop(inner);

        cleanup_storage(&logs_dir, &settings)?;
        SessionRecorder::new(logs_dir, settings, password, connection).map(Some)
    }

    pub fn preview_logs(&self, paths: Vec<String>, password: String) -> AppResult<SessionLogPreview> {
        let normalized_password = normalize_password(Some(password)).ok_or_else(|| {
            AppError::validation("Enter the session recording password to decrypt the selected logs.")
        })?;
        let mut files = Vec::new();
        let mut preview_text = String::new();
        let mut truncated = false;

        for path in sorted_paths(paths) {
            let file = read_log_file(&path, &normalized_password)?;
            for chunk in &file.chunks {
                if preview_text.len() < PREVIEW_LIMIT_BYTES {
                    let remaining = PREVIEW_LIMIT_BYTES - preview_text.len();
                    if chunk.len() <= remaining {
                        preview_text.push_str(chunk);
                    } else {
                        preview_text.push_str(prefix_by_bytes(chunk, remaining));
                        truncated = true;
                    }
                } else {
                    truncated = true;
                }
            }
            files.push(file.info);
        }

        Ok(SessionLogPreview {
            files,
            preview_text,
            truncated,
        })
    }

    pub fn export_logs(
        &self,
        paths: Vec<String>,
        password: String,
        output_path: String,
    ) -> AppResult<()> {
        let normalized_password = normalize_password(Some(password)).ok_or_else(|| {
            AppError::validation("Enter the session recording password to export the selected logs.")
        })?;
        let mut output = File::create(&output_path).map_err(|error| {
            AppError::internal(
                "Failed to create the exported session log file.",
                error.to_string(),
            )
        })?;

        for path in sorted_paths(paths) {
            let file = read_log_file(&path, &normalized_password)?;
            for chunk in file.chunks {
                output.write_all(chunk.as_bytes()).map_err(|error| {
                    AppError::internal(
                        "Failed to write the exported session log file.",
                        error.to_string(),
                    )
                })?;
            }
        }

        output.flush().map_err(|error| {
            AppError::internal(
                "Failed to finish the exported session log file.",
                error.to_string(),
            )
        })
    }

    pub fn logs_directory(&self) -> PathBuf {
        self.inner
            .lock()
            .expect("recording mutex poisoned")
            .logs_dir
            .clone()
    }

    pub fn cleanup_storage(&self) -> AppResult<()> {
        let inner = self.inner.lock().expect("recording mutex poisoned");
        cleanup_storage(&inner.logs_dir, &inner.settings)
    }
}

impl SessionRecorder {
    fn new(
        logs_dir: PathBuf,
        settings: SessionRecordingSettings,
        password: String,
        connection: &ConnectionRecord,
    ) -> AppResult<Self> {
        fs::create_dir_all(&logs_dir).map_err(|error| {
            AppError::internal(
                "Failed to initialize the session log directory.",
                error.to_string(),
            )
        })?;

        let created_at = Utc::now().to_rfc3339();
        let timestamp = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
        let base_name = format!(
            "{}_{}_{}",
            timestamp,
            sanitize_file_name_component(&connection.username),
            sanitize_file_name_component(&connection.host)
        );
        let current_file = open_log_file(
            &logs_dir,
            &base_name,
            1,
            connection.host.clone(),
            connection.username.clone(),
            settings.mode.clone(),
            created_at.clone(),
            &password,
        )?;

        Ok(Self {
            logs_dir,
            settings,
            password,
            base_name,
            host: connection.host.clone(),
            username: connection.username.clone(),
            created_at,
            pending_buffer: Vec::new(),
            input_line: String::new(),
            input_suppressed: false,
            current_file,
        })
    }

    pub fn record_output(&mut self, data: &str) -> AppResult<()> {
        if self.settings.mode != SessionRecordingMode::Full {
            return Ok(());
        }

        let visible = normalize_visible_text(data);
        if visible.is_empty() {
            return Ok(());
        }

        self.append_text(&visible)
    }

    pub fn record_input(&mut self, data: &str) -> AppResult<()> {
        if self.settings.mode != SessionRecordingMode::InputOnly {
            return Ok(());
        }

        for character in data.chars() {
            match character {
                '\r' | '\n' => {
                    if !self.input_suppressed && !self.input_line.is_empty() {
                        let line = std::mem::take(&mut self.input_line);
                        self.append_text(&format!("{line}\n"))?;
                    } else {
                        self.input_line.clear();
                    }
                    self.input_suppressed = false;
                }
                '\u{8}' | '\u{7f}' => {
                    if !self.input_suppressed {
                        self.input_line.pop();
                    }
                }
                _ if character.is_control() => {}
                _ => {
                    if !self.input_suppressed {
                        self.input_line.push(character);
                    }
                }
            }
        }

        Ok(())
    }

    pub fn suppress_input_until_submit(&mut self) {
        self.input_line.clear();
        self.input_suppressed = true;
    }

    pub fn clear_input_suppression(&mut self) {
        self.input_suppressed = false;
    }

    pub fn finish(&mut self) -> AppResult<()> {
        if self.settings.mode == SessionRecordingMode::InputOnly && !self.input_suppressed {
            if !self.input_line.is_empty() {
                let line = std::mem::take(&mut self.input_line);
                self.append_text(&format!("{line}\n"))?;
            }
        }

        self.flush_pending_buffer()?;
        self.current_file.writer.flush().map_err(|error| {
            AppError::internal("Failed to finish the session recording file.", error.to_string())
        })
    }

    pub fn mode(&self) -> SessionRecordingMode {
        self.settings.mode.clone()
    }

    fn append_text(&mut self, text: &str) -> AppResult<()> {
        self.pending_buffer.extend_from_slice(text.as_bytes());
        while self.pending_buffer.len() >= CHUNK_SIZE_BYTES {
            let chunk_end = nearest_utf8_boundary(&self.pending_buffer, CHUNK_SIZE_BYTES);
            let chunk = self.pending_buffer[..chunk_end].to_vec();
            self.pending_buffer.drain(..chunk_end);
            self.write_chunk(&chunk)?;
        }
        Ok(())
    }

    fn flush_pending_buffer(&mut self) -> AppResult<()> {
        if self.pending_buffer.is_empty() {
            return Ok(());
        }

        let chunk = std::mem::take(&mut self.pending_buffer);
        self.write_chunk(&chunk)
    }

    fn write_chunk(&mut self, bytes: &[u8]) -> AppResult<()> {
        if bytes.is_empty() {
            return Ok(());
        }

        let compressed = zstd::stream::encode_all(Cursor::new(bytes), 3).map_err(|error| {
            AppError::internal(
                "Failed to compress the session recording chunk.",
                error.to_string(),
            )
        })?;

        let cipher = Aes256Gcm::new_from_slice(&self.current_file.key)
            .expect("fixed-length session recording key");
        let mut nonce = [0_u8; 12];
        rand::rngs::OsRng.fill_bytes(&mut nonce);
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), compressed.as_ref())
            .map_err(|_| {
                AppError::internal(
                    "Failed to encrypt the session recording chunk.",
                    "AES-256-GCM encryption failed.",
                )
            })?;

        let envelope = ChunkEnvelope {
            index: self.current_file.chunk_index + 1,
            nonce: STANDARD.encode(nonce),
            ciphertext: STANDARD.encode(ciphertext),
        };
        let mut line = serde_json::to_vec(&envelope).map_err(|error| {
            AppError::internal(
                "Failed to encode the session recording chunk.",
                error.to_string(),
            )
        })?;
        line.push(b'\n');

        if self.current_file.chunk_index > 0
            && self.current_file.size_bytes + line.len() as u64 > max_file_size_bytes(&self.settings)
        {
            self.rotate_file()?;
        }

        self.current_file.writer.write_all(&line).map_err(|error| {
            AppError::internal(
                "Failed to append the session recording chunk.",
                error.to_string(),
            )
        })?;
        self.current_file.writer.flush().map_err(|error| {
            AppError::internal(
                "Failed to flush the session recording chunk.",
                error.to_string(),
            )
        })?;
        self.current_file.chunk_index += 1;
        self.current_file.size_bytes += line.len() as u64;

        if self.current_file.size_bytes >= max_file_size_bytes(&self.settings) {
            self.rotate_file()?;
        }

        cleanup_storage(&self.logs_dir, &self.settings)
    }

    fn rotate_file(&mut self) -> AppResult<()> {
        self.current_file.writer.flush().map_err(|error| {
            AppError::internal(
                "Failed to rotate the session recording file.",
                error.to_string(),
            )
        })?;
        let next_part = self.current_file.part + 1;
        self.current_file = open_log_file(
            &self.logs_dir,
            &self.base_name,
            next_part,
            self.host.clone(),
            self.username.clone(),
            self.settings.mode.clone(),
            self.created_at.clone(),
            &self.password,
        )?;
        Ok(())
    }
}

#[derive(Debug)]
struct DecodedLogFile {
    info: SessionLogFileInfo,
    chunks: Vec<String>,
}

fn open_log_file(
    logs_dir: &Path,
    base_name: &str,
    part: u32,
    host: String,
    username: String,
    recording_mode: SessionRecordingMode,
    created_at: String,
    password: &str,
) -> AppResult<ActiveLogFile> {
    let file_name = if part == 1 {
        format!("{base_name}.irlog")
    } else {
        format!("{base_name}_part{:02}.irlog", part)
    };
    let path = logs_dir.join(file_name);
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)
        .map_err(|error| {
            AppError::internal(
                "Failed to create the session recording file.",
                error.to_string(),
            )
        })?;
    let mut writer = BufWriter::new(file);

    let mut salt = [0_u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    let key = derive_key(password, &salt)?;
    let metadata = LogMetadata {
        version: 1,
        host,
        username,
        recording_mode,
        created_at,
        part,
        compression: "zstd".into(),
        cipher: "aes-256-gcm".into(),
        kdf: "argon2".into(),
        salt: STANDARD.encode(salt),
    };

    let metadata_line = serde_json::to_vec(&metadata).map_err(|error| {
        AppError::internal(
            "Failed to encode the session recording metadata.",
            error.to_string(),
        )
    })?;

    writer.write_all(FILE_MAGIC.as_bytes()).map_err(|error| {
        AppError::internal(
            "Failed to initialize the session recording file.",
            error.to_string(),
        )
    })?;
    writer.write_all(b"\n").map_err(|error| {
        AppError::internal(
            "Failed to initialize the session recording file.",
            error.to_string(),
        )
    })?;
    writer.write_all(&metadata_line).map_err(|error| {
        AppError::internal(
            "Failed to initialize the session recording file.",
            error.to_string(),
        )
    })?;
    writer.write_all(b"\n").map_err(|error| {
        AppError::internal(
            "Failed to initialize the session recording file.",
            error.to_string(),
        )
    })?;
    writer.flush().map_err(|error| {
        AppError::internal(
            "Failed to initialize the session recording file.",
            error.to_string(),
        )
    })?;

    Ok(ActiveLogFile {
        writer,
        size_bytes: (FILE_MAGIC.len() + 1 + metadata_line.len() + 1) as u64,
        chunk_index: 0,
        key,
        part,
    })
}

fn read_log_file(path: &str, password: &str) -> AppResult<DecodedLogFile> {
    let file = File::open(path).map_err(|error| {
        AppError::internal("Failed to open the selected session log file.", error.to_string())
    })?;
    let mut reader = BufReader::new(file);

    let mut magic = String::new();
    reader.read_line(&mut magic).map_err(|error| {
        AppError::internal("Failed to read the session log header.", error.to_string())
    })?;
    if magic.trim_end_matches(['\r', '\n']) != FILE_MAGIC {
        return Err(AppError::validation("The selected file is not a supported .irlog file."));
    }

    let mut metadata_line = String::new();
    reader.read_line(&mut metadata_line).map_err(|error| {
        AppError::internal("Failed to read the session log metadata.", error.to_string())
    })?;
    let metadata: LogMetadata = serde_json::from_str(metadata_line.trim_end()).map_err(|error| {
        AppError::validation(format!("Failed to parse the session log metadata: {error}"))
    })?;

    let salt = STANDARD
        .decode(metadata.salt.as_bytes())
        .map_err(|error| AppError::validation(format!("Invalid session log salt: {error}")))?;
    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).expect("fixed-length session recording key");

    let mut chunks = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|error| {
            AppError::internal("Failed to read the session log data.", error.to_string())
        })?;
        if line.trim().is_empty() {
            continue;
        }

        let envelope: ChunkEnvelope = serde_json::from_str(&line).map_err(|error| {
            AppError::validation(format!("Failed to parse a session log chunk: {error}"))
        })?;
        let nonce = STANDARD.decode(envelope.nonce.as_bytes()).map_err(|error| {
            AppError::validation(format!("Invalid session log nonce encoding: {error}"))
        })?;
        let ciphertext = STANDARD
            .decode(envelope.ciphertext.as_bytes())
            .map_err(|error| {
                AppError::validation(format!(
                    "Invalid session log ciphertext encoding: {error}"
                ))
            })?;

        let decrypted = cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| {
                AppError::validation(
                    "Failed to decrypt the selected session logs. Check the encryption password.",
                )
            })?;
        let chunk = zstd::stream::decode_all(Cursor::new(decrypted)).map_err(|error| {
            AppError::validation(format!("Failed to decompress the session log chunk: {error}"))
        })?;
        chunks.push(String::from_utf8(chunk).map_err(|error| {
            AppError::validation(format!("Invalid UTF-8 session log content: {error}"))
        })?);
    }

    let file_name = Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string();

    Ok(DecodedLogFile {
        info: SessionLogFileInfo {
            file_name,
            path: path.to_string(),
            created_at: metadata.created_at,
            host: metadata.host,
            username: metadata.username,
            recording_mode: metadata.recording_mode,
            part: metadata.part,
        },
        chunks,
    })
}

fn derive_key(password: &str, salt: &[u8]) -> AppResult<[u8; 32]> {
    let mut key = [0_u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|error| {
            AppError::internal(
                "Failed to derive the session recording encryption key.",
                error.to_string(),
            )
        })?;
    Ok(key)
}

fn normalize_password(password: Option<String>) -> Option<String> {
    password
        .map(|value| value.trim().to_string())
        .filter(|value| value.len() >= 8)
}

fn sanitize_file_name_component(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        "session".into()
    } else {
        sanitized
    }
}

fn resolve_logs_dir(default_logs_dir: &Path, settings: &SessionRecordingSettings) -> PathBuf {
    settings
        .log_directory
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_logs_dir.to_path_buf())
}

fn max_file_size_bytes(settings: &SessionRecordingSettings) -> u64 {
    u64::from(settings.max_file_size_mb) * 1_024 * 1_024
}

fn max_total_storage_bytes(settings: &SessionRecordingSettings) -> u64 {
    u64::from(settings.max_total_storage_gb) * 1_024 * 1_024 * 1_024
}

fn sorted_paths(paths: Vec<String>) -> Vec<String> {
    let mut sorted = paths;
    sorted.sort_by_key(|path| path.to_ascii_lowercase());
    sorted
}

fn prefix_by_bytes<'a>(value: &'a str, max_bytes: usize) -> &'a str {
    if value.len() <= max_bytes {
        return value;
    }

    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

fn nearest_utf8_boundary(value: &[u8], max_bytes: usize) -> usize {
    let mut end = max_bytes.min(value.len());
    while end > 0 && std::str::from_utf8(&value[..end]).is_err() {
        end -= 1;
    }
    end.max(1)
}

fn cleanup_storage(logs_dir: &Path, settings: &SessionRecordingSettings) -> AppResult<()> {
    fs::create_dir_all(logs_dir).map_err(|error| {
        AppError::internal(
            "Failed to initialize the session log directory.",
            error.to_string(),
        )
    })?;

    let mut files = existing_log_files(logs_dir)?;
    let cutoff = Utc::now() - ChronoDuration::days(i64::from(settings.retention_days));

    for file in &files {
        let modified_at: DateTime<Utc> = file.modified_at.into();
        if modified_at < cutoff {
            let _ = fs::remove_file(&file.path);
        }
    }

    files = existing_log_files(logs_dir)?;
    files.sort_by_key(|file| file.modified_at);

    let mut total_size = files.iter().map(|file| file.size_bytes).sum::<u64>();
    for file in files {
        if total_size <= max_total_storage_bytes(settings) {
            break;
        }

        fs::remove_file(&file.path).map_err(|error| {
            AppError::internal(
                "Failed to remove an expired session recording file.",
                error.to_string(),
            )
        })?;
        total_size = total_size.saturating_sub(file.size_bytes);
    }

    Ok(())
}

fn storage_usage_bytes(logs_dir: &Path) -> AppResult<u64> {
    Ok(existing_log_files(logs_dir)?
        .into_iter()
        .map(|file| file.size_bytes)
        .sum())
}

fn existing_log_files(logs_dir: &Path) -> AppResult<Vec<ExistingLogFile>> {
    let mut files = Vec::new();
    for entry in fs::read_dir(logs_dir).map_err(|error| {
        AppError::internal(
            "Failed to read the session log directory.",
            error.to_string(),
        )
    })? {
        let entry = entry.map_err(|error| {
            AppError::internal(
                "Failed to inspect a session log file.",
                error.to_string(),
            )
        })?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("irlog") {
            continue;
        }

        let metadata = entry.metadata().map_err(|error| {
            AppError::internal(
                "Failed to inspect a session log file.",
                error.to_string(),
            )
        })?;
        files.push(ExistingLogFile {
            path,
            size_bytes: metadata.len(),
            modified_at: metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
        });
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::{existing_log_files, RecordingManager, SessionRecorder};
    use crate::models::{ConnectionRecord, SessionRecordingMode, SessionRecordingSettings};
    use std::env;
    use uuid::Uuid;

    fn test_connection() -> ConnectionRecord {
        ConnectionRecord {
            id: "connection-1".into(),
            name: "Server".into(),
            group_name: None,
            host: "example.com".into(),
            port: 22,
            username: "root".into(),
            has_password: false,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        }
    }

    fn temp_logs_dir() -> std::path::PathBuf {
        env::temp_dir().join(format!("iridium-remote-recording-test-{}", Uuid::new_v4()))
    }

    #[test]
    fn input_only_recording_omits_suppressed_input() {
        let logs_dir = temp_logs_dir();
        let settings = SessionRecordingSettings {
            enabled: true,
            mode: SessionRecordingMode::InputOnly,
            max_file_size_mb: 100,
            max_total_storage_gb: 5,
            retention_days: 30,
            log_directory: None,
        };
        let manager = RecordingManager::new(logs_dir.clone(), settings.clone()).expect("manager");
        manager
            .update_settings(settings, Some("super-secret".into()))
            .expect("settings update");

        let mut recorder = manager
            .start_session(&test_connection())
            .expect("session start")
            .expect("active recorder");
        recorder.record_input("ls").expect("record input");
        recorder.record_input("\r").expect("record input");
        recorder.suppress_input_until_submit();
        recorder.record_input("hidden-password").expect("record input");
        recorder.record_input("\r").expect("record input");
        recorder.record_input("pwd\r").expect("record input");
        recorder.finish().expect("finish");

        let paths = existing_log_files(&logs_dir)
            .expect("list files")
            .into_iter()
            .map(|file| file.path.display().to_string())
            .collect::<Vec<_>>();
        let preview = manager
            .preview_logs(paths, "super-secret".into())
            .expect("preview");

        assert_eq!(preview.preview_text, "ls\npwd\n");

        let _ = std::fs::remove_dir_all(logs_dir);
    }

    #[test]
    fn full_recording_round_trips_visible_output() {
        let logs_dir = temp_logs_dir();
        let mut recorder = SessionRecorder::new(
            logs_dir.clone(),
            SessionRecordingSettings {
                enabled: true,
                mode: SessionRecordingMode::Full,
                max_file_size_mb: 100,
                max_total_storage_gb: 5,
                retention_days: 30,
                log_directory: None,
            },
            "super-secret".into(),
            &test_connection(),
        )
        .expect("recorder");
        recorder
            .record_output("\u{1b}[32mroot@example.com\u{1b}[0m$ ls\r\nfile.txt\r\n")
            .expect("record output");
        recorder.finish().expect("finish");

        let manager = RecordingManager::new(logs_dir.clone(), SessionRecordingSettings::default())
            .expect("manager");
        let paths = existing_log_files(&logs_dir)
            .expect("list files")
            .into_iter()
            .map(|file| file.path.display().to_string())
            .collect::<Vec<_>>();
        let preview = manager
            .preview_logs(paths, "super-secret".into())
            .expect("preview");

        assert_eq!(preview.preview_text, "root@example.com$ ls\nfile.txt\n");

        let _ = std::fs::remove_dir_all(logs_dir);
    }
}
