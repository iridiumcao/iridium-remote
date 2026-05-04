use std::path::PathBuf;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    models::{ConnectionRecord, CreateConnectionInput, UpdateConnectionInput},
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
                );",
            )
            .map_err(|error| AppError::database("Failed to initialize the database.", error.to_string()))?;

        if !Self::has_column(&connection, "connections", "group_name")? {
            connection
                .execute("ALTER TABLE connections ADD COLUMN group_name TEXT", [])
                .map_err(|error| {
                    AppError::database("Failed to update the database schema.", error.to_string())
                })?;
        }
        Ok(())
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
            .map_err(|error| AppError::database("Failed to list connections.", error.to_string()))?;

        let rows = statement
            .query_map([], Self::map_connection)
            .map_err(|error| AppError::database("Failed to read connection rows.", error.to_string()))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| AppError::database("Failed to decode connection rows.", error.to_string()))
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
            .map_err(|error| AppError::database("Failed to load the connection.", error.to_string()))?;

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
            .map_err(|error| AppError::database("Failed to delete the connection.", error.to_string()))?;
        Ok(existing)
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
            .map_err(|error| AppError::database("Failed to inspect the database schema.", error.to_string()))?;

        let mut rows = statement
            .query([])
            .map_err(|error| AppError::database("Failed to read database schema details.", error.to_string()))?;

        while let Some(row) = rows
            .next()
            .map_err(|error| AppError::database("Failed to read database schema row.", error.to_string()))?
        {
            let existing: String = row
                .get(1)
                .map_err(|error| AppError::database("Failed to decode schema column.", error.to_string()))?;
            if existing == column_name {
                return Ok(true);
            }
        }

        Ok(false)
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
    let group_name = group_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
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
