# Iridium Remote Beginner Tutorial

This guide is for someone who is new to both **JavaScript/TypeScript** and **Rust**.

## 1. What this project does

**Iridium Remote** is a desktop SSH client for Windows.

It lets a user:

- save grouped SSH connections
- optionally save passwords in the system keyring
- open multiple terminal sessions at the same time
- switch between sessions with tabs
- transfer files with the system `sftp` client
- switch theme and language from the app UI

## 2. The big idea

The app has two halves:

### Frontend (`src\`)

The frontend is written in React and TypeScript.

It is responsible for:

- drawing the window
- showing the connection list
- rendering dialogs
- rendering the terminal tabs
- calling backend commands

### Backend (`src-tauri\src\`)

The backend is written in Rust and runs through Tauri.

It is responsible for:

- opening SQLite
- reading and writing the keyring
- launching `ssh`
- launching `sftp`
- managing PTY sessions
- streaming terminal output back to React

## 3. Important technologies in plain language

### React

React is used to build the UI from reusable components.

In this project, examples of components are:

- `ConnectionList`
- `ConnectionFormDialog`
- `TerminalWorkspace`
- `TransferDialog`

### TypeScript

TypeScript is JavaScript with types.

A type from this project:

```ts
type SessionState = {
  sessionId: string
  connectionId: string
  connectionName: string
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
  message?: string
}
```

That type tells you what the frontend expects for each terminal tab.

### Tauri

Tauri is the bridge between frontend and backend.

React can call Rust commands like this:

```ts
invoke('connect_session', { connectionId })
```

Rust can send events back like this:

```ts
listen('terminal-output', ...)
```

### Rust

Rust is used for the native desktop work:

- SQLite
- keyring
- SSH process management
- file transfer execution

## 4. Project structure

| Path | Purpose |
| --- | --- |
| `src\App.tsx` | main app shell |
| `src\api\client.ts` | frontend command/event wrapper |
| `src\components\` | UI components |
| `src\lib\types.ts` | frontend types |
| `src-tauri\src\lib.rs` | backend entry point and commands |
| `src-tauri\src\database.rs` | SQLite logic |
| `src-tauri\src\credentials.rs` | keyring logic |
| `src-tauri\src\session.rs` | multi-session SSH manager |
| `src-tauri\src\transfer.rs` | SFTP execution |

If you want a fast reading order:

1. `README.md`
2. `src\App.tsx`
3. `src\api\client.ts`
4. `src-tauri\src\lib.rs`
5. `src-tauri\src\session.rs`
6. `src-tauri\src\transfer.rs`

## 5. How the frontend works

### 5.1 `App.tsx`

This is the top-level React component.

It keeps major UI state such as:

- `connections`
- `sessions`
- `selectedConnectionId`
- `activeSessionId`
- dialog visibility
- theme and locale

On startup it loads:

```ts
const [loadedConnections, loadedSessions] = await Promise.all([
  appClient.listConnections(),
  appClient.getSessionStates(),
])
```

### 5.2 `ConnectionList`

This component:

- groups connections by `groupName`
- shows per-connection actions
- shows how many tabs are active for a host

### 5.3 `TerminalWorkspace`

This component owns xterm.js.

Important idea:

- the backend can have many live sessions
- the frontend keeps one visible terminal
- terminal output is buffered by `sessionId`
- switching tabs resets the visible xterm and replays the buffered output for the selected tab

### 5.4 `ConnectionFormDialog`

This component is used for:

- create
- edit
- copy

It can also:

- save a password to keyring
- remove an existing saved password

## 6. How the backend works

### 6.1 `lib.rs`

This file wires together:

- database
- credentials store
- session manager
- transfer runner

It also exposes Tauri commands such as:

- `list_connections`
- `create_connection`
- `update_connection`
- `connect_session`
- `disconnect_session`
- `close_session`
- `transfer_file`

### 6.2 `database.rs`

This file manages the `connections` table.

It stores connection metadata only:

- name
- group name
- host
- port
- username

It never stores passwords.

### 6.3 `credentials.rs`

This file talks to the operating system keyring.

The key used is:

- service: `iridium-remote`
- account: `username@host`

### 6.4 `session.rs`

This file manages multiple SSH tabs at once.

Important beginner idea:

- each tab has a `sessionId`
- the session manager stores sessions in a `HashMap`
- each session may have live process resources or just a disconnected snapshot

When output arrives:

1. Rust reads bytes from the PTY
2. Rust emits `terminal-output` with `sessionId`
3. React appends that output to the matching tab buffer
4. if that tab is active, React also writes it to xterm.js immediately

### 6.5 `transfer.rs`

This file runs file transfers with the system `sftp` client.

Current behavior:

- user provides local and remote paths
- Rust launches `sftp`
- Rust injects the saved password if needed
- Rust runs `put` or `get`

## 7. A complete connect flow

Here is the normal path when a user starts a new session:

1. User clicks `Connect`
2. React calls `connect_session(connectionId)`
3. Rust loads the connection from SQLite
4. Rust loads any saved password from keyring
5. Rust launches `ssh` in a PTY
6. Rust emits `session-status`
7. Rust streams terminal output through `terminal-output`
8. React shows a new tab and renders output in xterm.js

## 8. A complete transfer flow

1. User opens the transfer dialog
2. React calls `transfer_file`
3. Rust launches `sftp`
4. Rust sends the saved password if required
5. Rust runs upload/download commands
6. Rust returns a success message or a structured error

## 9. Password behavior

There are two different ways a password can enter the system:

### 9.1 Saved in the connection form

- user types a password in the dialog
- app saves it to keyring
- future connects can reuse it
- SFTP can reuse it too

### 9.2 Typed manually in the terminal

- user types directly into the SSH prompt
- app does not capture that text for later storage
- if the user wants it saved, they must edit the connection and type it into the form

## 10. Theme and language support

Theme and language are frontend preferences stored in local storage.

That means:

- switching them is immediate
- they survive app restarts
- the backend does not need to know about them

## 11. Common beginner questions

### Why is there both SQLite and keyring?

Because they store different kinds of data:

- SQLite = normal connection metadata
- keyring = secrets

### Why does the terminal only show one tab at a time if multiple sessions are active?

Because xterm.js is the visible terminal widget, while the backend sessions keep running independently in the background.

### Why does file transfer use `sftp` instead of custom code?

Because this app prefers the system OpenSSH tools over embedding a separate protocol stack.

## 12. Helpful commands

- install packages: `npm install`
- run frontend only: `npm run dev`
- run full desktop app: `npm run tauri -- dev`
- lint: `npm run lint`
- test: `npm run test`
- build frontend: `npm run build`
- build release installers: `npm run tauri -- build`
- check Rust only: `cargo check --manifest-path src-tauri\Cargo.toml`

## 13. If you want to make a safe first change

Good beginner areas:

- add or rename UI text in `src\lib\i18n.ts`
- tweak connection card layout in `src\components\ConnectionList.tsx`
- tweak dialog labels in `ConnectionFormDialog.tsx`
- inspect command wiring in `src\api\client.ts`

These changes are usually easier than changing the PTY/session code immediately.
