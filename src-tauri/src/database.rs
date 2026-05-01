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
                    host TEXT NOT NULL,
                    port INTEGER NOT NULL DEFAULT 22,
                    username TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
            )
            .map_err(|error| AppError::database("Failed to initialize the database.", error.to_string()))?;
        Ok(())
    }

    pub fn list_connections(&self) -> AppResult<Vec<ConnectionRecord>> {
        let connection = self.connect()?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, host, port, username, created_at, updated_at
                 FROM connections
                 ORDER BY lower(name), lower(host), port, lower(username)",
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
                "SELECT id, name, host, port, username, created_at, updated_at
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
        let normalized = normalize_input(&input.name, &input.host, input.port.unwrap_or(22), &input.username)?;
        let connection = self.connect()?;
        let now = Utc::now().to_rfc3339();
        let record = ConnectionRecord {
            id: Uuid::new_v4().to_string(),
            name: normalized.name,
            host: normalized.host,
            port: normalized.port,
            username: normalized.username,
            created_at: now.clone(),
            updated_at: now,
        };

        connection
            .execute(
                "INSERT INTO connections (id, name, host, port, username, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    record.id,
                    record.name,
                    record.host,
                    i64::from(record.port),
                    record.username,
                    record.created_at,
                    record.updated_at
                ],
            )
            .map_err(|error| AppError::database("Failed to create the connection.", error.to_string()))?;

        Ok(record)
    }

    pub fn update_connection(&self, input: UpdateConnectionInput) -> AppResult<ConnectionRecord> {
        let existing = self.get_connection(&input.id)?;
        let normalized = normalize_input(&input.name, &input.host, input.port, &input.username)?;
        let connection = self.connect()?;
        let updated = ConnectionRecord {
            id: existing.id,
            name: normalized.name,
            host: normalized.host,
            port: normalized.port,
            username: normalized.username,
            created_at: existing.created_at,
            updated_at: Utc::now().to_rfc3339(),
        };

        connection
            .execute(
                "UPDATE connections
                 SET name = ?2, host = ?3, port = ?4, username = ?5, updated_at = ?6
                 WHERE id = ?1",
                params![
                    updated.id,
                    updated.name,
                    updated.host,
                    i64::from(updated.port),
                    updated.username,
                    updated.updated_at
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
            host: row.get(2)?,
            port: row.get(3)?,
            username: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }
}

struct NormalizedConnectionInput {
    name: String,
    host: String,
    port: u16,
    username: String,
}

fn normalize_input(name: &str, host: &str, port: u16, username: &str) -> AppResult<NormalizedConnectionInput> {
    let name = name.trim();
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
        host: host.to_string(),
        port,
        username: username.to_string(),
    })
}
