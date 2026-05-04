# Frontend-Backend Contracts

## 1. Purpose

This document defines the proposed integration contract between the React frontend and the Tauri backend for the MVP of **Iridium Remote**.

The goal is to make future implementation consistent even before concrete code exists.

## 2. Contract design principles

- keep command names task-oriented
- return typed data rather than raw process details where possible
- use events for streaming output and asynchronous session state changes
- keep one active session contract for MVP

## 3. Shared data types

### 3.1 Connection record

```ts
type ConnectionRecord = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  createdAt: string;
  updatedAt: string;
};
```

### 3.2 Session status

```ts
type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';
```

### 3.3 App error

```ts
type AppError = {
  code: string;
  message: string;
  details?: string;
};
```

## 4. Proposed backend commands

## 4.1 Connection commands

### `list_connections() -> ConnectionRecord[]`

Loads all saved connections ordered by user-friendly display order.

### `create_connection(input) -> ConnectionRecord`

Input:

```ts
type CreateConnectionInput = {
  name: string;
  host: string;
  port?: number;
  username: string;
};
```

Behavior:

- validates required fields
- defaults port to `22` when omitted
- persists the row in SQLite

### `update_connection(input) -> ConnectionRecord`

Input:

```ts
type UpdateConnectionInput = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
};
```

### `delete_connection(id: string) -> void`

Deletes the saved connection metadata. Credential cleanup policy is implementation-defined but must be documented consistently.

## 4.2 Session commands

### `connect_session(connectionId: string) -> { status: SessionStatus }`

Starts the connection attempt for a saved connection.

Expected immediate outcomes:

- `connecting`
- `connected`
- error response

### `write_session_input(data: string) -> void`

Forwards user terminal input to the active SSH process.

### `disconnect_session() -> void`

Stops the active SSH session if one exists.

### `get_session_state() -> SessionState`

Useful on startup or renderer refresh to rehydrate the visible UI state.

## 5. Proposed emitted events

## 5.1 `session-status`

Payload:

```ts
type SessionState = {
  connectionId: string | null;
  status: SessionStatus;
  message?: string;
};
```

Used for:

- connecting transition
- connected transition
- disconnect or error transition

## 5.2 `terminal-output`

Payload:

```ts
type TerminalOutputEvent = {
  stream: 'stdout' | 'stderr';
  data: string;
};
```

Used for streaming SSH output to xterm.js.

## 5.3 `connection-list-changed`

Payload:

```ts
type ConnectionListChangedEvent = {
  reason: 'created' | 'updated' | 'deleted';
  connectionId: string;
};
```

This event is optional if the frontend updates local state directly from command responses, but it can help keep multiple views consistent.

## 6. Error contract

Commands should return or reject with a structured `AppError`.

Suggested codes:

- `VALIDATION_ERROR`
- `DATABASE_ERROR`
- `KEYRING_ERROR`
- `SSH_LAUNCH_ERROR`
- `AUTHENTICATION_ERROR`
- `NO_ACTIVE_SESSION`
- `SESSION_CONFLICT`
- `INTERNAL_ERROR`

Frontend behavior:

- use `message` for standard UI
- use `details` only in secondary diagnostics surfaces

## 7. State transition expectations

Expected session state progression:

1. `idle`
2. `connecting`
3. `connected`
4. `disconnected` or `error`
5. back to `idle` when cleared or after user acknowledgement if desired

The backend is the source of truth for actual session state.

## 8. Concurrency rules

- only one active session at a time
- `write_session_input` must fail clearly if no active session exists
- `connect_session` should fail with `SESSION_CONFLICT` or replace the current session using an explicit policy
- the frontend should disable duplicate connect actions while a connection attempt is already in progress

## 9. Logging and redaction rules

- never include passwords in command parameters returned to UI logs
- never emit terminal events that deliberately echo saved secrets
- redact sensitive values from backend diagnostics before surfacing them

## 10. Acceptance criteria

The contract is ready for implementation when:

- connection CRUD can be built against the defined commands
- terminal streaming can be built against the defined events
- password input flows through the terminal itself without a separate UI dialog
- error and session transitions are specific enough to keep frontend and backend behavior aligned
