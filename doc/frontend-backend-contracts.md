# Frontend / Backend Contracts

## Overview

The React frontend communicates with the Tauri backend through typed commands and runtime events exposed by `src\api\client.ts`.

## Connection commands

### `list_connections() -> Connection[]`

Returns all saved connections.

### `create_connection(input) -> Connection`

Creates a connection record and optionally stores a password in the keyring.

### `update_connection(id, input) -> Connection`

Updates the connection record and synchronizes keyring password state.

### `delete_connection(id) -> void`

Deletes the connection record and removes any stored password for that connection identity.

## Settings commands

### `get_app_settings() -> AppSettings`

Returns persisted user preferences.

### `update_app_settings(settings) -> AppSettings`

Stores and returns the normalized settings payload.

## Import / export commands

### `export_connections() -> ConnectionsExportPayload`

Returns the JSON-serializable backup payload for app settings plus all saved connections.

### `import_connections(payload) -> ImportConnectionsResult`

Merges the supplied backup payload into the local database and returns:

- `imported`
- `skipped`
- `settingsApplied`

## Session commands

### `start_session(connectionId) -> SessionInfo`

Starts an SSH session for the selected connection.

### `send_session_input(sessionId, data) -> void`

Writes terminal input to the target PTY session.

### `resize_session(sessionId, cols, rows) -> void`

Updates the PTY size to match the xterm viewport.

### `close_session(sessionId) -> void`

Stops the target session and releases backend resources.

## File transfer commands

### `upload_file(connectionId, localPath, remotePath) -> TransferResult`

Uploads a file via `sftp`.

### `download_file(connectionId, remotePath, localPath) -> TransferResult`

Downloads a file via `sftp`.

## Runtime events

### `session-output`

Payload:

- `sessionId`
- `data`

### `session-status`

Payload:

- `sessionId`
- `status`
- `message?`

### `session-removed`

Payload:

- `sessionId`

Used by the frontend to remove closed tabs and clean up buffered output.

## Browser mock behavior

When the app is not running inside Tauri:

- connections are mocked in memory
- settings are persisted via browser storage
- sessions are simulated
- import/export works against the mock store, including settings when present

This keeps `npm run dev` useful for UI development without the Rust runtime.
