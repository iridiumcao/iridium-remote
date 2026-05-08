# Technical Design Document

## Overview

Iridium Remote is a split frontend/backend desktop application:

- **React frontend** renders the connection manager, dialogs, menus, and terminal host surface.
- **Tauri backend** exposes commands, manages persistence, launches SSH sessions, opens SFTP clients, and emits session events.
- **SQLite** stores connection metadata and app settings.
- **System keyring** stores passwords.
- **System OpenSSH `ssh`** provides terminal-session transport.
- **`russh` + `russh-sftp`** provide file transfer and remote-browser transport.

## Frontend architecture

### Main shell

`src\App.tsx` owns:

- loading connections and app settings
- menu registration
- dialog visibility
- active session selection
- import/export flow
- notice/error banners

It also derives the sorted unique group list used by the connection dialog so the group field can suggest existing groups while remaining freeform.

### Sidebar

`src\components\ConnectionList.tsx` renders:

- search query state from the parent
- display mode switch
- collapsible grouped connections
- per-connection actions

Collapsed groups are persisted through app settings rather than local-only UI state.
The independently scrolling sidebar list uses theme-aware scrollbar styling so light and dark mode stay visually consistent even when the host OS default scrollbar colors differ from the app theme.
Filtering is done in the frontend in real time against connection name, host, and username. Double-clicking a connection row opens a fresh session tab for that saved host. In compact mode, the sidebar renders a `⋮` popup menu for edit/copy/delete actions instead of inline buttons, and the same menu is opened by right-clicking a connection row. In normal mode, connection rows do not open a custom context menu.

### Terminal workspace

`src\components\TerminalWorkspace.tsx` manages:

- tab rendering for active sessions
- active workspace header title and actions
- xterm host container
- transfer action access
- empty-state rendering

The layout uses `min-h-0` and overflow boundaries so the main window does not become the scroll container. `src\App.tsx` suppresses the default browser-like context menu across the shell, and `src\components\TerminalWorkspace.tsx` replaces the terminal area's native browser menu with a custom localized, theme-aware menu for terminal actions.
The horizontally scrolling tab strip also uses theme-aware scrollbar styling so the right workspace stays visually aligned with the active light or dark theme.
Per-session terminal history is buffered on the frontend for fast tab restoration, but replay-only buffers strip terminal status-query escape sequences so activating a tab does not send synthetic input back to the SSH session.
The workspace header itself is intentionally minimal: it shows only the active SSH target in `username@host[:port]` format and does not repeat the saved connection name or render a separate status pill.

### Frontend bridge

`src\api\client.ts` abstracts runtime access:

- Tauri mode calls backend commands
- browser mode uses a mock implementation for UI-only development

The mock now mirrors settings persistence and import/export behavior closely enough for non-Tauri development. In packaged Tauri builds, the manual update check runs through the Rust backend instead of a frontend-only fetch so GitHub requests are not blocked by browser-style constraints. The backend first tries the latest-release API with an explicit user agent and then falls back to the public `releases/latest` redirect page before returning the release download URL when a newer version is available.
In packaged Tauri builds, the File menu also exposes new connection, import, export, and exit actions alongside the in-window controls.

## Backend architecture

### Command surface

`src-tauri\src\lib.rs` registers commands for:

- connection CRUD
- session lifecycle and terminal I/O
- file transfer
- app settings load/update
- connection export/import

It also configures logging and starts shared application state.
The desktop runtime also registers a single-instance guard so a second launch focuses the existing `main` window instead of creating another long-lived desktop instance.

### Database layer

`src-tauri\src\database.rs` now owns two persistence concerns:

1. `connections`
2. `app_settings`

Connection rows are stored directly in SQLite. App settings are stored as a serialized `AppSettings` JSON payload under the `app` key and materialized into a typed `AppSettings` value for the frontend.

### Session manager

`src-tauri\src\session.rs` manages multiple concurrent PTY-backed SSH sessions keyed by `session_id`.

Responsibilities:

- launch `ssh`
- stream output events
- receive terminal input and resize events
- detect session exit
- keep session output isolated by tab

Password prompts remain terminal-native; the backend no longer opens a custom password dialog.
When a saved password exists, the session manager queues it and writes it back into the PTY after detecting a password prompt in the terminal output stream.
The same output stream is inspected for immediate OpenSSH connection failures so a failed session can switch from `connecting` to `error` quickly and surface the SSH error text instead of leaving the loading state running.
The backend also watches the SSH child-process lifecycle directly instead of relying only on PTY reads, so a tab can switch from `connected` to `disconnected` promptly when the remote host shuts down and the SSH process exits without delivering more terminal output through the PTY stream.

### File transfer

`src-tauri\src\transfer.rs` uses a `russh` + `russh-sftp` client flow instead of shelling out to the system `sftp` binary.
The transfer dialog uses Tauri's native file dialogs for local file/folder selection and a lightweight SFTP-backed remote path listing command for browsing remote files and folders. Transfers and remote browsing support saved-password auth plus non-interactive SSH-key auth through standard SSH config and identity files, remote directory transfers recurse through the SFTP client, and the remote work runs asynchronously with explicit timeouts so a slow or misbehaving host does not freeze the app window.

## Settings persistence

Persisted settings currently include:

- locale
- theme
- connection list display mode
- collapsed group keys

The frontend treats backend settings as the source of truth so preferences survive restarts in both packaged and local runs.

## Import and export design

Exports produce a JSON document containing:

- schema version
- exported timestamp
- app settings
- connection records

In Tauri builds, the frontend opens the native save dialog so the user can choose the destination path and filename before the backup JSON is written.

Imports merge into the existing library:

- settings are restored when present in the backup
- passwords are ignored
- duplicates are skipped using a normalized signature
- the result payload returns counts for imported and skipped entries plus whether settings were restored
- browser-only development keeps the simpler download fallback because it does not have access to Tauri's native save dialog

## Logging

The desktop runtime uses `tauri-plugin-log`.

- Application logs are written to the app log directory.
- Important operational actions emit structured log lines through the Rust backend.
- Debug builds can still surface log output in the development console path.
- External Help-menu links are opened through `tauri-plugin-opener` in Tauri builds, with explicit opener capability permissions.

## Release automation

- Cross-platform releases are published by GitHub Actions through `.github\workflows\release.yml`.
- The workflow is driven by version tags such as `v0.1.0`, and it verifies that the Git tag, `package.json`, `src-tauri\tauri.conf.json`, and `src-tauri\Cargo.toml` all use the same app version before publishing.
- An Ubuntu release job publishes `.deb`, `.AppImage`, and `.rpm` bundles so Linux users can install on Ubuntu-style and Red Hat-style systems from the same release.
- Windows release jobs publish the standard Tauri Windows bundles, and macOS release jobs publish separate Apple Silicon and Intel artifacts.

## Windows behavior

`src-tauri\src\main.rs` uses `windows_subsystem = "windows"` only for non-debug builds.

- debug runs may show a console window
- release builds and release installers hide it
- a second desktop launch focuses the existing main window instead of keeping another instance open

## Error handling

- Backend commands return explicit errors to the frontend.
- Import failures, transfer failures, and session failures become visible UI notices.
- The app avoids broad silent fallbacks for persisted data operations.
