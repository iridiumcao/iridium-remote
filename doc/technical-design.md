# Technical Design Document

## Overview

Iridium Remote is a split frontend/backend desktop application:

- **React frontend** renders the connection manager, dialogs, menus, and terminal host surface.
- **Tauri backend** exposes commands, manages persistence, launches SSH/SFTP processes, and emits session events.
- **SQLite** stores connection metadata and app settings.
- **System keyring** stores passwords.
- **System OpenSSH tools** provide SSH and SFTP transport.

## Frontend architecture

### Main shell

`src\App.tsx` owns:

- loading connections and app settings
- menu registration
- dialog visibility
- active session selection
- import/export flow
- notice/error banners

### Sidebar

`src\components\ConnectionList.tsx` renders:

- search query state from the parent
- display mode switch
- collapsible grouped connections
- per-connection actions

Collapsed groups are persisted through app settings rather than local-only UI state.
Filtering is done in the frontend in real time against connection name, host, and username. In compact mode, the sidebar renders a `⋮` popup menu for edit/copy/delete actions instead of inline buttons.

### Terminal workspace

`src\components\TerminalWorkspace.tsx` manages:

- tab rendering for active sessions
- xterm host container
- transfer action access
- empty-state rendering

The layout uses `min-h-0` and overflow boundaries so the main window does not become the scroll container.

### Frontend bridge

`src\api\client.ts` abstracts runtime access:

- Tauri mode calls backend commands
- browser mode uses a mock implementation for UI-only development

The mock now mirrors settings persistence and import/export behavior closely enough for non-Tauri development.
In packaged Tauri builds, the File menu exposes new connection, import, export, and exit actions rather than sidebar buttons.

## Backend architecture

### Command surface

`src-tauri\src\lib.rs` registers commands for:

- connection CRUD
- session lifecycle and terminal I/O
- file transfer
- app settings load/update
- connection export/import

It also configures logging and starts shared application state.

### Database layer

`src-tauri\src\database.rs` now owns two persistence concerns:

1. `connections`
2. `app_settings`

Settings are stored as normalized rows and materialized into a typed `AppSettings` payload for the frontend.

### Session manager

`src-tauri\src\session.rs` manages multiple concurrent PTY-backed SSH sessions keyed by `session_id`.

Responsibilities:

- launch `ssh`
- stream output events
- receive terminal input and resize events
- detect session exit
- keep session output isolated by tab

Password prompts remain terminal-native; the backend no longer opens a custom password dialog.

### File transfer

`src-tauri\src\transfer.rs` shells out to `sftp` using the selected connection and saved credentials where possible.

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

## Windows behavior

`src-tauri\src\main.rs` uses `windows_subsystem = "windows"` only for non-debug builds.

- debug runs may show a console window
- release builds and release installers hide it

## Error handling

- Backend commands return explicit errors to the frontend.
- Import failures, transfer failures, and session failures become visible UI notices.
- The app avoids broad silent fallbacks for persisted data operations.
