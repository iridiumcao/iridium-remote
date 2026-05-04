# UI Design Document

## 1. Purpose

This document defines the current user interface for **Iridium Remote** as a tabbed desktop SSH client with grouped hosts, file transfer, theme switching, and localization.

## 2. Design principles

- **Terminal-first:** terminal work stays visually central
- **Fast repeat actions:** common paths should take one or two clicks
- **Progressive complexity:** advanced features like transfer, language, and theme should be available without crowding the default layout
- **Explicit state:** session, transfer, and credential state should be obvious
- **Low surprise:** saved-password behavior must be explicit in forms, not inferred from terminal input

## 3. Primary layout

The app uses a three-part main screen:

1. **Top bar**
2. **Left sidebar**
3. **Right workspace**

### 3.1 Top bar

Contents:

- app title
- lightweight global status text
- language selector
- theme selector
- About entry
- `New Connection` primary action

### 3.2 Left sidebar

Purpose:

- browse saved hosts
- show group headings
- select a connection
- expose connection actions

Per connection card:

- name
- endpoint subtitle
- optional keyring badge
- active-tab count badge when applicable
- actions:
  - `Connect`
  - `Edit`
  - `Copy`
  - `Delete`

### 3.3 Right workspace

Purpose:

- show open session tabs
- show the active terminal
- expose per-session actions
- expose file transfer for the active connection

Regions:

- session tab strip
- session header
- terminal canvas
- overlay/banners for idle, connecting, disconnected, or error states

## 4. Screens and dialogs

### 4.1 Main screen

Supports:

- grouped host browsing
- multi-tab session management
- theme/language switching
- About access

### 4.2 Connection form dialog

Fields:

- Name
- Group
- Host
- Port
- Username
- Password (optional)

Behavior:

- password entry saves to keyring when provided
- editing an existing connection keeps the saved password when the field is left blank
- existing saved passwords can be explicitly removed

### 4.3 Delete confirmation dialog

Purpose:

- prevent accidental deletion
- warn that the saved connection metadata will be removed

### 4.4 Transfer dialog

Fields:

- upload/download mode
- local path
- remote path

Behavior:

- transfer runs against the selected active connection
- success/failure is surfaced in the main app status

### 4.5 About dialog

Shows:

- application description
- version

## 5. Interaction flows

### 5.1 Start a new session tab

1. User selects a connection.
2. User clicks `Connect`.
3. App opens a new tab immediately.
4. Tab transitions through `Connecting` and then `Connected`.

### 5.2 Work across tabs

1. User starts more than one connection.
2. Each new connect opens another tab.
3. Clicking a tab swaps the visible terminal.
4. Closing a tab only affects that session.

### 5.3 Copy an existing host

1. User clicks `Copy`.
2. App opens the connection form with fields prefilled.
3. User edits only the necessary values.
4. App saves a new record instead of changing the old one.

### 5.4 Save a password explicitly

1. User creates or edits a connection.
2. User enters a password in the form.
3. App stores it in keyring when the form is saved.
4. Future connects reuse it automatically.

### 5.5 Manual password entry

1. User connects without a saved password.
2. SSH prompts directly inside the terminal.
3. User types the password in the terminal.
4. That manual terminal input is not auto-saved.

### 5.6 Transfer a file

1. User activates a tab for the desired connection.
2. User opens `File Transfer`.
3. User enters upload/download details.
4. App reports completion or failure without leaving the main screen.

## 6. Session-state presentation

Status badges:

- `Idle`
- `Connecting`
- `Connected`
- `Disconnected`
- `Error`

Rules:

- the active tab controls the visible terminal
- non-active tabs keep running in the background
- disconnected/error tabs remain visible until the user closes them

## 7. Accessibility and keyboard behavior

- all primary actions must be reachable by keyboard
- dialog actions must remain accessible without a mouse
- visible focus styles are required
- the active terminal should take focus after connect
- switching tabs must not lose terminal history

## 8. TODO section

The UI intentionally leaves these for later work:

- search/filter in the sidebar
- drag-and-drop tab reordering
- a remote file browser
- transfer queue/history UI
- terminal preference panels
- custom shortcut editor
