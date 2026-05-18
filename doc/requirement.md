# Iridium Remote Requirements

## Product goal

Iridium Remote is a desktop SSH client for users who want a lightweight cross-platform remote terminal with saved connections, terminal tabs, and essential file transfer support.

## Target platform

- First-class supported platforms: Windows, Ubuntu (Linux), and macOS
- Release distribution targets: Windows, Ubuntu (Linux), and macOS
- Ubuntu release assets must cover `.deb` or `.AppImage`

## Core user flows

1. Create, edit, duplicate, group, search, export, and import saved SSH connections.
2. Open one or more SSH sessions from saved connections and switch between them using tabs.
3. Interact with remote hosts directly inside the terminal, including password prompts and `sudo` prompts.
4. Upload and download files with SFTP from the active session context.
5. Configure optional encrypted session recording and review exported session logs.
6. Review per-host connection history and aggregated connection statistics.
7. Adjust preferences such as theme, language, and connection list display mode and keep them across restarts.

## Functional requirements

### Connection management

- Users can create, edit, delete, and duplicate connections.
- A connection includes:
  - display name
  - host
  - port
  - username
  - optional group name stored in Title Case
  - optional password saved to the system keyring
- In the connection form, the `Group` field should suggest existing groups while still allowing users to type a new group name.
- Group names are case-insensitive. Values that differ only by letter case are treated as the same group, stored in Title Case, and displayed through the existing uppercase group-header styling.
- The sidebar must support:
  - a branding block at the top of the left sidebar
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
- Ubuntu and Linux desktop builds must store saved passwords through the desktop system keyring / Secret Service integration.
- Passwords must never be stored in SQLite.
- Passwords must never be included in export files.
- Keyring entries use:
  - `service = iridium-remote`
  - `account = username@host`

### Terminal sessions

- The application supports multiple active sessions at the same time.
- Each active session is represented by a terminal tab.
- Session output and input must remain isolated per tab.
- When the remote shell becomes available, the tab status must switch from `connecting` to `connected` promptly and the connecting overlay must disappear, including for common themed shell prompts.
- Disconnects and session exits should be surfaced clearly without crashing the app.
- The terminal area should be the only vertically scrolling area on the right side of the window.
- When session recording is active for the selected session, the workspace should show a clear recording indicator.

### Session recording

- Session recording is optional and disabled by default.
- Recording modes:
  - `Input Only`
  - `Full Session Recording`
- When recording is disabled in the Session Recording dialog, all dependent controls should be disabled and visually grayed out.
- Input-only recording must exclude hidden/password input.
- Full-session recording must write encrypted local `.irlog` files without plaintext disk writes.
- Encryption passwords must never be stored permanently.
- After app restart, if session recording is still enabled but no runtime recording password is loaded, the first connection attempt must open a password-verification dialog instead of forcing the user to set a brand-new password.
- The verification dialog must let the user:
  - enter the existing password once to continue
  - retry after a wrong password
  - reset the recording password after warning that older logs will still require the previous password
  - pause session recording for the current app run and continue without recording
- Pausing recording for the current app run must not disable the persisted setting. The next restart should require verification again.
- When a runtime password is already loaded, the password field should show a masked placeholder instead of appearing blank.
- The log directory must be configurable from the Session Recording dialog.
- Recorded log files must rotate when they reach the configured max file size.
- Old log files must be deleted automatically when they exceed the configured retention period or total storage cap.
- Users can open one or more encrypted `.irlog` files, decrypt them with the recording password, preview them, and export them as `.txt`.

### Connection history

- The app should provide a `Connection History` entry in the File menu.
- The connection-history dialog title should be `Connection History & Statistics`.
- The feature should show per-host historical sessions including start time, end time, duration, and close status.
- The feature should show per-host aggregate totals including connection count and total connected duration.
- The feature should include simple pie charts for cross-host duration share, cross-host connection count share, and selected-host duration distribution by duration bucket.
- History should be recorded as soon as a session starts so abnormal shutdowns do not lose the entire record.
- The app should track a throttled `last_activity_at` timestamp and recover unfinished rows on next startup as abnormal, estimated sessions.
- History retention should bound database growth by keeping recent detail rows and older aggregate rollups.
- Deleting a saved connection should not delete its historical records by default; history must remain readable from host snapshots.

### File transfer

- Users can upload files to the remote host with SFTP.
- Users can download files from the remote host with SFTP.
- Upload and download should support both files and directories.
- File transfer should reuse saved connection metadata and credentials when available.
- File transfer should work with saved-password auth and with non-interactive SSH-key auth when standard SSH config and identity files allow a connection without prompting.
- The file transfer dialog should support browsing for local file paths and local directory paths with native pickers.
- The file transfer dialog should support browsing remote files and folders through a lightweight SFTP-backed picker.
- Remote browsing should work with non-interactive SSH authentication such as configured SSH keys, not only with saved passwords.
- The remote file browser should hide hidden files and folders whose names start with `.` by default.
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
  - `Connection History`
  - `Session Logs`
  - `Exit`
- `Connection History` appears after `Export` and before `Session Logs`.
- The app should suppress the default browser-like context menu across the main window.
- Right-clicking inside the terminal workspace should open a localized, theme-aware terminal menu instead of the browser menu.

#### Settings menu

- The Settings menu must contain:
  - `Language`
  - `Theme`
  - `Session Recording`
- `Language` contains:
  - `English`
  - `简体中文`
  - `繁體中文`
- `Theme` contains:
  - `Dark`
  - `Light`
- Desktop builds should expose Language and Theme through the top-level Settings menu instead of top-toolbar controls.

#### Help menu

- The Help menu must contain:
  - `❤️ Star on GitHub`
  - `Report Issue`
  - `Check for Updates...`
  - `About`
- `Check for Updates...` checks the latest GitHub release and tells the user whether an update is available.
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
- Desktop Language and Theme selection must live under the Settings menu and follow the active locale/theme labels.
- Browser-only fallback mode may keep Language and Theme as inline controls near the top of the left sidebar because it does not have the native desktop app menu.
- Theme and language selections persist between app launches.
- The language selector always shows locale names in their native forms: `English`, `简体中文`, and `繁體中文`.

### Preferences and settings

- User preferences must be stored locally and restored on startup.
- Persisted settings currently include:
  - locale
  - theme
  - connection list display mode
  - collapsed connection groups
  - session recording settings except the encryption password

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
- Session recordings are stored as encrypted local `.irlog` files.
- Export files contain app settings and connection metadata only.

## TODO

- richer SFTP browser experience
- advanced terminal preferences and keyboard shortcuts
- connection tags and smarter filtering
- host health indicators
- command snippets and batch execution
- sync across devices
- plugins and collaboration features
