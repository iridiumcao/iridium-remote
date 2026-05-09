# UI Design Document

## Window structure

The main window uses a two-column layout:

- **Left sidebar:** connection search, display controls, grouped connection list
- **Right workspace:** top toolbar, terminal tabs, terminal surface, session actions

The window itself should not scroll. The sidebar scrolls independently, uses scrollbar styling that matches the active light or dark theme, and terminal scroll stays inside the xterm viewport.

## Top toolbar

The toolbar contains:

- app title
- language switcher
- theme switcher
- new connection action

The language switcher always lists locales by their native names: `English`, `简体中文`, and `繁體中文`.

The About action is not shown here.

## Application menu

### File

- New Connection
- Import
- Export
- Exit

### Help

- ❤️ Star on GitHub
- Report Issue
- Check for Update...
- About

Selecting external-link items opens the user’s browser. Selecting About opens a modal dialog. Selecting Check for Update checks the latest GitHub release and shows an in-app status message; when a newer version exists, that message includes an actionable release download link.

## Sidebar design

The sidebar contains four layers in order:

1. **Search field**
   - filters in real time by connection name, host, and username
2. **Display mode control**
   - normal mode
   - compact mode
3. **Grouped connection list**
   - collapsible group headers
   - ungrouped connections appear in an `Ungrouped` section

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
- connect / disconnect actions for the selected connection
- file transfer action for the active connection
- active terminal area
- empty state when no session is active

Only the terminal viewport scrolls for terminal output. The tab strip scrollbar should follow the active theme when it overflows horizontally. Tab switching should immediately restore the selected session buffer without injecting any input into the active terminal. If SSH startup fails, the connecting state must stop immediately and the workspace should show a clear error message for that session.

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

When saved groups exist, the group field uses a theme-aware suggestion list that lets the user pick an existing group or type a brand new one.

Password entry here is for optional keyring storage, not for runtime prompt handling.

### File transfer dialog

Supports upload and download flows with path entry, separate local file/folder browse buttons, a lightweight remote file browser, and status feedback. The remote picker can either select a file directly or return the current folder as a directory path.

### About dialog

Shows:

- product name
- version
- author: Cao Yi
- project URL
- license

The project URL is an actionable link or button.

## Visual behavior

- Light and dark themes apply consistently across sidebar surfaces, sidebar scrollbars, terminal tab-strip scrollbars, dialogs, themed popup menus, and terminal shell framing.
- Language switching updates visible labels without changing layout structure.
- Notices for import/export results, settings changes, and operational errors appear inline near the main workspace header.
