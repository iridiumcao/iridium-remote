# Iridium Remote Tutorial

This tutorial is for contributors who are new to both JavaScript and Rust. The goal is to explain how the app is organized so you can make small changes safely.

## What the app does

Iridium Remote is a desktop SSH client. You can:

- save SSH connections
- optionally save passwords in the system keyring
- search and group saved connections
- switch the sidebar between compact and normal modes
- open multiple terminal tabs
- transfer files with SFTP
- switch theme and language
- import and export backups containing settings and connections

## The two halves of the app

### Frontend: JavaScript / TypeScript / React

The frontend lives in `src\`.

It is responsible for:

- showing buttons, lists, dialogs, and menus
- collecting user input
- rendering the terminal container
- calling backend commands

Important files:

- `src\App.tsx` - main app state and orchestration
- `src\components\ConnectionList.tsx` - left sidebar
- `src\components\TerminalWorkspace.tsx` - terminal tabs and terminal panel
- `src\api\client.ts` - bridge to the backend
- `src\lib\types.ts` - shared frontend types

### Backend: Rust / Tauri

The backend lives in `src-tauri\src\`.

It is responsible for:

- storing data in SQLite
- storing passwords in the OS keyring
- launching `ssh` and `sftp`
- managing active terminal sessions
- sending terminal output back to the frontend
- preferring a single running desktop instance and focusing the existing window on relaunch

Important files:

- `src-tauri\src\lib.rs` - app startup and Tauri commands
- `src-tauri\src\database.rs` - SQLite operations
- `src-tauri\src\session.rs` - SSH/PTTY session management
- `src-tauri\src\transfer.rs` - SFTP helpers
- `src-tauri\src\models.rs` - serialized Rust data types

## A simple mental model

When the user clicks a connection:

1. React handles the click.
2. `src\api\client.ts` calls a Tauri command.
3. Rust receives the command.
4. Rust loads the connection from SQLite and password from the keyring if needed.
5. Rust starts `ssh` inside a PTY.
6. Output events are sent back to React.
7. xterm.js displays the output.

The same pattern applies to settings, file transfer, and import/export.

## Where data is stored

### SQLite

SQLite stores:

- connection metadata
- app settings

### System keyring

The keyring stores:

- passwords only

This rule is important: **passwords never go into SQLite and never go into exported backups**.

## Understanding recent product features

### Search and display mode

The sidebar search box filters the connection list in real time in the frontend. It matches connection name, host, and username. The display mode preference is persisted through the backend so it stays the same next time the app opens.

### Collapsible groups

Group collapse state is also saved in app settings. That means UI state is no longer just temporary browser memory.

### Context menus

- `src\App.tsx` installs a document-level `contextmenu` handler so the browser-style menu does not appear across the main app shell.
- `src\components\TerminalWorkspace.tsx` marks the xterm host container so right-click keeps working there.
- `src\components\ConnectionList.tsx` opens the compact `Edit` / `Copy` / `Delete` popup on right-click, while normal mode does not open a custom menu.

### Import and export

- Export asks the backend for a JSON payload containing app settings plus connections, then saves it to the path the user picks in the native Tauri save dialog.
- Import reads a JSON file in the frontend and sends the parsed payload to the backend.
- The backend skips duplicates, restores settings when the backup contains them, and returns counts for imported and skipped entries.

### File transfer pickers

- `src\components\TransferDialog.tsx` now includes separate local file/folder browse buttons plus the remote path browser.
- Local browse uses Tauri's native open/save dialogs through `src\api\client.ts` so uploads can choose files or folders, and downloads can choose either a destination folder or a specific save-as file path.
- Remote browse opens a lightweight picker backed by the `list_remote_directory` command in `src-tauri\src\transfer.rs`.
- Remote browse and transfers work with saved passwords and with non-interactive SSH-key auth when the system OpenSSH tools can connect without prompting.
- The backend runs that remote listing work off the main Tauri thread, applies a timeout so a slow remote host does not lock up the desktop window or spin forever in the loading state, and uses recursive SFTP commands when the selected source path is a directory.

### Logging

The Rust backend writes log files through Tauri’s logging plugin. This helps when debugging packaged builds.

### Single-instance behavior

- `src-tauri\src\lib.rs` registers Tauri's single-instance plugin during startup.
- If the user launches Iridium Remote again while it is already running, the new launch exits and the existing `main` window is shown, restored, and focused.

## How to run the project

### Install dependencies

```powershell
npm install
```

### Start the browser-only frontend

```powershell
npm run dev
```

This uses the mock client instead of the real Rust backend.

### Start the real desktop app

```powershell
npm run tauri -- dev
```

### Useful checks

```powershell
npm run lint
npm run test
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
```

## First code-reading path

If you want to understand the app without reading everything:

1. Read `src\App.tsx`
2. Read `src\api\client.ts`
3. Read `src-tauri\src\lib.rs`
4. Read `src-tauri\src\database.rs`
5. Read `src-tauri\src\session.rs`

That path shows the full request flow from button click to backend response.

## Good beginner tasks

- add a new label to the UI in both languages
- add a small field to the About dialog
- change connection list rendering in compact mode
- add a new persisted app setting
- add a new log line around an existing backend action

## Common pitfalls

- Do not store passwords in SQLite.
- Do not assume browser mode and Tauri mode behave the same unless `src\api\client.ts` supports both.
- Do not add a custom password popup for terminal prompts; those belong in the terminal stream.
- Remember that release builds hide the Windows console window, while debug builds may still show it.
