use std::{collections::HashSet, path::PathBuf};

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    models::{
        AppSettings, ConnectionExportRecord, ConnectionHistoryCloseStatus,
        ConnectionHistoryDateRange, ConnectionHistoryDurationBucket,
        ConnectionHistoryDurationBucketKind, ConnectionHistoryHostDetails,
        ConnectionHistoryHostSummary, ConnectionHistoryOverview, ConnectionHistorySessionRecord,
        ConnectionRecord, ConnectionsExportPayload, CreateConnectionInput, ImportConnectionsResult,
        SessionRecordingSettings, UpdateConnectionInput,
    },
};

const CONNECTION_HISTORY_DETAIL_RETENTION_DAYS: i64 = 365;

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
                );
                CREATE TABLE IF NOT EXISTS connection_history_sessions (
                    id TEXT PRIMARY KEY,
                    history_key TEXT NOT NULL,
                    connection_id TEXT,
                    connection_name_snapshot TEXT NOT NULL,
                    host_snapshot TEXT NOT NULL,
                    port_snapshot INTEGER NOT NULL,
                    username_snapshot TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    last_activity_at TEXT,
                    ended_at TEXT,
                    duration_seconds INTEGER,
                    close_status TEXT NOT NULL,
                    is_estimated INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_connection_history_sessions_history_key_started_at
                    ON connection_history_sessions (history_key, started_at DESC);
                CREATE INDEX IF NOT EXISTS idx_connection_history_sessions_connection_id_started_at
                    ON connection_history_sessions (connection_id, started_at DESC);
                CREATE INDEX IF NOT EXISTS idx_connection_history_sessions_ended_at
                    ON connection_history_sessions (ended_at);
                CREATE TABLE IF NOT EXISTS connection_history_rollups (
                    id TEXT PRIMARY KEY,
                    history_key TEXT NOT NULL,
                    connection_id TEXT,
                    connection_name_snapshot TEXT NOT NULL,
                    host_snapshot TEXT NOT NULL,
                    port_snapshot INTEGER NOT NULL,
                    username_snapshot TEXT NOT NULL,
                    bucket_month TEXT NOT NULL,
                    session_count INTEGER NOT NULL,
                    total_duration_seconds INTEGER NOT NULL,
                    latest_started_at TEXT,
                    under_5_minutes_count INTEGER NOT NULL DEFAULT 0,
                    between_5_and_30_minutes_count INTEGER NOT NULL DEFAULT 0,
                    between_30_minutes_and_2_hours_count INTEGER NOT NULL DEFAULT 0,
                    over_2_hours_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(history_key, bucket_month)
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

    pub fn start_connection_history_session(
        &self,
        connection: &ConnectionRecord,
    ) -> AppResult<String> {
        let db_connection = self.connect()?;
        let now = Utc::now().to_rfc3339();
        let session_id = Uuid::new_v4().to_string();

        db_connection
            .execute(
                "INSERT INTO connection_history_sessions (
                    id,
                    history_key,
                    connection_id,
                    connection_name_snapshot,
                    host_snapshot,
                    port_snapshot,
                    username_snapshot,
                    started_at,
                    last_activity_at,
                    ended_at,
                    duration_seconds,
                    close_status,
                    is_estimated,
                    created_at,
                    updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, NULL, ?10, 0, ?11, ?12)",
                params![
                    &session_id,
                    history_subject_key(connection),
                    &connection.id,
                    &connection.name,
                    &connection.host,
                    i64::from(connection.port),
                    &connection.username,
                    &now,
                    &now,
                    history_close_status_to_db(&ConnectionHistoryCloseStatus::Abnormal),
                    &now,
                    &now
                ],
            )
            .map_err(|error| {
                AppError::database(
                    "Failed to start the connection history session.",
                    error.to_string(),
                )
            })?;

        Ok(session_id)
    }

    pub fn touch_connection_history_session(&self, session_id: &str) -> AppResult<()> {
        let connection = self.connect()?;
        let now = Utc::now().to_rfc3339();
        connection
            .execute(
                "UPDATE connection_history_sessions
                 SET last_activity_at = ?2, updated_at = ?2
                 WHERE id = ?1 AND ended_at IS NULL",
                params![session_id, &now],
            )
            .map_err(|error| {
                AppError::database(
                    "Failed to update the connection history activity timestamp.",
                    error.to_string(),
                )
            })?;
        Ok(())
    }

    pub fn finish_connection_history_session(
        &self,
        session_id: &str,
        close_status: ConnectionHistoryCloseStatus,
        is_estimated: bool,
    ) -> AppResult<()> {
        let connection = self.connect()?;
        let pending = connection
            .query_row(
                "SELECT started_at FROM connection_history_sessions WHERE id = ?1 AND ended_at IS NULL",
                [session_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| {
                AppError::database(
                    "Failed to load the connection history session.",
                    error.to_string(),
                )
            })?;

        let Some(started_at) = pending else {
            return Ok(());
        };

        let ended_at = Utc::now().to_rfc3339();
        let duration_seconds = duration_seconds_between(&started_at, &ended_at)?;
        connection
            .execute(
                "UPDATE connection_history_sessions
                 SET ended_at = ?2,
                     duration_seconds = ?3,
                     close_status = ?4,
                     is_estimated = ?5,
                     updated_at = ?2
                 WHERE id = ?1",
                params![
                    session_id,
                    &ended_at,
                    duration_seconds as i64,
                    history_close_status_to_db(&close_status),
                    if is_estimated { 1_i64 } else { 0_i64 }
                ],
            )
            .map_err(|error| {
                AppError::database(
                    "Failed to finish the connection history session.",
                    error.to_string(),
                )
            })?;
        Ok(())
    }

    pub fn recover_connection_history_sessions(&self) -> AppResult<usize> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction().map_err(|error| {
            AppError::database(
                "Failed to start the connection history recovery transaction.",
                error.to_string(),
            )
        })?;

        let mut statement = transaction
            .prepare(
                "SELECT id, started_at, last_activity_at
                 FROM connection_history_sessions
                 WHERE ended_at IS NULL",
            )
            .map_err(|error| {
                AppError::database(
                    "Failed to prepare unfinished connection history recovery.",
                    error.to_string(),
                )
            })?;

        let rows = statement
            .query_map([], |row| {
                Ok(UnfinishedHistorySession {
                    id: row.get(0)?,
                    started_at: row.get(1)?,
                    last_activity_at: row.get(2)?,
                })
            })
            .map_err(|error| {
                AppError::database(
                    "Failed to load unfinished connection history sessions.",
                    error.to_string(),
                )
            })?;

        let recovered = rows.collect::<Result<Vec<_>, _>>().map_err(|error| {
            AppError::database(
                "Failed to decode unfinished connection history sessions.",
                error.to_string(),
            )
        })?;

        drop(statement);

        for session in &recovered {
            let ended_at = session
                .last_activity_at
                .as_deref()
                .unwrap_or(session.started_at.as_str())
                .to_string();
            let duration_seconds = duration_seconds_between(&session.started_at, &ended_at)?;

            transaction
                .execute(
                    "UPDATE connection_history_sessions
                     SET ended_at = ?2,
                         duration_seconds = ?3,
                         close_status = 'abnormal',
                         is_estimated = 1,
                         updated_at = ?2
                     WHERE id = ?1",
                    params![&session.id, &ended_at, duration_seconds as i64],
                )
                .map_err(|error| {
                    AppError::database(
                        "Failed to recover an unfinished connection history session.",
                        error.to_string(),
                    )
                })?;
        }

        transaction.commit().map_err(|error| {
            AppError::database(
                "Failed to commit the connection history recovery transaction.",
                error.to_string(),
            )
        })?;

        Ok(recovered.len())
    }

    pub fn cleanup_connection_history(&self) -> AppResult<()> {
        let cutoff = (Utc::now() - ChronoDuration::days(CONNECTION_HISTORY_DETAIL_RETENTION_DAYS))
            .to_rfc3339();
        let mut connection = self.connect()?;
        let transaction = connection.transaction().map_err(|error| {
            AppError::database(
                "Failed to start the connection history cleanup transaction.",
                error.to_string(),
            )
        })?;

        let mut statement = transaction
            .prepare(
                "SELECT
                    history_key,
                    connection_id,
                    connection_name_snapshot,
                    host_snapshot,
                    port_snapshot,
                    username_snapshot,
                    substr(started_at, 1, 7) AS bucket_month,
                    COUNT(*) AS session_count,
                    COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
                    MAX(started_at) AS latest_started_at,
                    SUM(CASE WHEN duration_seconds < 300 THEN 1 ELSE 0 END) AS under_5_minutes_count,
                    SUM(CASE WHEN duration_seconds >= 300 AND duration_seconds < 1800 THEN 1 ELSE 0 END) AS between_5_and_30_minutes_count,
                    SUM(CASE WHEN duration_seconds >= 1800 AND duration_seconds < 7200 THEN 1 ELSE 0 END) AS between_30_minutes_and_2_hours_count,
                    SUM(CASE WHEN duration_seconds >= 7200 THEN 1 ELSE 0 END) AS over_2_hours_count
                 FROM connection_history_sessions
                 WHERE ended_at IS NOT NULL
                   AND started_at < ?1
                 GROUP BY
                    history_key,
                    connection_id,
                    connection_name_snapshot,
                    host_snapshot,
                    port_snapshot,
                    username_snapshot,
                    bucket_month",
            )
            .map_err(|error| {
                AppError::database(
                    "Failed to prepare the connection history cleanup query.",
                    error.to_string(),
                )
            })?;

        let rows = statement
            .query_map([&cutoff], |row| {
                Ok(HistoryRollupAccumulator {
                    history_key: row.get(0)?,
                    connection_id: row.get(1)?,
                    connection_name_snapshot: row.get(2)?,
                    host_snapshot: row.get(3)?,
                    port_snapshot: row.get::<_, u16>(4)?,
                    username_snapshot: row.get(5)?,
                    bucket_month: row.get(6)?,
                    session_count: row.get::<_, i64>(7)? as u64,
                    total_duration_seconds: row.get::<_, i64>(8)? as u64,
                    latest_started_at: row.get(9)?,
                    under_5_minutes_count: row.get::<_, i64>(10)? as u64,
                    between_5_and_30_minutes_count: row.get::<_, i64>(11)? as u64,
                    between_30_minutes_and_2_hours_count: row.get::<_, i64>(12)? as u64,
                    over_2_hours_count: row.get::<_, i64>(13)? as u64,
                })
            })
            .map_err(|error| {
                AppError::database(
                    "Failed to load connection history rows for cleanup.",
                    error.to_string(),
                )
            })?;

        let rollups = rows.collect::<Result<Vec<_>, _>>().map_err(|error| {
            AppError::database(
                "Failed to decode connection history cleanup rows.",
                error.to_string(),
            )
        })?;

        drop(statement);

        for rollup in &rollups {
            let now = Utc::now().to_rfc3339();
            transaction
                .execute(
                    "INSERT INTO connection_history_rollups (
                        id,
                        history_key,
                        connection_id,
                        connection_name_snapshot,
                        host_snapshot,
                        port_snapshot,
                        username_snapshot,
                        bucket_month,
                        session_count,
                        total_duration_seconds,
                        latest_started_at,
                        under_5_minutes_count,
                        between_5_and_30_minutes_count,
                        between_30_minutes_and_2_hours_count,
                        over_2_hours_count,
                        created_at,
                        updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
                     ON CONFLICT(history_key, bucket_month) DO UPDATE SET
                        connection_id = excluded.connection_id,
                        connection_name_snapshot = excluded.connection_name_snapshot,
                        host_snapshot = excluded.host_snapshot,
                        port_snapshot = excluded.port_snapshot,
                        username_snapshot = excluded.username_snapshot,
                        session_count = connection_history_rollups.session_count + excluded.session_count,
                        total_duration_seconds = connection_history_rollups.total_duration_seconds + excluded.total_duration_seconds,
                        latest_started_at = CASE
                            WHEN connection_history_rollups.latest_started_at IS NULL THEN excluded.latest_started_at
                            WHEN excluded.latest_started_at IS NULL THEN connection_history_rollups.latest_started_at
                            WHEN connection_history_rollups.latest_started_at >= excluded.latest_started_at THEN connection_history_rollups.latest_started_at
                            ELSE excluded.latest_started_at
                        END,
                        under_5_minutes_count = connection_history_rollups.under_5_minutes_count + excluded.under_5_minutes_count,
                        between_5_and_30_minutes_count = connection_history_rollups.between_5_and_30_minutes_count + excluded.between_5_and_30_minutes_count,
                        between_30_minutes_and_2_hours_count = connection_history_rollups.between_30_minutes_and_2_hours_count + excluded.between_30_minutes_and_2_hours_count,
                        over_2_hours_count = connection_history_rollups.over_2_hours_count + excluded.over_2_hours_count,
                        updated_at = excluded.updated_at",
                    params![
                        Uuid::new_v4().to_string(),
                        &rollup.history_key,
                        &rollup.connection_id,
                        &rollup.connection_name_snapshot,
                        &rollup.host_snapshot,
                        i64::from(rollup.port_snapshot),
                        &rollup.username_snapshot,
                        &rollup.bucket_month,
                        rollup.session_count as i64,
                        rollup.total_duration_seconds as i64,
                        &rollup.latest_started_at,
                        rollup.under_5_minutes_count as i64,
                        rollup.between_5_and_30_minutes_count as i64,
                        rollup.between_30_minutes_and_2_hours_count as i64,
                        rollup.over_2_hours_count as i64,
                        &now,
                        &now
                    ],
                )
                .map_err(|error| {
                    AppError::database(
                        "Failed to write a connection history rollup row.",
                        error.to_string(),
                    )
                })?;
        }

        transaction
            .execute(
                "DELETE FROM connection_history_sessions
                 WHERE ended_at IS NOT NULL
                   AND started_at < ?1",
                [&cutoff],
            )
            .map_err(|error| {
                AppError::database(
                    "Failed to delete trimmed connection history rows.",
                    error.to_string(),
                )
            })?;

        transaction.commit().map_err(|error| {
            AppError::database(
                "Failed to commit the connection history cleanup transaction.",
                error.to_string(),
            )
        })?;

        Ok(())
    }

    pub fn get_connection_history_overview(
        &self,
        range: ConnectionHistoryDateRange,
    ) -> AppResult<ConnectionHistoryOverview> {
        let current_connections = self
            .list_connections()?
            .into_iter()
            .map(|connection| (connection.id.clone(), connection))
            .collect::<std::collections::HashMap<_, _>>();
        let aggregates = self.aggregate_connection_history(&range)?;
        let mut hosts = aggregates
            .into_values()
            .map(|aggregate| aggregate.into_summary(&current_connections))
            .collect::<Vec<_>>();

        hosts.sort_by(|left, right| right.latest_connection_at.cmp(&left.latest_connection_at));

        Ok(ConnectionHistoryOverview { hosts })
    }

    pub fn get_connection_history_host_details(
        &self,
        history_key: &str,
        range: ConnectionHistoryDateRange,
    ) -> AppResult<ConnectionHistoryHostDetails> {
        let current_connections = self
            .list_connections()?
            .into_iter()
            .map(|connection| (connection.id.clone(), connection))
            .collect::<std::collections::HashMap<_, _>>();
        let aggregates = self.aggregate_connection_history(&range)?;
        let aggregate = match aggregates.get(history_key) {
            Some(aggregate) => aggregate.clone(),
            None if !matches!(range, ConnectionHistoryDateRange::AllTime) => self
                .aggregate_connection_history(&ConnectionHistoryDateRange::AllTime)?
                .get(history_key)
                .cloned()
                .map(HistoryHostAccumulator::without_totals)
                .ok_or_else(|| AppError::not_found("Connection history host not found."))?,
            None => return Err(AppError::not_found("Connection history host not found.")),
        };
        let host = aggregate.clone().into_summary(&current_connections);
        let sessions = self.load_connection_history_sessions(history_key, &range)?;
        let detail_duration_seconds = sessions
            .iter()
            .map(|session| session.duration_seconds)
            .sum::<u64>();
        let detail_session_count = sessions.len() as u64;

        Ok(ConnectionHistoryHostDetails {
            host,
            sessions,
            duration_buckets: aggregate.duration_buckets(),
            summarized_session_count: aggregate
                .total_connection_count
                .saturating_sub(detail_session_count),
            summarized_duration_seconds: aggregate
                .total_duration_seconds
                .saturating_sub(detail_duration_seconds),
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

    fn aggregate_connection_history(
        &self,
        range: &ConnectionHistoryDateRange,
    ) -> AppResult<std::collections::HashMap<String, HistoryHostAccumulator>> {
        let connection = self.connect()?;
        let cutoff = history_range_cutoff(range);
        let mut aggregates = std::collections::HashMap::<String, HistoryHostAccumulator>::new();

        let mut detail_statement = connection
            .prepare(
                "SELECT
                history_key,
                connection_id,
                connection_name_snapshot,
                host_snapshot,
                port_snapshot,
                username_snapshot,
                started_at,
                ended_at,
                duration_seconds
             FROM connection_history_sessions
             ",
            )
            .map_err(|error| {
                AppError::database(
                    "Failed to prepare the connection history summary query.",
                    error.to_string(),
                )
            })?;

        let detail_rows = detail_statement
            .query_map([], |row| {
                Ok(DetailHistoryAggregateRow {
                    history_key: row.get(0)?,
                    connection_id: row.get(1)?,
                    connection_name_snapshot: row.get(2)?,
                    host_snapshot: row.get(3)?,
                    port_snapshot: row.get::<_, u16>(4)?,
                    username_snapshot: row.get(5)?,
                    started_at: row.get(6)?,
                    ended_at: row.get(7)?,
                    duration_seconds: row.get::<_, Option<i64>>(8)?.map(|value| value as u64),
                })
            })
            .map_err(|error| {
                AppError::database(
                    "Failed to load connection history summary rows.",
                    error.to_string(),
                )
            })?;

        for row in detail_rows {
            let row = row.map_err(|error| {
                AppError::database(
                    "Failed to decode a connection history summary row.",
                    error.to_string(),
                )
            })?;
            if cutoff.as_ref().is_some_and(|cutoff| {
                parse_timestamp(&row.started_at)
                    .map(|started_at| started_at < cutoff.clone())
                    .unwrap_or(false)
            }) {
                continue;
            }
            aggregates
                .entry(row.history_key.clone())
                .or_insert_with(|| HistoryHostAccumulator::from_detail_row(&row))
                .add_detail_row(&row);
        }

        if matches!(range, &ConnectionHistoryDateRange::AllTime) {
            let mut rollup_statement = connection
                .prepare(
                    "SELECT
                        history_key,
                        connection_id,
                        connection_name_snapshot,
                        host_snapshot,
                        port_snapshot,
                        username_snapshot,
                        latest_started_at,
                        session_count,
                        total_duration_seconds,
                        under_5_minutes_count,
                        between_5_and_30_minutes_count,
                        between_30_minutes_and_2_hours_count,
                        over_2_hours_count
                     FROM connection_history_rollups",
                )
                .map_err(|error| {
                    AppError::database(
                        "Failed to prepare the connection history rollup query.",
                        error.to_string(),
                    )
                })?;

            let rollup_rows = rollup_statement
                .query_map([], |row| {
                    Ok(HistoryRollupAccumulator {
                        history_key: row.get(0)?,
                        connection_id: row.get(1)?,
                        connection_name_snapshot: row.get(2)?,
                        host_snapshot: row.get(3)?,
                        port_snapshot: row.get::<_, u16>(4)?,
                        username_snapshot: row.get(5)?,
                        bucket_month: String::new(),
                        latest_started_at: row.get(6)?,
                        session_count: row.get::<_, i64>(7)? as u64,
                        total_duration_seconds: row.get::<_, i64>(8)? as u64,
                        under_5_minutes_count: row.get::<_, i64>(9)? as u64,
                        between_5_and_30_minutes_count: row.get::<_, i64>(10)? as u64,
                        between_30_minutes_and_2_hours_count: row.get::<_, i64>(11)? as u64,
                        over_2_hours_count: row.get::<_, i64>(12)? as u64,
                    })
                })
                .map_err(|error| {
                    AppError::database(
                        "Failed to load connection history rollup rows.",
                        error.to_string(),
                    )
                })?;

            for row in rollup_rows {
                let row = row.map_err(|error| {
                    AppError::database(
                        "Failed to decode a connection history rollup row.",
                        error.to_string(),
                    )
                })?;
                aggregates
                    .entry(row.history_key.clone())
                    .or_insert_with(|| HistoryHostAccumulator::from_rollup_row(&row))
                    .add_rollup_row(&row);
            }
        }

        Ok(aggregates)
    }

    fn load_connection_history_sessions(
        &self,
        history_key: &str,
        range: &ConnectionHistoryDateRange,
    ) -> AppResult<Vec<ConnectionHistorySessionRecord>> {
        let connection = self.connect()?;
        let cutoff = history_range_cutoff(range);
        let mut statement = connection
            .prepare(
                "SELECT
                id,
                started_at,
                ended_at,
                duration_seconds,
                close_status,
                is_estimated
             FROM connection_history_sessions
             WHERE history_key = ?1
             ORDER BY started_at DESC",
            )
            .map_err(|error| {
                AppError::database(
                    "Failed to prepare the connection history detail query.",
                    error.to_string(),
                )
            })?;

        let rows = statement
            .query_map([history_key], |row| {
                Ok(RawConnectionHistorySessionRow {
                    id: row.get(0)?,
                    started_at: row.get(1)?,
                    ended_at: row.get(2)?,
                    duration_seconds: row.get::<_, Option<i64>>(3)?.map(|value| value as u64),
                    close_status: row.get(4)?,
                    is_estimated: row.get::<_, i64>(5)? != 0,
                })
            })
            .map_err(|error| {
                AppError::database(
                    "Failed to load connection history detail rows.",
                    error.to_string(),
                )
            })?;

        let raw_sessions = rows.collect::<Result<Vec<_>, _>>().map_err(|error| {
            AppError::database(
                "Failed to decode connection history detail rows.",
                error.to_string(),
            )
        })?;

        let mut sessions = raw_sessions
            .into_iter()
            .map(|row| {
                Ok(ConnectionHistorySessionRecord {
                    id: row.id,
                    started_at: row.started_at.clone(),
                    ended_at: row.ended_at.clone(),
                    duration_seconds: effective_history_duration_seconds(
                        &row.started_at,
                        row.ended_at.as_deref(),
                        row.duration_seconds,
                    )?,
                    close_status: history_close_status_from_db(
                        &row.close_status,
                        row.ended_at.is_none(),
                    ),
                    is_estimated: row.is_estimated,
                })
            })
            .collect::<AppResult<Vec<_>>>()?;

        if let Some(cutoff) = cutoff {
            sessions.retain(|session| {
                parse_timestamp(&session.started_at)
                    .map(|started_at| started_at >= cutoff)
                    .unwrap_or(false)
            });
        }

        sessions.sort_by(|left, right| right.started_at.cmp(&left.started_at));

        Ok(sessions)
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

#[derive(Clone)]
struct UnfinishedHistorySession {
    id: String,
    started_at: String,
    last_activity_at: Option<String>,
}

struct DetailHistoryAggregateRow {
    history_key: String,
    connection_id: Option<String>,
    connection_name_snapshot: String,
    host_snapshot: String,
    port_snapshot: u16,
    username_snapshot: String,
    started_at: String,
    ended_at: Option<String>,
    duration_seconds: Option<u64>,
}

struct RawConnectionHistorySessionRow {
    id: String,
    started_at: String,
    ended_at: Option<String>,
    duration_seconds: Option<u64>,
    close_status: String,
    is_estimated: bool,
}

struct HistoryRollupAccumulator {
    history_key: String,
    connection_id: Option<String>,
    connection_name_snapshot: String,
    host_snapshot: String,
    port_snapshot: u16,
    username_snapshot: String,
    bucket_month: String,
    latest_started_at: Option<String>,
    session_count: u64,
    total_duration_seconds: u64,
    under_5_minutes_count: u64,
    between_5_and_30_minutes_count: u64,
    between_30_minutes_and_2_hours_count: u64,
    over_2_hours_count: u64,
}

#[derive(Clone)]
struct HistoryHostAccumulator {
    history_key: String,
    connection_id: Option<String>,
    connection_name_snapshot: String,
    host_snapshot: String,
    port_snapshot: u16,
    username_snapshot: String,
    latest_connection_at: Option<String>,
    total_connection_count: u64,
    total_duration_seconds: u64,
    under_5_minutes_count: u64,
    between_5_and_30_minutes_count: u64,
    between_30_minutes_and_2_hours_count: u64,
    over_2_hours_count: u64,
}

impl HistoryHostAccumulator {
    fn from_detail_row(row: &DetailHistoryAggregateRow) -> Self {
        Self {
            history_key: row.history_key.clone(),
            connection_id: row.connection_id.clone(),
            connection_name_snapshot: row.connection_name_snapshot.clone(),
            host_snapshot: row.host_snapshot.clone(),
            port_snapshot: row.port_snapshot,
            username_snapshot: row.username_snapshot.clone(),
            latest_connection_at: None,
            total_connection_count: 0,
            total_duration_seconds: 0,
            under_5_minutes_count: 0,
            between_5_and_30_minutes_count: 0,
            between_30_minutes_and_2_hours_count: 0,
            over_2_hours_count: 0,
        }
    }

    fn from_rollup_row(row: &HistoryRollupAccumulator) -> Self {
        Self {
            history_key: row.history_key.clone(),
            connection_id: row.connection_id.clone(),
            connection_name_snapshot: row.connection_name_snapshot.clone(),
            host_snapshot: row.host_snapshot.clone(),
            port_snapshot: row.port_snapshot,
            username_snapshot: row.username_snapshot.clone(),
            latest_connection_at: None,
            total_connection_count: 0,
            total_duration_seconds: 0,
            under_5_minutes_count: 0,
            between_5_and_30_minutes_count: 0,
            between_30_minutes_and_2_hours_count: 0,
            over_2_hours_count: 0,
        }
    }

    fn add_detail_row(&mut self, row: &DetailHistoryAggregateRow) {
        let duration_seconds = effective_history_duration_seconds(
            &row.started_at,
            row.ended_at.as_deref(),
            row.duration_seconds,
        )
        .unwrap_or(0);
        self.total_connection_count += 1;
        self.total_duration_seconds += duration_seconds;
        update_latest_timestamp(
            &mut self.latest_connection_at,
            Some(row.started_at.as_str()),
        );

        match connection_history_duration_bucket(duration_seconds) {
            ConnectionHistoryDurationBucketKind::Under5Minutes => self.under_5_minutes_count += 1,
            ConnectionHistoryDurationBucketKind::Between5And30Minutes => {
                self.between_5_and_30_minutes_count += 1
            }
            ConnectionHistoryDurationBucketKind::Between30MinutesAnd2Hours => {
                self.between_30_minutes_and_2_hours_count += 1
            }
            ConnectionHistoryDurationBucketKind::Over2Hours => self.over_2_hours_count += 1,
        }
    }

    fn add_rollup_row(&mut self, row: &HistoryRollupAccumulator) {
        self.total_connection_count += row.session_count;
        self.total_duration_seconds += row.total_duration_seconds;
        update_latest_timestamp(
            &mut self.latest_connection_at,
            row.latest_started_at.as_deref(),
        );
        self.under_5_minutes_count += row.under_5_minutes_count;
        self.between_5_and_30_minutes_count += row.between_5_and_30_minutes_count;
        self.between_30_minutes_and_2_hours_count += row.between_30_minutes_and_2_hours_count;
        self.over_2_hours_count += row.over_2_hours_count;
    }

    fn without_totals(mut self) -> Self {
        self.latest_connection_at = None;
        self.total_connection_count = 0;
        self.total_duration_seconds = 0;
        self.under_5_minutes_count = 0;
        self.between_5_and_30_minutes_count = 0;
        self.between_30_minutes_and_2_hours_count = 0;
        self.over_2_hours_count = 0;
        self
    }

    fn duration_buckets(&self) -> Vec<ConnectionHistoryDurationBucket> {
        vec![
            ConnectionHistoryDurationBucket {
                bucket: ConnectionHistoryDurationBucketKind::Under5Minutes,
                session_count: self.under_5_minutes_count,
            },
            ConnectionHistoryDurationBucket {
                bucket: ConnectionHistoryDurationBucketKind::Between5And30Minutes,
                session_count: self.between_5_and_30_minutes_count,
            },
            ConnectionHistoryDurationBucket {
                bucket: ConnectionHistoryDurationBucketKind::Between30MinutesAnd2Hours,
                session_count: self.between_30_minutes_and_2_hours_count,
            },
            ConnectionHistoryDurationBucket {
                bucket: ConnectionHistoryDurationBucketKind::Over2Hours,
                session_count: self.over_2_hours_count,
            },
        ]
    }

    fn into_summary(
        self,
        current_connections: &std::collections::HashMap<String, ConnectionRecord>,
    ) -> ConnectionHistoryHostSummary {
        let matching_connection = self
            .connection_id
            .as_ref()
            .and_then(|connection_id| current_connections.get(connection_id))
            .filter(|connection| {
                connection.port == self.port_snapshot
                    && connection.host.eq_ignore_ascii_case(&self.host_snapshot)
                    && connection
                        .username
                        .eq_ignore_ascii_case(&self.username_snapshot)
            });
        let deleted = matching_connection.is_none();

        ConnectionHistoryHostSummary {
            history_key: self.history_key,
            connection_id: self.connection_id,
            connection_name: matching_connection
                .map(|connection| connection.name.clone())
                .unwrap_or(self.connection_name_snapshot),
            host: self.host_snapshot,
            port: self.port_snapshot,
            username: self.username_snapshot,
            deleted,
            latest_connection_at: self.latest_connection_at,
            total_connection_count: self.total_connection_count,
            total_duration_seconds: self.total_duration_seconds,
        }
    }
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

fn history_subject_key(connection: &ConnectionRecord) -> String {
    format!(
        "{}|{}|{}|{}",
        connection.id,
        connection.host.to_ascii_lowercase(),
        connection.port,
        connection.username.to_ascii_lowercase()
    )
}

fn history_range_cutoff(range: &ConnectionHistoryDateRange) -> Option<DateTime<Utc>> {
    let days: i64 = match range {
        ConnectionHistoryDateRange::Last7Days => 7,
        ConnectionHistoryDateRange::Last30Days => 30,
        ConnectionHistoryDateRange::Last90Days => 90,
        ConnectionHistoryDateRange::AllTime => return None,
    };

    Some(Utc::now() - ChronoDuration::days(days))
}

fn duration_seconds_between(started_at: &str, ended_at: &str) -> AppResult<u64> {
    let started_at = parse_timestamp(started_at)?;
    let ended_at = parse_timestamp(ended_at)?;
    Ok(ended_at
        .signed_duration_since(started_at)
        .num_seconds()
        .max(0) as u64)
}

fn parse_timestamp(value: &str) -> AppResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .map_err(|error| {
            AppError::database(
                "Failed to parse a stored connection history timestamp.",
                error.to_string(),
            )
        })
}

fn update_latest_timestamp(target: &mut Option<String>, candidate: Option<&str>) {
    let Some(candidate) = candidate else {
        return;
    };

    match target {
        Some(existing) if existing.as_str() >= candidate => {}
        _ => *target = Some(candidate.to_string()),
    }
}

fn history_close_status_to_db(status: &ConnectionHistoryCloseStatus) -> &'static str {
    match status {
        ConnectionHistoryCloseStatus::InProgress => "in_progress",
        ConnectionHistoryCloseStatus::Normal => "normal",
        ConnectionHistoryCloseStatus::Abnormal => "abnormal",
    }
}

fn history_close_status_from_db(value: &str, in_progress: bool) -> ConnectionHistoryCloseStatus {
    if in_progress {
        return ConnectionHistoryCloseStatus::InProgress;
    }

    match value {
        "normal" => ConnectionHistoryCloseStatus::Normal,
        _ => ConnectionHistoryCloseStatus::Abnormal,
    }
}

fn effective_history_duration_seconds(
    started_at: &str,
    ended_at: Option<&str>,
    stored_duration_seconds: Option<u64>,
) -> AppResult<u64> {
    match (ended_at, stored_duration_seconds) {
        (_, Some(duration_seconds)) => Ok(duration_seconds),
        (Some(ended_at), None) => duration_seconds_between(started_at, ended_at),
        (None, None) => duration_seconds_between(started_at, &Utc::now().to_rfc3339()),
    }
}

fn connection_history_duration_bucket(
    duration_seconds: u64,
) -> ConnectionHistoryDurationBucketKind {
    match duration_seconds {
        0..=299 => ConnectionHistoryDurationBucketKind::Under5Minutes,
        300..=1799 => ConnectionHistoryDurationBucketKind::Between5And30Minutes,
        1800..=7199 => ConnectionHistoryDurationBucketKind::Between30MinutesAnd2Hours,
        _ => ConnectionHistoryDurationBucketKind::Over2Hours,
    }
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
    use super::{history_subject_key, normalize_app_settings, normalize_group_name, Database};
    use crate::models::{
        AppSettings, ConnectionHistoryDateRange, ConnectionListDisplayMode, CreateConnectionInput,
        SessionRecordingMode, SessionRecordingSettings,
    };
    use chrono::{Duration as ChronoDuration, Utc};
    use rusqlite::params;
    use uuid::Uuid;

    fn test_database() -> Database {
        let path =
            std::env::temp_dir().join(format!("iridium-remote-test-{}.sqlite", Uuid::new_v4()));
        let database = Database::new(path);
        database.initialize().expect("database should initialize");
        database
    }

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
        assert_eq!(
            normalized.session_recording.mode,
            SessionRecordingMode::Full
        );
    }

    #[test]
    fn host_details_return_empty_range_summary_for_known_history_host() {
        let database = test_database();
        let connection = database
            .create_connection(CreateConnectionInput {
                name: "Alpha".into(),
                group_name: None,
                host: "192.168.1.10".into(),
                port: Some(22),
                username: "root".into(),
                password: None,
            })
            .expect("connection should be created");
        let history_key = history_subject_key(&connection);
        let started_at = (Utc::now() - ChronoDuration::days(120)).to_rfc3339();
        let ended_at =
            (Utc::now() - ChronoDuration::days(120) + ChronoDuration::minutes(2)).to_rfc3339();
        let now = Utc::now().to_rfc3339();

        database
            .connect()
            .expect("database should open")
            .execute(
                "INSERT INTO connection_history_sessions (
                    id,
                    history_key,
                    connection_id,
                    connection_name_snapshot,
                    host_snapshot,
                    port_snapshot,
                    username_snapshot,
                    started_at,
                    last_activity_at,
                    ended_at,
                    duration_seconds,
                    close_status,
                    is_estimated,
                    created_at,
                    updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'normal', 0, ?12, ?13)",
                params![
                    Uuid::new_v4().to_string(),
                    &history_key,
                    &connection.id,
                    &connection.name,
                    &connection.host,
                    i64::from(connection.port),
                    &connection.username,
                    &started_at,
                    &ended_at,
                    &ended_at,
                    120_i64,
                    &now,
                    &now
                ],
            )
            .expect("history row should be inserted");

        let details = database
            .get_connection_history_host_details(
                &history_key,
                ConnectionHistoryDateRange::Last30Days,
            )
            .expect("known history host should not be treated as missing");

        assert_eq!(details.host.connection_name, "Alpha");
        assert_eq!(details.host.total_connection_count, 0);
        assert_eq!(details.host.total_duration_seconds, 0);
        assert_eq!(details.sessions.len(), 0);
        assert!(details
            .duration_buckets
            .iter()
            .all(|bucket| bucket.session_count == 0));

        let all_time = database
            .get_connection_history_host_details(&history_key, ConnectionHistoryDateRange::AllTime)
            .expect("all-time history should still include the session");
        assert_eq!(all_time.host.total_connection_count, 1);
        assert_eq!(all_time.host.total_duration_seconds, 120);
    }
}
