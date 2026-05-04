# Iridium Remote Beginner Tutorial

This tutorial is for someone who is new to both **JavaScript/TypeScript** and **Rust**.

You do **not** need to understand every file before you can work on this project. The goal of this guide is to help you:

1. understand what the project does
2. understand how the frontend and backend fit together
3. run the app locally
4. make small, safe changes without getting lost

---

## 1. What this project is

**Iridium Remote** is a desktop SSH client for Windows.

It lets a user:

- save SSH connections
- click a saved connection to open a terminal
- enter a password when needed
- reuse saved credentials through the system keyring

At a high level:

- the **frontend** shows the window and UI
- the **backend** does system-level work like SQLite, keyring, and launching `ssh`

---

## 2. The main technologies in plain language

### React

React is the library used to build the UI.

Think of React as:

- **state** = the current data the screen cares about
- **components** = reusable UI building blocks
- **rendering** = React turns state into visible HTML-like UI

In this project, React is used for:

- the top bar
- the connection list
- dialogs
- the terminal workspace shell

### TypeScript

TypeScript is JavaScript with types.

Types help describe data shapes, for example:

- what a connection looks like
- what session status values are allowed
- what arguments a function expects

Example from this project:

```ts
type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
```

That means the app only allows those exact status strings.

### Tauri

Tauri is the bridge between the web-style frontend and the native desktop backend.

In this project:

- React runs in the desktop window
- Rust runs in the native side
- React calls Rust commands through Tauri
- Rust sends events back to React through Tauri

### Rust

Rust is the language used in the backend.

You can think of the Rust side as the part that is trusted to do machine-level work:

- open the SQLite database
- read and write the keyring
- spawn the system `ssh` process
- manage the PTY terminal session

### SQLite

SQLite is a local file-based database.

This project uses it only for connection metadata such as:

- name
- host
- port
- username

### Keyring

The keyring is the operating system's secure credential storage.

This project stores passwords there instead of in SQLite.

### xterm.js

This is the terminal renderer in the frontend.

It does not create the SSH session itself. It only draws the terminal and forwards user keystrokes.

---

## 3. The big picture architecture

The app has two main halves.

### Frontend (`src\`)

Responsible for:

- showing screens
- keeping UI state
- opening dialogs
- rendering the terminal
- calling backend commands

### Backend (`src-tauri\src\`)

Responsible for:

- database access
- keyring access
- SSH session lifecycle
- terminal I/O
- sending session events to the frontend

### The simplest way to think about the whole app

1. React shows a list of connections
2. user clicks one
3. React asks Rust to connect
4. Rust loads the connection from SQLite
5. Rust checks the keyring for a saved password
6. Rust launches `ssh` in a PTY
7. Rust streams terminal output back to React
8. React writes that output into xterm.js

---

## 4. Project structure

This is the most important folder map:

| Path | Purpose |
| --- | --- |
| `src\` | frontend React application |
| `src\components\` | UI building blocks |
| `src\api\client.ts` | frontend bridge to Tauri backend |
| `src\lib\types.ts` | shared frontend type definitions |
| `src-tauri\src\lib.rs` | backend entry point and Tauri commands |
| `src-tauri\src\database.rs` | SQLite code |
| `src-tauri\src\credentials.rs` | keyring code |
| `src-tauri\src\session.rs` | SSH + PTY session manager |
| `src-tauri\src\models.rs` | backend request/response models |
| `doc\` | product and design documents |

If you only want to understand the project quickly, read these files in this order:

1. `README.md`
2. `src\App.tsx`
3. `src\api\client.ts`
4. `src-tauri\src\lib.rs`
5. `src-tauri\src\session.rs`

---

## 5. How the frontend works

## 5.1 `src\App.tsx`

This is the top-level React component.

It stores the main UI state:

- `connections`
- `selectedConnectionId`
- `sessionState`
- dialog open/closed state
- error state

When the app starts, it:

1. loads connections
2. loads current session state
3. subscribes to backend session events

That happens here:

```ts
const [loadedConnections, loadedSession] = await Promise.all([
  appClient.listConnections(),
  appClient.getSessionState(),
])
```

This is a common React pattern:

- load data
- put it into component state
- re-render the UI

## 5.2 Components

The main UI pieces are:

- `ConnectionList`
- `ConnectionFormDialog`
- `DeleteConnectionDialog`
- `TerminalWorkspace`

These are regular React components that receive data through **props**.

Example idea:

- parent component owns the state
- child component shows part of it
- child calls a callback when the user does something

That is why `App.tsx` passes functions like:

- `onConnect`
- `onEdit`
- `onDelete`
- `onSave`

## 5.3 `src\api\client.ts`

This file is very important.

It is the frontend-side API layer.

It hides the difference between:

- running inside **Tauri**
- running in a normal browser with a **mock fallback**

That means:

- `npm run dev` works with mock behavior
- `npm run tauri -- dev` uses the real Rust backend

Examples of frontend-to-backend calls:

```ts
invoke<ConnectionRecord[]>('list_connections')
invoke<SessionState>('connect_session', { connectionId })
invoke('write_session_input', { data })
```

Examples of backend-to-frontend events:

```ts
listen<SessionState>('session-status', ...)
listen<TerminalOutputEvent>('terminal-output', ...)
```

If you want to understand how React talks to Rust, this file is the best place to start.

---

## 6. How the backend works

## 6.1 `src-tauri\src\lib.rs`

This is the backend entry point.

It does three important things:

1. creates shared app state
2. registers Tauri commands
3. starts the Tauri application

The shared state is:

- database
- credentials store
- session manager

That is wrapped in:

```rust
struct AppState {
    database: Database,
    credentials: CredentialStore,
    sessions: SessionManager,
}
```

The Tauri commands are functions React can call, for example:

- `list_connections`
- `create_connection`
- `update_connection`
- `delete_connection`
- `connect_session`
- `write_session_input`
- `resize_session`
- `disconnect_session`
- `get_session_state`

If you want to answer the question "what can the frontend ask the backend to do?", this file answers it.

## 6.2 `src-tauri\src\database.rs`

This file handles SQLite.

It:

- creates the `connections` table
- inserts records
- updates records
- deletes records
- loads records

This is standard persistence logic. It is intentionally separate from the UI and from the SSH code.

## 6.3 `src-tauri\src\credentials.rs`

This file handles the system keyring.

Important rule:

- **passwords are not stored in SQLite**

Instead, the keyring entry uses:

- service: `iridium-remote`
- account: `username@host`

## 6.4 `src-tauri\src\session.rs`

This is the most important backend file for runtime behavior.

It creates and manages the active SSH session.

The session manager:

- opens a PTY
- launches `ssh`
- reads output
- writes user input
- emits session status events

Important methods:

- `connect(...)`
- `write_input(...)`
- `resize(...)`
- `disconnect(...)`

This file is where terminal behavior really lives.

---

## 7. One end-to-end example: clicking Connect

Let’s trace one real flow.

### Step 1: user clicks a saved connection

In the frontend, `ConnectionList` calls the `onConnect` callback.

### Step 2: `App.tsx` handles that action

`App.tsx` calls:

```ts
appClient.connectSession(connection.id)
```

### Step 3: `src\api\client.ts` forwards the command

In real Tauri runtime, that becomes:

```ts
invoke<SessionState>('connect_session', { connectionId })
```

### Step 4: Rust receives the command

In `src-tauri\src\lib.rs`, the `connect_session` command:

1. loads the connection from SQLite
2. looks up a saved password in keyring
3. asks `SessionManager` to start the session

### Step 5: `SessionManager` launches `ssh`

In `src-tauri\src\session.rs`, `connect(...)`:

1. opens a PTY
2. builds the `ssh` command
3. if a saved password exists, sends it automatically
4. if no saved password, SSH password prompt will appear in the terminal
5. spawns the process
6. starts a background thread to read output and detect successful connection

### Step 6: Rust emits events

As output arrives, the backend emits:

- `session-status`
- `terminal-output`

### Step 7: React receives the events

`App.tsx` updates visible state from `session-status`.

`TerminalWorkspace` writes terminal text to xterm.js from `terminal-output`.

When a password prompt appears in the terminal, the user types directly into the terminal just like they would in a normal terminal application.

That is the core frontend/backend loop of the app.

---

## 8. How to run the project

## 8.1 Install dependencies

```powershell
npm install
```

## 8.2 Run the frontend only

```powershell
npm run dev
```

Use this when:

- you only want to work on UI
- you do not need real SSH behavior
- the mock client is enough

## 8.3 Run the real desktop app

```powershell
npm run tauri -- dev
```

Use this when:

- you want the real Rust backend
- you want SQLite, keyring, and SSH behavior

Note: In debug mode, a console window appears alongside the app window, which can be useful for seeing debug output. In release builds, this console window is hidden automatically.

## 8.4 Run checks

```powershell
npm run lint
npm run test
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
```

## 8.5 Build the desktop app

```powershell
npm run tauri -- build --debug
```

---

## 9. How to make your first safe changes

If you are new to the stack, start with changes that only touch one side at a time.

### Good first frontend changes

- change button text
- change status labels
- adjust spacing or colors
- add helper text in a dialog

Likely files:

- `src\App.tsx`
- `src\components\*.tsx`
- `src\index.css`

### Good first backend changes

- add a new error message
- adjust validation rules
- change how connection records are ordered

Likely files:

- `src-tauri\src\database.rs`
- `src-tauri\src\errors.rs`
- `src-tauri\src\models.rs`

### More advanced changes

These require understanding both sides:

- new Tauri commands
- new session states
- new terminal behavior
- changing password flow

For those, you usually need to edit both:

- `src\api\client.ts`
- one or more Rust command files

---

## 10. Beginner notes for JavaScript/TypeScript

## 10.1 Arrow functions

You will see code like:

```ts
const openCreateDialog = () => {
  setEditingConnection(null)
  setConnectionDialogOpen(true)
}
```

This is just a function assigned to a variable.

## 10.2 `useState`

Example:

```ts
const [error, setError] = useState<AppError | null>(null)
```

This means:

- `error` = current value
- `setError(...)` = function to change it

When you call `setError`, React re-renders the component.

## 10.3 `useEffect`

`useEffect` runs side effects such as:

- loading data
- subscribing to events
- cleaning up listeners

This pattern:

```ts
useEffect(() => {
  // do setup
  return () => {
    // do cleanup
  }
}, [])
```

usually means:

- run once when component starts
- clean up when component unmounts

## 10.4 Props

Props are how one component passes data or callbacks to another component.

Example idea:

- parent owns `onSave`
- child calls `onSave(...)`

---

## 11. Beginner notes for Rust

## 11.1 `struct`

A `struct` is a data type with named fields.

Example:

```rust
struct AppState {
    database: Database,
    credentials: CredentialStore,
    sessions: SessionManager,
}
```

This is similar to an object shape.

## 11.2 `impl`

`impl` is where methods for a type are defined.

Example idea:

```rust
impl Database {
    pub fn list_connections(&self) -> AppResult<Vec<ConnectionRecord>> {
        // ...
    }
}
```

That means `Database` has a method called `list_connections`.

## 11.3 `Result`

Rust uses `Result<T, E>` for operations that can fail.

In this project:

- success returns the expected value
- failure returns `AppError`

Example:

```rust
pub fn initialize(&self) -> AppResult<()> {
```

This means:

- it either succeeds with no special value
- or returns an `AppError`

## 11.4 `Arc<Mutex<...>>`

You will see:

```rust
inner: Arc<Mutex<SessionInner>>
```

Very roughly:

- `Arc` = shared ownership
- `Mutex` = only one thread can mutate the data at a time

This is used because the session manager has background work and shared state.

---

## 12. When to edit which file

Use this cheat sheet.

| If you want to... | Start here |
| --- | --- |
| change top-level UI flow | `src\App.tsx` |
| change a dialog | `src\components\*.tsx` |
| change frontend/backend calls | `src\api\client.ts` |
| add or change a backend command | `src-tauri\src\lib.rs` |
| change database behavior | `src-tauri\src\database.rs` |
| change credential behavior | `src-tauri\src\credentials.rs` |
| change SSH or terminal behavior | `src-tauri\src\session.rs` |
| change shared backend data shapes | `src-tauri\src\models.rs` |

---

## 13. Suggested learning path

If you are completely new, do this in order:

1. run `npm run dev`
2. open `src\App.tsx`
3. find where the `New Connection` button is rendered
4. change its label and see the result
5. read `src\api\client.ts`
6. run `npm run tauri -- dev`
7. read `src-tauri\src\lib.rs`
8. trace one command, such as `list_connections`
9. read `src-tauri\src\session.rs` only after the rest makes sense

That path keeps the learning curve manageable.

---

## 14. Common confusion points

### "Why are there two runtimes?"

Because this is a desktop app built with web UI technology.

- React handles UI
- Rust handles native/system behavior

### "Why does `npm run dev` not behave like the real app?"

Because `src\api\client.ts` includes a mock fallback when Tauri is not present.

That is intentional so frontend work can happen without the native runtime.

### "Where is the actual SSH connection created?"

In Rust, inside `src-tauri\src\session.rs`.

### "Where is the database?"

SQLite is created in the app data directory, not in the repository.

### "Where is the password stored?"

In the system keyring for connections that have been saved.

When you first connect with a new saved connection:
- If you have a saved password in the keyring, it is sent automatically
- If you don't have a saved password, you type it into the terminal when SSH prompts for it
- The password you type is not automatically saved to keyring (to avoid exposing it, there is no way to capture it without a UI dialog)

Passwords are never stored in SQLite or in the repository.

---

## 15. Final advice

When you feel lost, narrow the question:

- "Which side owns this behavior, frontend or backend?"
- "Is this just UI state, or does it require system access?"
- "Which file is the entry point for this flow?"

If the answer is:

- **UI only** -> start in `src\`
- **database / keyring / ssh / terminal process** -> start in `src-tauri\src\`
- **communication between the two** -> start in `src\api\client.ts` and `src-tauri\src\lib.rs`

That mental model is enough to work productively even before you are comfortable with JavaScript or Rust.
