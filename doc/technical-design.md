# Technical Design Document

## 1. Purpose

This document translates the current product requirements into a concrete implementation design for **Iridium Remote**.

## 2. Goals

- keep the desktop app responsive while several sessions are active
- manage saved connection metadata locally with simple schema evolution
- launch system `ssh` and `sftp` instead of embedding protocol implementations
- keep password storage explicit and secure through the system keyring
- support theme and language preferences in the frontend shell

## 3. System overview

The app has three major layers:

1. **React frontend** for layout, tabs, dialogs, preferences, and terminal rendering
2. **Tauri + Rust backend** for SQLite, keyring, PTY-backed SSH, and SFTP execution
3. **OS services** for OpenSSH, secure storage, and native menu plumbing

## 4. Frontend design

### 4.1 Main responsibilities

- load connections and active session state on startup
- render grouped connection cards
- manage the active tab selection
- maintain theme and locale preferences in local storage
- render xterm.js and route input to the active session only
- create the native desktop menu through Tauri's frontend menu API

### 4.2 Main modules

- `App.tsx`: app shell, preferences, dialogs, and command orchestration
- `ConnectionList`: grouped host browsing and actions
- `ConnectionFormDialog`: create/edit/copy flow plus explicit password save
- `TerminalWorkspace`: tab strip, xterm.js lifecycle, per-tab switching
- `TransferDialog`: upload/download flow
- `AboutDialog`: app metadata
- `api/client.ts`: typed bridge for commands, events, and browser mock behavior

## 5. Backend design

### 5.1 Main responsibilities

- initialize and migrate SQLite
- enrich connection records with `hasPassword`
- read/write/delete keyring entries
- create and manage many PTY-backed SSH sessions at once
- emit per-session terminal output events
- run `sftp` transfer jobs on demand

### 5.2 Modules

- `database.rs`: connection CRUD plus schema migration for `group_name`
- `credentials.rs`: keyring helpers
- `session.rs`: multi-session SSH manager
- `transfer.rs`: SFTP transfer runner
- `models.rs`: serialized command/event payloads
- `lib.rs`: Tauri commands and app-state wiring

## 6. Session architecture

### 6.1 Session identity

Each active or recently closed tab is represented by a unique `session_id`.

Each session keeps:

- `session_id`
- `connection_id`
- `connection_name`
- `status`
- `message`

### 6.2 Runtime storage

The session manager stores a map of sessions plus an ordered tab list.

Active sessions also keep:

- PTY master
- writer handle
- child process handle
- queued saved password
- connected/not-connected flag

### 6.3 Event routing

- `session-status` carries per-session lifecycle updates
- `session-removed` tells the frontend to remove a tab
- `terminal-output` carries `sessionId` so the frontend can buffer output by tab

### 6.4 Session lifecycle

1. Frontend calls `connect_session(connection_id)`
2. Backend reads the saved connection and optional keyring password
3. Backend creates a PTY and launches `ssh`
4. Backend emits `connecting`
5. Output is streamed with `sessionId`
6. If a password prompt appears and a saved password exists, backend writes it automatically
7. When the session becomes interactive, backend emits `connected`
8. On disconnect/error, backend keeps the tab state but drops live resources

## 7. Credential handling

### 7.1 Explicit save path

Passwords are saved only when the user provides them in the connection form.

Rules:

- never store passwords in SQLite
- save to keyring under `username@host`
- when username/host changes, migrate the saved key to the new account if possible
- allow explicit keyring deletion from the edit form

### 7.2 Manual terminal entry

When a user types a password directly into the terminal:

- the SSH flow still works
- the password is not captured from terminal output/input for later saving
- the user must open the connection form to save a password explicitly

## 8. File transfer design

### 8.1 Command shape

Frontend calls `transfer_file` with:

- `connectionId`
- `direction`
- `localPath`
- `remotePath`

### 8.2 Execution path

1. Backend loads the connection and any saved password
2. Backend launches system `sftp` in a PTY
3. Backend waits for the password prompt or `sftp>` prompt
4. Backend sends the queued password when available
5. Backend sends `put` or `get` followed by `bye`
6. Backend returns a concise success message or a structured error

### 8.3 Current scope

The transfer UI is path-based, not browser-based. Queueing, retry history, and remote browsing are deferred.

## 9. Persistence design

### 9.1 SQLite

The `connections` table stores:

- id
- name
- group_name
- host
- port
- username
- created_at
- updated_at

### 9.2 Keyring

The keyring stores:

- service: `iridium-remote`
- account: `username@host`
- value: password only

## 10. Desktop shell features

### 10.1 About menu

The native app menu is created in the frontend with Tauri's menu API.

Current menu structure:

- File
  - New Connection
- Help
  - About

### 10.2 Theme and locale

Theme and locale are frontend preferences stored in local storage and applied immediately across the shell.

## 11. Windows considerations

Release builds use:

`#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`

This keeps the extra console visible in debug mode and hidden in release installers.

## 12. TODO section

Deferred technical work:

- connection search index
- SSH host-key trust management UX
- transfer queueing/progress streaming
- advanced terminal preferences
- cloud sync and remote profile distribution
