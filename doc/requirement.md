# Iridium Remote Requirements

## Product goal

Iridium Remote is a desktop SSH client for users who want a lightweight Windows-first remote terminal with saved connections, terminal tabs, and essential file transfer support.

## Target platform

- Product-design priority: Windows desktop
- Release distribution targets: Windows, macOS, and Ubuntu
- Ubuntu release assets must cover `.deb` or `.AppImage`

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
  - optional password saved to the system keyring
- In the connection form, the `Group` field should suggest existing groups while still allowing users to type a new group name.
- The sidebar must support:
  - collapsible groups
  - a real-time search box that matches connection name, host, and username
  - normal display mode
  - compact display mode
- In compact mode, edit/copy/delete actions are grouped behind a more menu and the same actions appear on connection right-click.
- In normal mode, connection right-click should not open a context menu.
- Single-clicking a connection with no open session tab highlights that connection in the sidebar.
- Single-clicking a connection with an open session tab switches to that session tab and highlights the connection.
- Switching to a session tab highlights the corresponding connection in the sidebar.
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
- Upload and download should support both files and directories.
- File transfer should reuse saved connection metadata and credentials when available.
- File transfer should work with saved-password auth and with non-interactive SSH-key auth when standard SSH config and identity files allow a connection without prompting.
- The file transfer dialog should support browsing for local file paths and local directory paths with native pickers.
- The file transfer dialog should support browsing remote files and folders through a lightweight SFTP-backed picker.
- Remote browsing should work with non-interactive SSH authentication such as configured SSH keys, not only with saved passwords.
- Download rules:
  - Remote Path accepts files and directories.
  - Local Path defaults to a directory.
  - If the remote path is a file, the local path may be a directory or a specific file path.
  - If the remote path is a directory, the local path must be an existing directory.
- Upload rules:
  - Local Path accepts files and directories.
  - Remote Path defaults to a directory.
  - If the local path is a file, the remote path may be a directory or a specific file path.
  - If the local path is a directory, the remote path must be an existing directory.

### Menus and dialogs

#### File menu

- The File menu must contain:
  - `New Connection`
  - `Import`
  - `Export`
  - `Exit`
- The app should suppress the default browser-like context menu across the main window.
- Right-clicking inside the terminal workspace should open a localized, theme-aware terminal menu instead of the browser menu.

#### Help menu

- The Help menu must contain:
  - `❤️ Star on GitHub`
  - `Report Issue`
  - `Check for Update...`
  - `About`
- `Check for Update...` checks the latest GitHub release and tells the user whether an update is available.
- When an update is available, the result must include the release download page link.
- The update-check status banner appears in the main window, stays visible for about 5 seconds, and then dismisses with a smooth fade-out.
- `❤️ Star on GitHub` opens `https://github.com/iridiumcao/iridium-remote`
- `Report Issue` opens `https://github.com/iridiumcao/iridium-remote/issues`
- The About entry appears only in the Help menu.
- The About dialog includes:
  - author
  - project URL
  - license
  - current application version

### Internationalization and theming

- The UI supports English, Simplified Chinese, and Traditional Chinese.
- The UI supports light and dark themes.
- Theme and language selections persist between app launches.
- The language selector always shows locale names in their native forms: `English`, `简体中文`, and `繁體中文`.

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
- GitHub Actions should be able to build and publish desktop release bundles from version tags.
- Browser-only development mode should keep working through the mock frontend client.
- The desktop runtime should prefer a single running instance. Launching the app again should activate the existing main window instead of leaving multiple desktop instances open.

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
