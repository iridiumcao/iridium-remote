# Iridium Remote Requirements

## Product goal

Iridium Remote is a desktop SSH client for users who want a lightweight Windows-first remote terminal with saved connections, terminal tabs, and essential file transfer support.

## Target platform

- Primary target: Windows desktop
- Future goal: cross-platform support without redesigning the product model

## Core user flows

1. Create, edit, duplicate, group, search, export, and import saved SSH connections.
2. Open one or more SSH sessions from saved connections and switch between them using tabs.
3. Interact with remote hosts directly inside the terminal, including password prompts and `sudo` prompts.
4. Upload and download files with SFTP from the active session context.
5. Adjust preferences such as theme, language, and connection list display mode and keep them across restarts.

## Functional requirements

### Connection management

- Users can create, edit, delete, and duplicate connections.
- A connection includes:
  - display name
  - host
  - port
  - username
  - optional group name
  - optional notes
  - optional password saved to the system keyring
- The sidebar must support:
  - collapsible groups
  - a real-time search box that matches connection name, host, and username
  - normal display mode
  - compact display mode
- In compact mode, edit/copy/delete actions are grouped behind a more menu and the same actions appear on connection right-click.
- In normal mode, connection right-click should not open a context menu.
- Users can import and export JSON backup files containing app settings and connection metadata.
- Export must let users choose the destination path and filename for the backup file.
- Duplicate imports should be skipped instead of creating obvious duplicates.

### Authentication and credentials

- The application uses the system `ssh` client.
- Password entry through terminal prompts must work without any custom password dialog.
- Passwords may be entered in the connection form and stored in the system keyring.
- Passwords must never be stored in SQLite.
- Passwords must never be included in export files.
- Keyring entries use:
  - `service = iridium-remote`
  - `account = username@host`

### Terminal sessions

- The application supports multiple active sessions at the same time.
- Each active session is represented by a terminal tab.
- Session output and input must remain isolated per tab.
- Disconnects and session exits should be surfaced clearly without crashing the app.
- The terminal area should be the only vertically scrolling area on the right side of the window.

### File transfer

- Users can upload files to the remote host with SFTP.
- Users can download files from the remote host with SFTP.
- File transfer should reuse saved connection metadata and credentials when available.

### Menus and dialogs

#### File menu

- The File menu must contain:
  - `New Connection`
  - `Import`
  - `Export`
  - `Exit`
- The app should suppress the default browser-like context menu across the main window, except inside the xterm terminal viewport.

#### Help menu

- The Help menu must contain:
  - `❤️ Star on GitHub`
  - `Report Issue`
  - `About`
- `❤️ Star on GitHub` opens `https://github.com/iridiumcao/iridium-remote`
- `Report Issue` opens `https://github.com/iridiumcao/iridium-remote/issues`
- The About entry appears only in the Help menu.
- The About dialog includes:
  - author
  - project URL
  - license
  - current application version

### Internationalization and theming

- The UI supports English and Simplified Chinese.
- The UI supports light and dark themes.
- Theme and language selections persist between app launches.

### Preferences and settings

- User preferences must be stored locally and restored on startup.
- Persisted settings currently include:
  - locale
  - theme
  - connection list display mode
  - collapsed connection groups

### Logging

- The desktop app writes application logs to the app log directory.
- Logging should cover important lifecycle events such as connection CRUD, session startup, and import/export operations.

## Non-functional requirements

- Prefer stable, simple behavior over advanced customization.
- Preserve fast startup and fast connect behavior.
- Avoid separate console windows in release builds on Windows.
- Browser-only development mode should keep working through the mock frontend client.

## Storage boundaries

- SQLite stores connection records and application settings.
- The system keyring stores passwords.
- Export files contain app settings and connection metadata only.

## TODO

- richer SFTP browser experience
- advanced terminal preferences and keyboard shortcuts
- connection tags and smarter filtering
- host health indicators
- command snippets and batch execution
- sync across devices
- plugins and collaboration features
