# Frontend / Backend Contracts

## Overview

The React frontend communicates with the Tauri backend through typed commands and runtime events exposed by `src\api\client.ts`.

## Connection commands

### `list_connections() -> ConnectionRecord[]`

Returns all saved connections.

### `create_connection(input) -> ConnectionRecord`

Creates a connection record and optionally stores a password in the keyring.

### `update_connection(input) -> ConnectionRecord`

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

### `connect_session(connectionId) -> SessionState`

Starts an SSH session for the selected connection.

### `write_session_input(sessionId, data) -> void`

Writes terminal input to the target PTY session.

### `resize_session(sessionId, cols, rows) -> void`

Updates the PTY size to match the xterm viewport.

### `disconnect_session(sessionId) -> SessionState`

Stops the active SSH process for the session and returns the disconnected session state payload.

### `close_session(sessionId) -> void`

Removes the target session from the backend session list and releases backend resources.

### `get_session_states() -> SessionState[]`

Returns the currently tracked session snapshots on startup so the frontend can restore open tabs.

### `check_for_updates() -> UpdateCheckResult`

Queries GitHub from the backend for the latest release and returns:

- `currentVersion`
- `latestVersion`
- `updateAvailable`
- `downloadUrl?`

## File transfer commands

### `transfer_file(input) -> FileTransferResult`

Runs an upload or download through the backend `russh`-based SFTP client.

- Upload accepts a local file or local directory.
- Download accepts a remote file or remote directory.
- File transfers may target either a directory path or a specific file path rename when the source is a file.
- Directory transfers require the destination side to be a directory.
- The desktop runtime should support both saved-password auth and non-interactive SSH-key auth for transfers.

### `list_remote_directory(connectionId, path?) -> RemotePathListing`

Lists remote files and folders for the lightweight SFTP-backed remote path browser used by the transfer dialog. The desktop runtime should support both saved-password auth and non-interactive SSH-key auth for this lookup, and return an explicit error instead of hanging when the remote host cannot complete the listing.

## Runtime events

### `terminal-output`

Payload:

- `sessionId`
- `stream`
- `data`

### `session-status`

Payload:

- `sessionId`
- `connectionId`
- `connectionName`
- `status`
- `message?`

The backend emits this event both for terminal-output-driven transitions such as `connecting -> connected` and for direct SSH-process exit transitions such as `connected -> disconnected` after a remote shutdown.

### `session-removed`

Payload:

- `sessionId`

Used by the frontend to remove closed tabs and clean up buffered output.

## Frontend-only bridge helpers

`src\api\client.ts` also exposes a few frontend helpers around the raw Tauri commands:

- `saveExportConnections(payload)` opens the native save dialog in Tauri builds, then calls `write_export_file`.
- `pickTransferLocalPath(direction, selectionMode, currentLocalPath, currentRemotePath)` opens the native file or folder picker used by the transfer dialog.
- `checkForUpdates()` calls the Tauri `check_for_updates` command in desktop builds and falls back to a direct GitHub lookup only outside Tauri.

## Browser mock behavior

When the app is not running inside Tauri:

- connections are mocked in memory
- settings are persisted via browser storage
- sessions are simulated
- import/export works against the mock store, including settings when present
- exports fall back to the browser download flow because the Tauri native save dialog is not available
- local transfer-path picks return mock file or folder paths
- remote browsing returns mock remote directory entries

This keeps `npm run dev` useful for UI development without the Rust runtime.
