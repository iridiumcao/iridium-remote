# UI Design Document

## Window structure

The main window uses a two-column layout:

- **Left sidebar:** connection search, display controls, grouped connection list
- **Right workspace:** top toolbar, terminal tabs, terminal surface, session actions

The window itself should not scroll. The sidebar scrolls independently, and terminal scroll stays inside the xterm viewport.

## Top toolbar

The toolbar contains:

- app title
- language switcher
- theme switcher
- new connection action

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
- About

Selecting external-link items opens the user’s browser. Selecting About opens a modal dialog.

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
- The xterm viewport keeps its native right-click behavior
- In normal mode, connection rows do not open a custom context menu

## Connection interactions

Each connection entry supports:

- connect
- edit
- duplicate
- delete
- file transfer

Search results should temporarily reveal matching groups even if those groups were collapsed previously.

## Terminal workspace

The right side contains:

- terminal tab strip for active sessions
- active terminal area
- empty state when no session is active

Only the terminal viewport scrolls for terminal output. Tab switching should immediately restore the selected session buffer.

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
- notes

Password entry here is for optional keyring storage, not for runtime prompt handling.

### File transfer dialog

Supports upload and download flows with simple path entry and status feedback.

### About dialog

Shows:

- product name
- version
- author: Cao Yi
- project URL
- license

The project URL is an actionable link or button.

## Visual behavior

- Light and dark themes apply consistently across sidebar, dialogs, and terminal shell framing.
- Language switching updates visible labels without changing layout structure.
- Notices for import/export results, settings changes, and operational errors appear inline near the main workspace header.
