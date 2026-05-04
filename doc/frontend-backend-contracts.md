# Frontend-Backend Contracts

## 1. Purpose

This document defines the current integration contract between the React frontend and the Tauri backend for **Iridium Remote**.

## 2. Design principles

- commands are task-oriented
- long-lived terminal data flows through events
- session ids, not connection ids, identify active tabs
- credential save/delete remains explicit in connection form commands

## 3. Shared data types

### 3.1 Connection record

```ts
type ConnectionRecord = {
  id: string
  name: string
  groupName: string | null
  host: string
  port: number
  username: string
  hasPassword: boolean
  createdAt: string
  updatedAt: string
}
```

### 3.2 Session state

```ts
type SessionState = {
  sessionId: string
  connectionId: string
  connectionName: string
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
  message?: string
}
```

### 3.3 Terminal output event

```ts
type TerminalOutputEvent = {
  sessionId: string
  stream: 'stdout' | 'stderr'
  data: string
}
```

### 3.4 File transfer input

```ts
type FileTransferInput = {
  connectionId: string
  direction: 'upload' | 'download'
  localPath: string
  remotePath: string
}
```

## 4. Backend commands

### 4.1 Connection commands

- `list_connections() -> ConnectionRecord[]`
- `create_connection(input) -> ConnectionRecord`
- `update_connection(input) -> ConnectionRecord`
- `delete_connection(id: string) -> void`

Connection form payloads:

```ts
type CreateConnectionInput = {
  name: string
  groupName?: string | null
  host: string
  port?: number
  username: string
  password?: string
}

type UpdateConnectionInput = {
  id: string
  name: string
  groupName?: string | null
  host: string
  port: number
  username: string
  password?: string
  clearSavedPassword: boolean
}
```

### 4.2 Session commands

- `connect_session(connectionId: string) -> SessionState`
- `write_session_input(sessionId: string, data: string) -> void`
- `resize_session(sessionId: string, cols: number, rows: number) -> void`
- `disconnect_session(sessionId: string) -> SessionState`
- `close_session(sessionId: string) -> void`
- `get_session_states() -> SessionState[]`

### 4.3 Transfer commands

- `transfer_file(input: FileTransferInput) -> { message: string }`

## 5. Emitted events

### 5.1 `session-status`

Payload: `SessionState`

Used for:

- connecting
- connected
- disconnected
- error

### 5.2 `session-removed`

```ts
type SessionRemovedEvent = {
  sessionId: string
}
```

Used when:

- user closes a tab
- deleting a connection removes its tabs

### 5.3 `terminal-output`

Payload: `TerminalOutputEvent`

Used for:

- per-tab terminal streaming

## 6. Error contract

Commands return structured `AppError` values:

```ts
type AppError = {
  code: string
  message: string
  details?: string
}
```

Expected codes:

- `VALIDATION_ERROR`
- `DATABASE_ERROR`
- `KEYRING_ERROR`
- `SSH_LAUNCH_ERROR`
- `NO_ACTIVE_SESSION`
- `INTERNAL_ERROR`

## 7. Concurrency rules

- each `connect_session` call opens a new tab/session
- terminal input and resize target exactly one `sessionId`
- background tabs continue running while another tab is active
- closing one tab must not terminate sibling tabs

## 8. TODO section

Deferred contract work:

- progress events for file transfers
- search/filter commands for connections
- richer preference persistence APIs
