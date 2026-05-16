# UI Design Document

## Window structure

The main window uses a two-column layout:

- **Left sidebar:** product branding, browser-only settings controls, connection search, display controls, grouped connection list
- **Right workspace:** terminal tabs, terminal surface, session actions

The window itself should not scroll. The sidebar scrolls independently, uses scrollbar styling that matches the active light or dark theme, and terminal scroll stays inside the xterm viewport.

## Sidebar top area

The top of the left sidebar contains:

- app tagline
- app title

In desktop builds, Language and Theme are not shown here because they live in the top-level Settings menu. Browser-only fallback mode may keep inline controls under the branding block because there is no desktop application menu there.

## Application menu

### File

- New Connection
- Import
- Export
- Connection History
- Session Logs
- Exit

### Help

- ❤️ Star on GitHub
- Report Issue
- Check for Updates...
- About

### Settings

- Language
  - English
  - 简体中文
  - 繁體中文
- Theme
  - Dark
  - Light
- Session Recording

Selecting external-link items opens the user’s browser. Selecting About opens a modal dialog. Selecting Check for Updates checks the latest GitHub release and shows an in-app status message; when a newer version exists, that message includes an actionable release download link. The status banner auto-dismisses after about 5 seconds with a smooth fade-out.

## Sidebar design

The sidebar contains these layers in order:

1. **Branding block**
   - app tagline and app title
2. **Browser-only settings controls**
   - shown only outside the desktop runtime
   - language selector
   - theme selector
3. **Search field**
   - filters in real time by connection name, host, and username
4. **Display mode control**
   - normal mode
   - compact mode
5. **Grouped connection list**
   - collapsible group headers
   - ungrouped connections appear in an `Ungrouped` section
   - groups that differ only by letter case are merged together

### Normal mode

- One card-like row per connection
- Name is visually dominant
- Host, user, and metadata remain visible
- Primary actions are easy to reach

### Compact mode

- One dense row per connection
- Fewer secondary details
- Better for large connection libraries
- `Connect` stays visible while `Edit`, `Copy`, and `Delete` move into a small popup menu opened from a `⋮` button
- Right-clicking a connection opens the same compact popup menu

### Context menus

- The default browser-like context menu is suppressed across the app shell
- Right-clicking the terminal workspace opens a custom menu styled with the active app theme
- The terminal menu uses the active locale and should expose only relevant terminal actions such as copy, paste, and select all
- In normal mode, connection rows do not open a custom context menu

## Connection interactions

Each connection entry supports:

- connect
- edit
- duplicate
- delete

Single-clicking a connection row should keep that connection highlighted. If the connection already has an open session tab, the single click should also switch the workspace to that tab.
Double-clicking a connection row should open a new session tab for that connection immediately.
Switching to a session tab should update the highlighted connection row in the left sidebar.

File transfer is launched from the active workspace header for the currently selected connection, not from each sidebar row.

Search results should temporarily reveal matching groups even if those groups were collapsed previously.

## Terminal workspace

The right side contains:

- terminal tab strip for active sessions
- workspace header showing only the active SSH target in `username@host[:port]` format
- recording indicator when the active session is being recorded
- connect / disconnect actions for the selected connection
- file transfer action for the active connection
- active terminal area
- empty state when no session is active

Only the terminal viewport scrolls for terminal output. The tab strip scrollbar should follow the active theme when it overflows horizontally. Tab switching should immediately restore the selected session buffer without injecting any input into the active terminal. If SSH startup fails, the connecting state must stop immediately and the workspace should show a clear error message for that session. When the remote shell is ready, the tab status changes to `Connected` and the connecting overlay disappears even for common themed prompt styles.

## Dialogs

### Connection dialog

Used for create, edit, and duplicate flows.

Fields:

- name
- group
- host
- port
- username
- password (optional)

When saved groups exist, the group field uses a theme-aware suggestion list that lets the user pick an existing group or type a brand new one. Group names are normalized case-insensitively, stored in Title Case, and shown through the existing uppercase group-header presentation.

Password entry here is for optional keyring storage, not for runtime prompt handling.

### File transfer dialog

Supports upload and download flows with path entry, separate local file/folder browse buttons, a lightweight remote file browser, and status feedback. The remote picker can either select a file directly or return the current folder as a directory path, and it hides dot-prefixed hidden files and folders by default.

### About dialog

Shows:

- product name
- version
- author: Cao Yi
- project URL
- license

The project URL is an actionable link or button.

### Session recording dialog

Shows:

- enable toggle
- recording mode selection
- encryption password and confirmation fields
- password field uses a masked placeholder when a runtime password is already loaded
- storage policy fields for file size, total storage, and retention
- customizable log directory path with browse/open actions
- current storage usage
- open-folder action

When recording is disabled, all dependent controls below the enable toggle are disabled and visually dimmed.
The log-directory input and its browse/open actions should stay aligned on the same row in normal desktop widths.

### Session logs dialog

Shows:

- file picker for one or more `.irlog` files
- password field for decryption
- preview area for decrypted text
- export action for `.txt`
- open-folder action for the recording directory

The preview area's scrollbar should follow the active light or dark theme, just like the sidebar and terminal tab strip.

### Connection history dialog

Shows:

- date-range quick filters for 7 / 30 / 90 days and all time
- host search field and host list
- deleted-connection marker when the saved connection no longer matches the historical snapshot
- per-host summary cards for connection count, total duration, and latest connection time
- cross-host pie charts for duration share and connection-count share
- per-host pie chart for duration-bucket distribution
- recent per-session detail table with start time, end time, duration, close status, and estimated markers

The host list scroll region and the session-detail scroll region should keep the active light or dark theme scrollbar styling.
When all-time totals include older rolled-up history, the dialog should show a short note that older sessions are summarized in totals and charts.

## Visual behavior

- Light and dark themes apply consistently across sidebar surfaces, sidebar scrollbars, terminal tab-strip scrollbars, dialogs, themed popup menus, and terminal shell framing.
- Language switching updates visible labels without changing layout structure.
- Notices for import/export results, settings changes, and operational errors appear inline near the top of the main window content.
