# Iridium Remote - Product Requirements

## 1. Product goal

Build a daily-driver desktop SSH client for Windows that keeps terminal work fast, dependable, and easy to manage.

Core outcomes:

- connect to Linux hosts quickly
- manage many saved hosts without clutter
- keep multiple live sessions open in tabs
- reuse securely stored credentials when the user chooses to save them
- support basic file transfer without leaving the app

## 2. Technology stack

### Frontend

- React
- Tailwind CSS
- xterm.js

### Backend

- Tauri
- Rust
- SQLite via `rusqlite`

### System integrations

- OpenSSH `ssh`
- OpenSSH `sftp`
- system keyring

## 3. In-scope product features

### 3.1 Connection management

- create, edit, delete, and duplicate connections
- organize connections with an optional group name
- display grouped connections in the sidebar

### 3.2 Connection fields

- name
- group name (optional)
- host
- port (default `22`)
- username
- password (optional, saved only in keyring)

### 3.3 Session management

- start a new SSH session from any saved connection
- keep multiple active sessions open at the same time
- switch sessions through terminal tabs
- close or disconnect individual tabs without affecting others

### 3.4 Terminal behavior

- stream SSH output into xterm.js
- send user input directly to the active tab
- resize the backend PTY with the visible terminal
- show connection, disconnect, and error state clearly

### 3.5 Credential management

- store passwords only in the system keyring
- allow the user to save a password when creating or editing a connection
- continue to support manual password entry directly in the terminal
- reuse saved credentials automatically on later connects

### 3.6 File transfer

- support upload and download flows from the app
- use the system `sftp` client
- require explicit local and remote paths

### 3.7 Desktop shell features

- About menu entry
- theme switching
- UI localization

## 4. Primary user flows

### 4.1 Create and connect

1. User opens the app.
2. User creates a connection, optionally saving a password.
3. User selects the connection and clicks `Connect`.
4. A new terminal tab opens and moves through `connecting` to `connected`.

### 4.2 Reuse a connection

1. User chooses an existing connection.
2. User clicks `Connect`.
3. Saved credentials are loaded from keyring when available.
4. A new session tab opens without changing other active tabs.

### 4.3 Duplicate a connection

1. User picks `Copy` on an existing connection.
2. The form opens with the old values prefilled.
3. User edits only the fields that need to change.
4. A new connection is saved.

### 4.4 Transfer a file

1. User activates a session tab for a saved connection.
2. User opens the transfer dialog.
3. User selects upload or download and enters local and remote paths.
4. Backend runs the system `sftp` client and reports success or failure.

## 5. Security requirements

- never store plaintext passwords in SQLite
- use keyring entries with:
  - `service`: `iridium-remote`
  - `account`: `username@host`
- do not log passwords or echo saved credentials intentionally
- validate connection metadata before launching system commands

## 6. Non-functional requirements

### Performance

- fast startup
- responsive terminal typing
- quick session creation without blocking the full UI

### Stability

- no crash on disconnect or subprocess exit
- clear per-session error reporting
- safe cleanup when a tab or connection is removed

### UX

- keep the terminal central
- keep secondary features lightweight
- make advanced state visible without overwhelming the user

## 7. Release expectation

The application is ready for distribution when:

- grouped connections work reliably
- multiple active terminal tabs work reliably
- optional keyring password save works from the connection form
- basic upload and download flows succeed
- language/theme settings are usable
- the app builds cleanly in release mode

## 8. TODO backlog

These items are intentionally deferred:

- connection search and tags
- command library
- batch execution
- multi-user switching per host
- advanced terminal shortcuts and preferences
- graphical remote file browser and queued transfer manager
- cloud sync
- plugin system
- collaboration features
