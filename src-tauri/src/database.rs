use std::{collections::HashSet, path::PathBuf};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    models::{
        AppSettings, ConnectionExportRecord, ConnectionRecord, ConnectionsExportPayload,
        CreateConnectionInput, ImportConnectionsResult, SessionRecordingSettings,
        UpdateConnectionInput,
    },
};

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn initialize(&self) -> AppResult<()> {
        let connection = self.connect()?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS connections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    group_name TEXT,
                    host TEXT NOT NULL,
                    port INTEGER NOT NULL DEFAULT 22,
                    username TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );",
            )
            .map_err(|error| {
                AppError::database("Failed to initialize the database.", error.to_string())
            })?;

        if !Self::has_column(&connection, "connections", "group_name")? {
            connection
                .execute("ALTER TABLE connections ADD COLUMN group_name TEXT", [])
                .map_err(|error| {
                    AppError::database("Failed to update the database schema.", error.to_string())
                })?;
        }
        Self::normalize_stored_group_names(&connection)?;
        Ok(())
    }

    pub fn get_app_settings(&self) -> AppResult<AppSettings> {
        let connection = self.connect()?;
        let raw = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'app'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| {
                AppError::database("Failed to load app settings.", error.to_string())
            })?;

        match raw {
            Some(value) => {
                let settings = serde_json::from_str::<AppSettings>(&value).map_err(|error| {
                    AppError::database("Failed to decode app settings.", error.to_string())
                })?;
                normalize_app_settings(settings)
            }
            None => Ok(AppSettings::default()),
        }
    }

    pub fn set_app_settings(&self, settings: &AppSettings) -> AppResult<AppSettings> {
        let normalized = normalize_app_settings(settings.clone())?;
        let payload = serde_json::to_string(&normalized).map_err(|error| {
            AppError::database("Failed to encode app settings.", error.to_string())
        })?;
        let connection = self.connect()?;

        connection
            .execute(
                "INSERT INTO app_settings (key, value) VALUES ('app', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [payload],
            )
            .map_err(|error| {
                AppError::database("Failed to save app settings.", error.to_string())
            })?;

        Ok(normalized)
    }

    pub fn list_connections(&self) -> AppResult<Vec<ConnectionRecord>> {
        let connection = self.connect()?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, group_name, host, port, username, created_at, updated_at
                 FROM connections
                 ORDER BY
                   CASE
                     WHEN group_name IS NULL OR trim(group_name) = '' THEN 1
                     ELSE 0
                   END,
                   lower(COALESCE(group_name, '')),
                   lower(name),
                   lower(host),
                   port,
                   lower(username)",
            )
            .map_err(|error| {
                AppError::database("Failed to list connections.", error.to_string())
            })?;

        let rows = statement
            .query_map([], Self::map_connection)
            .map_err(|error| {
                AppError::database("Failed to read connection rows.", error.to_string())
            })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|error| {
            AppError::database("Failed to decode connection rows.", error.to_string())
        })
    }

    pub fn get_connection(&self, id: &str) -> AppResult<ConnectionRecord> {
        let connection = self.connect()?;
        let record = connection
            .query_row(
                "SELECT id, name, group_name, host, port, username, created_at, updated_at
                 FROM connections
                 WHERE id = ?1",
                [id],
                Self::map_connection,
            )
            .optional()
            .map_err(|error| {
                AppError::database("Failed to load the connection.", error.to_string())
            })?;

        record.ok_or_else(|| AppError::not_found("Connection not found."))
    }

    pub fn create_connection(&self, input: CreateConnectionInput) -> AppResult<ConnectionRecord> {
        let normalized = normalize_input(
            &input.name,
            input.group_name.as_deref(),
            &input.host,
            input.port.unwrap_or(22),
            &input.username,
        )?;
        let connection = self.connect()?;
        let now = Utc::now().to_rfc3339();
        let record = ConnectionRecord {
            id: Uuid::new_v4().to_string(),
            name: normalized.name,
            group_name: normalized.group_name,
            host: normalized.host,
            port: normalized.port,
            username: normalized.username,
            has_password: false,
            created_at: now.clone(),
            updated_at: now,
        };

        connection
            .execute(
                "INSERT INTO connections (id, name, group_name, host, port, username, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    &record.id,
                    &record.name,
                    &record.group_name,
                    &record.host,
                    i64::from(record.port),
                    &record.username,
                    &record.created_at,
                    &record.updated_at
                ],
            )
            .map_err(|error| AppError::database("Failed to create the connection.", error.to_string()))?;

        Ok(record)
    }

    pub fn update_connection(&self, input: UpdateConnectionInput) -> AppResult<ConnectionRecord> {
        let existing = self.get_connection(&input.id)?;
        let normalized = normalize_input(
            &input.name,
            input.group_name.as_deref(),
            &input.host,
            input.port,
            &input.username,
        )?;
        let connection = self.connect()?;
        let updated = ConnectionRecord {
            id: existing.id,
            name: normalized.name,
            group_name: normalized.group_name,
            host: normalized.host,
            port: normalized.port,
            username: normalized.username,
            has_password: existing.has_password,
            created_at: existing.created_at,
            updated_at: Utc::now().to_rfc3339(),
        };

        connection
            .execute(
                "UPDATE connections
                 SET name = ?2, group_name = ?3, host = ?4, port = ?5, username = ?6, updated_at = ?7
                 WHERE id = ?1",
                params![
                    &updated.id,
                    &updated.name,
                    &updated.group_name,
                    &updated.host,
                    i64::from(updated.port),
                    &updated.username,
                    &updated.updated_at
                ],
            )
            .map_err(|error| AppError::database("Failed to update the connection.", error.to_string()))?;

        Ok(updated)
    }

    pub fn delete_connection(&self, id: &str) -> AppResult<ConnectionRecord> {
        let existing = self.get_connection(id)?;
        let connection = self.connect()?;
        connection
            .execute("DELETE FROM connections WHERE id = ?1", [id])
            .map_err(|error| {
                AppError::database("Failed to delete the connection.", error.to_string())
            })?;
        Ok(existing)
    }

    pub fn export_connections(&self) -> AppResult<ConnectionsExportPayload> {
        let connections = self.list_connections()?;
        Ok(ConnectionsExportPayload {
            version: 1,
            exported_at: Utc::now().to_rfc3339(),
            settings: Some(self.get_app_settings()?),
            connections: connections
                .into_iter()
                .map(|connection| ConnectionExportRecord {
                    name: connection.name,
                    group_name: connection.group_name,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                })
                .collect(),
        })
    }

    pub fn import_connections(
        &self,
        payload: ConnectionsExportPayload,
    ) -> AppResult<ImportConnectionsResult> {
        let ConnectionsExportPayload {
            settings,
            connections,
            ..
        } = payload;
        let mut signatures = self
            .list_connections()?
            .into_iter()
            .map(connection_signature)
            .collect::<HashSet<_>>();

        let mut connection = self.connect()?;
        let transaction = connection.transaction().map_err(|error| {
            AppError::database("Failed to start the import transaction.", error.to_string())
        })?;

        let normalized_settings = settings.map(normalize_app_settings).transpose()?;
        let settings_applied = normalized_settings.is_some();

        if let Some(settings) = normalized_settings {
            let payload = serde_json::to_string(&settings).map_err(|error| {
                AppError::database("Failed to encode app settings.", error.to_string())
            })?;

            transaction
                .execute(
                    "INSERT INTO app_settings (key, value) VALUES ('app', ?1)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [payload],
                )
                .map_err(|error| {
                    AppError::database("Failed to import app settings.", error.to_string())
                })?;
        }

        let mut imported = 0;
        let mut skipped = 0;

        for entry in connections {
            let normalized = normalize_input(
                &entry.name,
                entry.group_name.as_deref(),
                &entry.host,
                entry.port,
                &entry.username,
            )?;

            let signature = normalized_signature(&normalized);
            if signatures.contains(&signature) {
                skipped += 1;
                continue;
            }

            let now = Utc::now().to_rfc3339();
            transaction
                .execute(
                    "INSERT INTO connections (id, name, group_name, host, port, username, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        Uuid::new_v4().to_string(),
                        normalized.name,
                        normalized.group_name,
                        normalized.host,
                        i64::from(normalized.port),
                        normalized.username,
                        &now,
                        &now
                    ],
                )
                .map_err(|error| AppError::database("Failed to import a connection.", error.to_string()))?;

            signatures.insert(signature);
            imported += 1;
        }

        transaction.commit().map_err(|error| {
            AppError::database(
                "Failed to finish the import transaction.",
                error.to_string(),
            )
        })?;

        Ok(ImportConnectionsResult {
            imported,
            skipped,
            settings_applied,
        })
    }

    fn connect(&self) -> AppResult<Connection> {
        Connection::open(&self.path)
            .map_err(|error| AppError::database("Failed to open the database.", error.to_string()))
    }

    fn map_connection(row: &Row<'_>) -> rusqlite::Result<ConnectionRecord> {
        Ok(ConnectionRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            group_name: row.get(2)?,
            host: row.get(3)?,
            port: row.get(4)?,
            username: row.get(5)?,
            has_password: false,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }

    fn has_column(connection: &Connection, table_name: &str, column_name: &str) -> AppResult<bool> {
        let mut statement = connection
            .prepare(&format!("PRAGMA table_info({table_name})"))
            .map_err(|error| {
                AppError::database("Failed to inspect the database schema.", error.to_string())
            })?;

        let mut rows = statement.query([]).map_err(|error| {
            AppError::database("Failed to read database schema details.", error.to_string())
        })?;

        while let Some(row) = rows.next().map_err(|error| {
            AppError::database("Failed to read database schema row.", error.to_string())
        })? {
            let existing: String = row.get(1).map_err(|error| {
                AppError::database("Failed to decode schema column.", error.to_string())
            })?;
            if existing == column_name {
                return Ok(true);
            }
        }

        Ok(false)
    }

    fn normalize_stored_group_names(connection: &Connection) -> AppResult<()> {
        let mut statement = connection
            .prepare("SELECT id, group_name FROM connections WHERE group_name IS NOT NULL")
            .map_err(|error| {
                AppError::database("Failed to prepare group normalization.", error.to_string())
            })?;

        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .map_err(|error| {
                AppError::database("Failed to load stored groups.", error.to_string())
            })?;

        let updates = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| {
                AppError::database("Failed to decode stored groups.", error.to_string())
            })?
            .into_iter()
            .filter_map(|(id, group_name)| {
                let normalized = normalize_group_name(group_name.as_deref());
                (normalized != group_name).then_some((id, normalized))
            })
            .collect::<Vec<_>>();

        for (id, group_name) in updates {
            connection
                .execute(
                    "UPDATE connections SET group_name = ?2 WHERE id = ?1",
                    params![id, group_name],
                )
                .map_err(|error| {
                    AppError::database(
                        "Failed to normalize a stored group name.",
                        error.to_string(),
                    )
                })?;
        }

        Ok(())
    }
}

struct NormalizedConnectionInput {
    name: String,
    group_name: Option<String>,
    host: String,
    port: u16,
    username: String,
}

fn normalize_input(
    name: &str,
    group_name: Option<&str>,
    host: &str,
    port: u16,
    username: &str,
) -> AppResult<NormalizedConnectionInput> {
    let name = name.trim();
    let group_name = normalize_group_name(group_name);
    let host = host.trim();
    let username = username.trim();

    if name.is_empty() || host.is_empty() || username.is_empty() {
        return Err(AppError::validation(
            "Name, host, and username are required.",
        ));
    }

    if port == 0 {
        return Err(AppError::validation("Port must be a valid TCP port."));
    }

    Ok(NormalizedConnectionInput {
        name: name.to_string(),
        group_name,
        host: host.to_string(),
        port,
        username: username.to_string(),
    })
}

fn normalize_app_settings(settings: AppSettings) -> AppResult<AppSettings> {
    let locale = match settings.locale.as_str() {
        "en" => "en",
        "zh-CN" => "zh-CN",
        "zh-TW" => "zh-TW",
        _ => return Err(AppError::validation("Unsupported locale setting.")),
    };

    let theme = match settings.theme.as_str() {
        "dark" => "dark",
        "light" => "light",
        _ => return Err(AppError::validation("Unsupported theme setting.")),
    };

    let mut collapsed_groups = settings
        .collapsed_groups
        .into_iter()
        .filter_map(|value| normalize_group_name(Some(value.as_str())))
        .collect::<Vec<_>>();
    collapsed_groups.sort();
    collapsed_groups.dedup();

    Ok(AppSettings {
        locale: locale.into(),
        theme: theme.into(),
        connection_list_display_mode: settings.connection_list_display_mode,
        collapsed_groups,
        session_recording: normalize_session_recording_settings(settings.session_recording)?,
    })
}

fn normalize_session_recording_settings(
    settings: SessionRecordingSettings,
) -> AppResult<SessionRecordingSettings> {
    if settings.max_file_size_mb == 0 {
        return Err(AppError::validation(
            "Session recording max file size must be greater than 0 MB.",
        ));
    }

    if settings.max_total_storage_gb == 0 {
        return Err(AppError::validation(
            "Session recording max total storage must be greater than 0 GB.",
        ));
    }

    if settings.retention_days == 0 {
        return Err(AppError::validation(
            "Session recording retention must be greater than 0 days.",
        ));
    }

    Ok(SessionRecordingSettings {
        log_directory: settings
            .log_directory
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        ..settings
    })
}

fn connection_signature(connection: ConnectionRecord) -> String {
    let normalized = NormalizedConnectionInput {
        name: connection.name,
        group_name: connection.group_name,
        host: connection.host,
        port: connection.port,
        username: connection.username,
    };

    normalized_signature(&normalized)
}

fn normalized_signature(connection: &NormalizedConnectionInput) -> String {
    format!(
        "{}|{}|{}|{}|{}",
        connection.group_name.as_deref().unwrap_or(""),
        connection.name.to_ascii_lowercase(),
        connection.host.to_ascii_lowercase(),
        connection.port,
        connection.username.to_ascii_lowercase()
    )
}

fn normalize_group_name(group_name: Option<&str>) -> Option<String> {
    group_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(title_case)
}

fn title_case(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut should_uppercase = true;

    for character in value.chars() {
        if should_uppercase {
            normalized.extend(character.to_uppercase());
        } else {
            normalized.extend(character.to_lowercase());
        }

        should_uppercase = is_group_word_separator(character);
    }

    normalized
}

fn is_group_word_separator(character: char) -> bool {
    character.is_whitespace()
        || matches!(
            character,
            '-' | '_' | '/' | '\\' | '(' | ')' | '[' | ']' | '{' | '}' | '.' | ','
        )
}

#[cfg(test)]
mod tests {
    use super::{normalize_app_settings, normalize_group_name};
    use crate::models::{
        AppSettings, ConnectionListDisplayMode, SessionRecordingMode, SessionRecordingSettings,
    };

    #[test]
    fn normalize_group_name_merges_case_variants() {
        assert_eq!(normalize_group_name(Some("home")), Some("Home".into()));
        assert_eq!(
            normalize_group_name(Some("HOME OFFICE")),
            Some("Home Office".into())
        );
    }

    #[test]
    fn normalize_app_settings_canonicalizes_collapsed_groups() {
        let settings = AppSettings {
            locale: "en".into(),
            theme: "dark".into(),
            connection_list_display_mode: ConnectionListDisplayMode::Normal,
            collapsed_groups: vec!["home".into(), "Home".into(), "Work".into()],
            session_recording: SessionRecordingSettings::default(),
        };

        let normalized = normalize_app_settings(settings).expect("settings should normalize");

        assert_eq!(normalized.collapsed_groups, vec!["Home", "Work"]);
    }

    #[test]
    fn normalize_app_settings_keeps_session_recording_defaults() {
        let settings = AppSettings {
            locale: "en".into(),
            theme: "dark".into(),
            connection_list_display_mode: ConnectionListDisplayMode::Normal,
            collapsed_groups: Vec::new(),
            session_recording: SessionRecordingSettings {
                enabled: true,
                mode: SessionRecordingMode::Full,
                max_file_size_mb: 100,
                max_total_storage_gb: 5,
                retention_days: 30,
                log_directory: None,
            },
        };

        let normalized = normalize_app_settings(settings).expect("settings should normalize");

        assert!(normalized.session_recording.enabled);
        assert_eq!(normalized.session_recording.mode, SessionRecordingMode::Full);
    }
}
