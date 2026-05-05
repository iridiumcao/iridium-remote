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

Returns the JSON-serializable backup payload for app settings plus all saved connections. In Tauri builds, the frontend uses this payload after the user chooses a destination in the native save dialog.

### `write_export_file(path, payload) -> void`

Writes the pretty-printed JSON backup payload to the user-selected path.

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

### `transfer_file(input) -> TransferResult`

Runs an upload or download via `sftp`.

- Upload accepts a local file or local directory.
- Download accepts a remote file or remote directory.
- File transfers may target either a directory path or a specific file path rename when the source is a file.
- Directory transfers require the destination side to be a directory.
- The desktop runtime should support both saved-password auth and non-interactive SSH-key auth for transfers.

### `list_remote_directory(connectionId, path?) -> RemotePathListing`

Lists remote files and folders for the lightweight SFTP-backed remote path browser used by the transfer dialog. The desktop runtime should support both saved-password auth and non-interactive SSH-key auth for this lookup, and return an explicit error instead of hanging when the remote host cannot complete the listing.

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
- exports fall back to the browser download flow because the Tauri native save dialog is not available

This keeps `npm run dev` useful for UI development without the Rust runtime.
