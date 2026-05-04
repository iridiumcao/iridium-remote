# Technical Design Document

## 1. Purpose

This document translates the MVP requirements into a concrete technical design for **Iridium Remote**. It defines architecture, component boundaries, runtime flows, storage responsibilities, and implementation constraints for a Windows-first desktop SSH client built with Tauri and React.

## 2. Goals and non-goals

### 2.1 Goals

- launch quickly and keep the architecture small
- manage saved SSH connection definitions locally
- start SSH sessions through the system OpenSSH client
- render terminal output in the frontend through xterm.js
- securely persist credentials through the operating-system keyring
- survive disconnects and subprocess failures without crashing the app

### 2.2 Non-goals

- implementing a custom SSH protocol stack
- multi-session or multi-tab terminal management
- advanced terminal customization
- cross-device sync or shared profiles
- plugin, scripting, or command-library infrastructure

## 3. System overview

The application is a desktop shell with three major layers:

1. **Frontend application (React + Tailwind + xterm.js)** for UI rendering and user interaction
2. **Desktop backend (Tauri + Rust)** for privileged system operations and storage access
3. **Host operating system services** for SSH execution and secure credential storage

### 3.1 High-level responsibilities

#### Frontend

- render connection list and forms
- render and manage the xterm.js terminal instance
- invoke backend commands through Tauri
- subscribe to backend-emitted events for terminal output and session state
- maintain lightweight UI state for selection, dialogs, and visible status

#### Tauri backend

- initialize and access SQLite
- expose commands for connection CRUD
- expose commands for session lifecycle operations
- spawn and supervise the system `ssh` subprocess
- bridge terminal input/output between frontend and subprocess
- access the system keyring
- normalize backend errors into stable UI-consumable responses

#### Operating system integrations

- **OpenSSH** handles network protocol behavior and authentication prompts
- **keyring** stores secrets in platform-secure storage
- the OS process model supplies pipes, lifecycle signals, and environment access

## 4. Proposed runtime architecture

## 4.1 Frontend modules

- **app shell module:** top-level layout and bootstrapping
- **connections module:** list view, form modal, CRUD actions, local validation
- **terminal module:** xterm.js lifecycle, resize handling, keyboard/input forwarding
- **session state module:** active connection metadata, connection status, and prompt visibility
- **API bridge module:** typed wrappers around Tauri commands and event subscriptions

## 4.2 Backend modules

- **database module:** SQLite initialization, migrations, and query helpers
- **connection repository module:** CRUD operations for connection records
- **credential module:** keyring read/write/delete helpers
- **ssh session manager:** create, track, and terminate the single active session
- **pty/process I/O bridge:** stdin writes plus stdout/stderr streaming to frontend
- **event emitter module:** emits typed session and terminal events to the frontend
- **error module:** maps internal failures to stable application error codes/messages

## 4.3 Session model

The MVP supports **exactly one active SSH session** at a time.

This simplifies:

- focus management in the UI
- process supervision in the backend
- event routing between backend and frontend
- cleanup on disconnect and shutdown

If the user starts another connection while a session is active, the app should explicitly stop or replace the active session rather than attempt multiplexing.

## 5. End-to-end data flow

### 5.1 Startup flow

1. Tauri app launches
2. Backend initializes SQLite and ensures schema exists
3. Frontend loads
4. Frontend requests saved connections
5. Connection list is rendered
6. Terminal workspace starts in idle state

### 5.2 Create or edit connection flow

1. User submits connection form in frontend
2. Frontend validates obvious field errors
3. Frontend invokes backend `create_connection` or `update_connection`
4. Backend validates and persists to SQLite
5. Backend returns normalized connection record
6. Frontend updates the list view

### 5.3 Connect flow with stored credential

1. Frontend invokes `connect_session(connection_id)`
2. Backend loads the connection from SQLite
3. Backend looks up credential in keyring using `username@host`
4. Backend launches `ssh`
5. Backend writes password or otherwise participates in the supported authentication flow
6. Backend emits session status updates and terminal output
7. Frontend marks the workspace connected and forwards terminal keystrokes with `write_session_input`

### 5.4 Connect flow (password entry in terminal)

1. Frontend invokes `connect_session(connection_id)`
2. Backend loads the connection from SQLite
3. Backend looks up credential in keyring using `username@host`
4. Backend launches `ssh` with the system SSH client
5. If a saved password exists, it is sent automatically before the user sees a prompt
6. If no saved password exists, the SSH password prompt appears directly in the terminal
7. User types password directly into the terminal (not in a separate dialog)
8. Frontend forwards terminal keystrokes via `write_session_input` to the SSH process
9. Backend emits session status updates and terminal output
10. Frontend marks the workspace connected
11. On successful login, backend stores the password in keyring for future automatic login

### 5.5 Disconnect flow

1. SSH process exits or is terminated
2. Backend captures exit status and emits a terminal/session-end event
3. Frontend updates status to `Disconnected` or `Error`
4. Session manager releases process handles and clears active-session state

## 6. SSH subprocess design

## 6.1 Why system SSH

The requirements explicitly select **system ssh (OpenSSH)**. The backend should therefore behave as an orchestration layer, not a protocol implementation.

Benefits:

- smaller code surface for MVP
- behavior aligned with standard SSH tooling
- simpler path to Windows-first delivery

Tradeoff:

- the app must handle subprocess lifecycle and I/O carefully

## 6.2 Process management responsibilities

The backend session manager should:

- construct the command from saved connection metadata
- launch the process with piped stdin/stdout/stderr
- stream output incrementally
- handle exit, failure to launch, and user-requested termination
- guarantee cleanup on app shutdown

## 6.3 Terminal I/O model

Suggested transport:

- frontend writes user keystrokes to backend command `write_session_input`
- backend writes bytes to SSH stdin
- backend emits stdout/stderr chunks to frontend events
- frontend writes incoming chunks to xterm.js

Because xterm.js is the rendering engine, backend should avoid terminal interpretation beyond what is needed for process interaction.

## 6.4 Authentication handling

The requirements mandate password-based login in V1 and credential reuse through keyring.

Design constraints:

- never persist passwords in SQLite
- do not write credentials to logs
- if a stored credential fails, the user can type a new password directly in the terminal

Implementation detail may vary depending on how the SSH subprocess accepts password input on Windows, but the public app behavior should remain:

- reuse credentials from keyring when available
- display SSH password prompts directly in the terminal (no separate dialog)
- reconnect automatically when credential retrieval succeeds
- note: when a user types a password manually in the terminal, it is not automatically saved to keyring (since there is no way to detect it without a dialog).

## 7. Persistence design

## 7.1 SQLite responsibilities

SQLite stores only connection metadata:

- id
- name
- host
- port
- username
- created_at
- updated_at

SQLite does **not** store:

- passwords
- session transcripts
- command history
- remote host keys or SSH agent material

## 7.2 Keyring responsibilities

Keyring stores the password associated with a connection identity:

- `service`: `iridium-remote`
- `account`: `username@host`

Recommended behavior:

- write only after successful login
- overwrite on credential refresh
- optionally delete when a connection is deleted, if that policy is chosen and documented consistently

## 7.3 Suggested schema management

Even with one table, use a migration/versioning mechanism in the backend rather than raw ad hoc initialization. This keeps future schema changes predictable.

## 8. Error handling design

## 8.1 Error classes

Backend errors should be normalized into stable categories:

- validation error
- database error
- keyring error
- SSH launch error
- authentication error
- session state error
- unexpected internal error

## 8.2 Error presentation

The backend should return structured errors with:

- a stable code
- a user-facing summary
- optional details for diagnostics

The frontend should:

- show concise messages by default
- keep terminal/session state synchronized with the actual backend state
- avoid presenting raw stack traces in standard UI

## 8.3 Disconnect resilience

The app must not crash when:

- the remote host closes the session
- the SSH process exits unexpectedly
- credential lookup fails
- the user closes the active session

This implies the session manager should treat process exit as a normal state transition, not as an exceptional crash path.

## 9. Performance and operational considerations

- initialize only the minimum required services at startup
- open the database once and reuse the handle safely
- avoid buffering the entire terminal stream in memory
- emit terminal output incrementally to keep the UI responsive
- avoid expensive polling if events can represent state changes

The app should optimize for:

- startup under the requirement target
- low-latency typing in the terminal
- fast reconnect to frequently used hosts

## 10. Security design

- no plaintext password storage outside the system keyring
- no password echo in terminal output handling
- no credential logging
- validate and sanitize connection metadata before command construction
- minimize shell interpolation risk by passing SSH arguments as structured process arguments instead of composing a shell string where possible

## 11. Suggested implementation phases

Aligned with the requirements priority:

1. scaffold Tauri + React application shell
2. integrate static xterm.js terminal and app layout
3. implement SQLite-backed connection CRUD
4. implement SSH subprocess launch and streamed output
5. wire terminal input to the active session
6. integrate keyring-backed credential storage and retry handling
7. harden disconnect, error, and shutdown behavior

## 12. Open design decisions to resolve during implementation

These should be settled in code or a later ADR once scaffolding begins:

- exact backend strategy for password injection/interaction with the Windows SSH client
- whether deleting a connection also deletes its stored credential immediately
- whether reconnect should automatically replace an existing active session or require explicit confirmation

## 13. Acceptance criteria for technical design

The technical design is complete for MVP when it supports:

- one active terminal session at a time
- CRUD for saved connections through SQLite
- SSH launched through system OpenSSH
- terminal streaming between backend and xterm.js
- keyring-backed credential persistence
- controlled handling of disconnects, auth failures, and subprocess errors
