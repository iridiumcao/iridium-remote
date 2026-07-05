# Iridium Remote

English | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)

Iridium Remote is a desktop SSH client with equal first-class support for **Windows**, **Ubuntu (Linux)**, and **macOS**, built with **Tauri**, **React**, and **Rust**. It combines saved connections, tabbed terminal sessions, optional keyring-backed passwords, and SFTP file transfer in a single desktop app.

![](doc/img/Pl4DWWhxtF.png)

## Overview

Iridium Remote is designed for a practical desktop workflow:

- save and organize SSH connections
- open multiple terminal sessions in tabs
- keep passwords in the system keyring instead of SQLite
- transfer files with SFTP from the same app
- review per-host connection history and usage statistics
- persist user preferences such as theme, language, and sidebar layout

**Windows**, **Ubuntu (Linux)**, and **macOS** are treated as equal first-class supported platforms, and release automation publishes installable builds for all three.

## Feature Summary

| Area | What it includes |
| --- | --- |
| **Connection management** | Create, edit, duplicate, delete, group, search, import, and export saved SSH connections |
| **Terminal sessions** | PTY-backed system `ssh`, multiple concurrent tabs, per-tab isolated I/O, tab switching without replaying unwanted input, prompt detection that clears the connecting state for common shell themes |
| **Connection UX** | Collapsible groups, normal/compact sidebar modes, right-click actions in compact mode, double-click to open a new session |
| **Authentication** | Optional password saving in the OS keyring, terminal-native password prompts, Linux Secret Service keyring support, and non-interactive SSH key auth when system SSH config allows it |
| **File transfer** | Upload/download files and directories, local file/folder pickers, remote SFTP path browser |
| **Connection history** | File-menu history dialog, per-host session timeline, abnormal-shutdown recovery, all-time totals, and pie-chart summaries |
| **Preferences** | Light/dark theme, English / Simplified Chinese / Traditional Chinese, persisted sidebar state and display mode |
| **Session recording** | Optional input-only or full-session recording, AES-256-GCM encrypted `.irlog` files, restart-time password verification, pause-for-run support, rotation/retention controls, and `.txt` export |
| **Reliability** | Clear session status updates, immediate connection failure feedback, disconnect detection when the SSH process exits, session cleanup on close, single-instance desktop behavior |
| **Data safety** | Passwords are never stored in SQLite, recording passwords stay runtime-only, only a non-decrypting verifier is persisted for restart-time checks, and exported backups never contain secrets |

## Detailed Features

### Connection library

- Save SSH hosts with name, host, port, username, and optional group
- Suggest existing groups while still allowing freeform group names
- Search by connection name, host, or username
- Collapse or expand connection groups
- Switch the sidebar between normal and compact display modes
- Single-click a connection to focus its open tab when one already exists, or just highlight it when no session is open
- Import/export JSON backups that include:
  - application settings
  - saved connection metadata
  - **never** saved passwords

### Terminal workspace

- Open multiple SSH sessions at the same time
- Switch between sessions with tabs
- Keep the left sidebar highlight in sync with the active session tab
- Restore each tab's terminal buffer independently
- Double-click a connection row to open a fresh session tab
- Use a localized terminal context menu for copy, paste, and select-all
- Show an explicit recording badge when the active session is being captured
- Stop the connecting state immediately when OpenSSH reports a startup failure
- Detect common shell prompt styles so a successful login switches the tab from `Connecting` to `Connected` promptly

### Session recording

- Optional `Input Only` and `Full Session Recording` modes
- AES-256-GCM encrypted `.irlog` files with Argon2-derived keys
- Runtime-only recording passwords that must be verified on the first post-restart connection before recording resumes
- Masked password placeholder when a runtime recording password is already loaded
- Wrong-password retry, password reset with an older-log warning, and pause-recording-for-this-run actions
- Chunked compressed writes with automatic file rotation
- Automatic retention and total-storage cleanup
- Configurable log directory from the Session Recording dialog
- File-menu log viewer that decrypts selected `.irlog` files and exports `.txt`

### Connection history

- File-menu `Connection History` dialog
- Per-host recent session rows with start time, end time, duration, and close status
- Abnormal-shutdown recovery that converts unfinished rows into estimated abnormal sessions on the next startup
- Per-host total connection count and total duration
- Cross-host pie charts for duration share and connection-count share
- Per-host duration-bucket pie chart for session-length distribution
- Long-term monthly rollups so all-time totals stay available while older detailed rows are trimmed

### Authentication and security

- Use the system OpenSSH `ssh` client for terminal sessions
- Keep password prompts inside the terminal instead of showing a custom password dialog
- Optionally save passwords in the system keyring
- Use the desktop Secret Service keyring backend for saved passwords on Linux and Ubuntu builds
- Support saved-password auth and non-interactive SSH-key auth where available

### File transfer

- Upload files or directories
- Download files or directories
- Choose local paths with native dialogs
- Browse remote files and folders through the built-in SFTP picker
- Reuse saved connection metadata and available credentials

### Desktop UX

- Light and dark themes across the app UI
- Desktop Settings menu for language, theme, and a last-position session-recording action, with theme-aware in-app selectors in the left sidebar for browser-only fallback mode
- File-menu Connection History entry between Export and Session Logs
- Theme-aware sidebar scrollbar styling
- English, Simplified Chinese, and Traditional Chinese UI
- File-menu Session Logs entry for reviewing encrypted recordings
- Manual update checks from **Help -> Check for Updates...** against the latest GitHub release, with a release-page download link when a newer version exists and an in-app banner that auto-dismisses after about 5 seconds
- Single-instance desktop behavior that focuses the existing window on relaunch
- Application logging to the app log directory

## Architecture

| Layer | Implementation |
| --- | --- |
| **Frontend** | React + TypeScript + Tailwind CSS + xterm.js |
| **Desktop shell** | Tauri |
| **Backend** | Rust |
| **Connection storage** | SQLite |
| **Credential storage** | OS keyring |
| **Terminal transport** | System OpenSSH `ssh` |
| **File transfer transport** | `russh` + `russh-sftp` |

## Data Locations

Packaged desktop builds keep different kinds of data in OS-appropriate locations. The exact install path depends on the bundle format, while the app-scoped data and log directories are derived from the bundle identifier `com.iridiumcao.iridiumremote`.

| Data | Windows | macOS | Ubuntu / Linux | Notes |
| --- | --- | --- | --- | --- |
| **Installed application** | Usually `C:\Program Files\Iridium Remote\` | Usually `/Applications/Iridium Remote.app` | `.deb` installs into system-managed package locations; `.AppImage` runs from whichever folder contains the file | The exact install location depends on the release format and user choice. |
| **SQLite database** | `%APPDATA%\com.iridiumcao.iridiumremote\iridium-remote.db` | `~/Library/Application Support/com.iridiumcao.iridiumremote/iridium-remote.db` | `~/.local/share/com.iridiumcao.iridiumremote/iridium-remote.db` | Stores saved connections, app settings, and connection-history data. |
| **App settings** | Same SQLite file as above | Same | Same | Stored in the `app_settings` table rather than a separate config file. |
| **Connection history / usage statistics** | Same SQLite file as above | Same | Same | Stored in the `connection_history_sessions` and `connection_history_rollups` tables. |
| **Application runtime logs** | `%LOCALAPPDATA%\com.iridiumcao.iridiumremote\logs\` | `~/Library/Logs/com.iridiumcao.iridiumremote/` | `~/.local/share/com.iridiumcao.iridiumremote/logs/` | Rust backend logs are written here with the `iridium-remote` file name prefix. |
| **Session recording files (`.irlog`)** | `%LOCALAPPDATA%\Iridium Remote\SessionLogs\` by default | `~/Library/Application Support/Iridium Remote/SessionLogs/` by default | `~/.local/share/Iridium Remote/SessionLogs/` by default | Used by **File -> Session Logs** and can be overridden in **Settings -> Session Recording**. |
| **Saved passwords** | Windows Credential Manager | macOS Keychain | Secret Service keyring | Passwords are not stored in SQLite or export backups. |
| **Exported backups / exported session-log text files** | User-chosen save path | User-chosen save path | User-chosen save path | JSON backups and decrypted `.txt` exports are written only to the destination chosen in the save dialog. |
| **Transfer download target** | User-chosen local path | User-chosen local path | User-chosen local path | Uploads read from a chosen local path; downloads write to a chosen local path. |

If you are specifically looking for user operation records, there are two main places to check: connection-history data in SQLite and optional encrypted session-recording files in the session-log directory.

## Repository Guide

| Path | Purpose |
| --- | --- |
| `doc\requirement.md` | Product requirements and backlog |
| `doc\ui-design.md` | UI structure and interaction design |
| `doc\technical-design.md` | Runtime architecture and implementation behavior |
| `doc\data-model.md` | Persistence model and backup format |
| `doc\frontend-backend-contracts.md` | Tauri commands and runtime events |
| `doc\development-setup.md` | Cross-platform development environment setup guide |
| `doc\tutorial.md` | Codebase walkthrough |

## Development

### Requirements

- Node.js with npm
- Rust toolchain
- Tauri desktop development prerequisites
- A supported desktop environment on Windows, macOS, or Ubuntu

### Commands

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Run frontend only | `npm run dev` |
| Run desktop app in development | `npm run tauri -- dev` |
| Lint | `npm run lint` |
| Test | `npm run test` |
| Build frontend assets | `npm run build` |
| Check Rust backend | `cargo check --manifest-path src-tauri\Cargo.toml` |
| Build desktop app | `npm run tauri -- build` |

## Releases

- Cross-platform release publishing is defined in `.github\workflows\release.yml`.
- Push a version tag such as `v0.1.6` to trigger the GitHub Actions release pipeline.
- Published assets cover:
  - Windows: NSIS installer and MSI package
  - macOS: Apple Silicon and Intel app / DMG bundles
  - Ubuntu: `.deb` and `.AppImage`

## Install notes for current unsigned releases

Current GitHub release bundles are **not code-signed on Windows** and are **not signed / notarized on macOS** yet.

| Platform | What you may see | Why it happens | What to do | Can Iridium Remote customize it? |
| --- | --- | --- | --- | --- |
| **Windows** | SmartScreen warns before the installer opens | The installer is unsigned, so Windows cannot establish publisher trust | Download only from the official GitHub release page. If you trust the build, click **More info** -> **Run anyway**. | No. SmartScreen appears before the installer can run. |
| **macOS upgrade** | Finder says an older `Iridium Remote.app` already exists in `/Applications` | Replacing the app bundle during a drag-install is a Finder-managed copy action | Choose **Replace**. Your app data in `~/Library/Application Support/com.iridiumcao.iridiumremote/` and saved passwords in Keychain stay in place. | No. Finder owns that dialog text and buttons. |
| **macOS first launch** | `"Iridium Remote.app" is damaged and can't be opened.` | The downloaded unsigned app keeps the browser quarantine attribute and is not notarized | Click **Cancel**, run `xattr -cr /Applications/Iridium\ Remote.app` in Terminal, then relaunch the app. The durable fix is shipping a signed and notarized macOS release. | No. Gatekeeper blocks the app before it starts. |
| **macOS saved passwords** | Keychain asks whether Iridium Remote may use confidential information in `iridium-remote` | Saved passwords live in the macOS Keychain, so macOS asks for permission the first time the app needs them | Choose **Allow** or **Always Allow** if you want saved-password autofill; choose **Deny** if you prefer typing passwords manually in the terminal. Startup no longer probes Keychain just to render the main window, so this prompt should appear only when a saved password is actually used. | Partly. The prompt is macOS-owned, but the app now avoids triggering it during startup. |

## Notes

- **Windows**, **Ubuntu (Linux)**, and **macOS** are equal first-class supported platforms.
- Browser-only development mode remains available for UI work through the mock frontend client.
- Debug builds on Windows may show a console window; release builds hide it.
- Release installers are produced by `npm run tauri -- build`.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

<p align="center">
  <img src="doc/img/logo.png" alt="Iridium Remote logo" width="240" />
</p>
