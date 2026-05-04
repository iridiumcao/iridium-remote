# UI Design Document

## 1. Purpose

This document defines the MVP user interface for **Iridium Remote**, a lightweight desktop SSH client focused on fast connection setup, stable terminal usage, and simple connection management.

The UI should optimize for:

- quick access to saved connections
- a clear terminal-focused workspace
- low-friction first-time credential entry
- predictable recovery from connection and SSH failures

## 2. Design principles

- **Terminal-first:** the main task is connecting and working in a remote shell; supporting UI should stay lightweight
- **Fast recognition over deep navigation:** users should reach a saved server in one or two clicks
- **Simple over dense:** avoid complex panels, nested settings, and optional modes in MVP
- **State visibility:** connection, authentication, and disconnection states should always be obvious
- **Low interruption:** only prompt when user input is required, especially for passwords and destructive actions

## 3. Primary layout

The app uses a two-pane desktop layout with an optional top bar.

### 3.1 Layout regions

#### Top bar

Purpose:

- show application identity
- expose the primary action for creating a connection
- display lightweight global status when needed

Contents:

- app title: `Iridium Remote`
- primary button: `New Connection`
- optional status text on the right, such as `Ready`, `Connecting`, or `Disconnected`

#### Left panel: Connection list

Purpose:

- present saved connections
- support create, edit, delete, and selection actions

Contents per row:

- connection name
- secondary metadata line: `username@host[:port]`
- row actions exposed through hover or contextual menu:
  - `Connect`
  - `Edit`
  - `Delete`

Behavior:

- single selection
- selected row remains highlighted while its terminal session is active
- empty list state should guide the user to create the first connection

Recommended width:

- fixed or semi-fixed width around 280-320 px

#### Right panel: Terminal workspace

Purpose:

- host the xterm.js terminal
- show connection lifecycle states
- keep the remote shell as the visual priority

Contents:

- terminal header with connection identity
- terminal canvas area
- inline overlays for connecting and disconnect/error states

## 4. Screen and state inventory

The MVP can be implemented with one main screen and a small number of modal dialogs or overlays.

### 4.1 Main application screen

Used for:

- viewing saved connections
- opening a session
- interacting with the active terminal

### 4.2 Connection form modal

Supports:

- create connection
- edit connection

Fields:

- `Name`
- `Host`
- `Port` with default value `22`
- `Username`

Actions:

- `Save`
- `Cancel`

Validation:

- all fields required except port can be prefilled with `22`
- port must be numeric and within valid TCP port range
- trim leading/trailing whitespace from text fields before save

### 4.3 Delete confirmation dialog

Purpose:

- prevent accidental removal of saved connections

Message:

- include the connection name in the prompt

Actions:

- `Delete`
- `Cancel`

### 4.4 Delete confirmation dialog (see 4.3)

## 5. Main interaction flows

### 5.1 First-time connection flow

1. User launches app
2. Empty state or saved list is shown
3. User clicks `New Connection`
4. User fills and saves the connection form
5. New connection appears in the left panel
6. User selects the connection
7. App enters `Connecting` state
8. SSH launches; if no saved credential exists, a password prompt appears in the terminal itself
9. User types password directly into the terminal
10. Terminal becomes active after successful login and password is saved to keyring

### 5.2 Reconnect flow

1. User selects a previously saved connection
2. App enters `Connecting` state immediately
3. Stored credential is retrieved from keyring and sent automatically to SSH
4. Terminal becomes active without user intervention

### 5.3 Edit connection flow

1. User opens row actions
2. User selects `Edit`
3. Existing values are loaded into the connection form
4. User saves changes
5. List row updates in place
6. If the edited connection is currently active, the UI should keep the existing session until the user reconnects

### 5.4 Delete connection flow

1. User opens row actions
2. User selects `Delete`
3. Confirmation dialog appears
4. On confirmation, the connection is removed from the list
5. If the deleted connection is active, the terminal session should close and the workspace should return to an idle state

## 6. Terminal workspace behavior

### 6.1 Terminal header

Display:

- connection name
- resolved endpoint in compact form
- current status badge

Status badge values:

- `Idle`
- `Connecting`
- `Connected`
- `Disconnected`
- `Error`

### 6.2 Idle workspace

Shown when:

- no connection is selected, or
- the selected session has ended and no reconnect is in progress

Content:

- short instructional message such as `Select a connection to start`

### 6.3 Connecting workspace

Shown when:

- SSH process is starting
- waiting for credential retrieval
- waiting for authentication completion

Content:

- non-blocking loading indicator
- target connection identity

### 6.4 Active terminal workspace

Behavior:

- terminal receives keyboard focus automatically when the session becomes interactive
- terminal resizes with the right panel
- user input is sent directly to the backend session
- stdout and stderr are rendered in arrival order

### 6.5 Disconnected or error workspace

Shown when:

- SSH exits
- network/authentication failures occur
- backend launch errors occur

Content:

- plain-language status message
- if possible, a short actionable hint such as retrying or re-entering the password

Actions:

- `Reconnect`
- `Close`

## 7. Empty, loading, and error states

### 7.1 Empty connection list

Message:

- `No saved connections yet`

Action:

- prominent `Create Connection` button

### 7.2 Connection list loading

Needed only during startup if storage initialization is asynchronous.

Behavior:

- show lightweight skeleton or loading text in the left panel
- keep the rest of the layout visible

### 7.3 Connection save error

Use inline form validation for field issues and a form-level error banner for storage failures.

### 7.4 Credential retrieval failure

If keyring access fails, present a clear error and let the user retry or continue with manual password entry if feasible.

### 7.5 SSH launch failure

Display:

- short summary such as `Unable to start SSH session`
- a details area only if the backend provides useful command or environment diagnostics

## 8. Component model

Suggested top-level UI components:

- `AppShell`
- `TopBar`
- `ConnectionListPanel`
- `ConnectionListItem`
- `ConnectionFormModal`
- `DeleteConnectionDialog`
- `TerminalWorkspace`
- `TerminalHeader`
- `PasswordPromptDialog`
- `StatusBanner`

Responsibility split:

- list components manage browsing and CRUD entry points
- modal/dialog components collect explicit user input
- terminal workspace owns session-state presentation, but not session logic itself

## 9. UX rules and conventions

- Single active session only in MVP
- Clicking a connection row should prefer connecting immediately over adding another confirmation step
- Editing a connection should never silently modify stored credentials
- Deleting a connection should remove saved metadata; credential cleanup behavior should be handled explicitly by backend policy
- Errors should be concise and user-facing; raw system output should not be the default UI

## 10. Accessibility and keyboard behavior

- All primary actions must be reachable by keyboard
- Form dialogs should trap focus while open
- `Esc` may cancel dialogs but must not silently terminate an active terminal session
- Visible focus indicators are required for list rows, buttons, and form fields
- Terminal focus should be explicit after connect so keyboard input goes to the expected target

## 11. Out-of-scope UI features

Do not design or reserve dedicated UI for these in MVP:

- tab strip
- split terminal panes
- search or filtering for connections
- theme switching
- advanced terminal preferences
- file transfer controls

## 12. Acceptance criteria for UI design

The UI design is complete for MVP when:

- the user can create, edit, delete, and select connections from one main screen
- the user always understands whether the app is idle, connecting, connected, disconnected, or in error
- the password prompt appears only when required
- the terminal remains the primary visual focus during active sessions
