# Data Model Document

## 1. Purpose

This document defines the persistent, secure, and runtime data structures used by the current implementation of **Iridium Remote**.

## 2. Data domains

The app uses three distinct domains:

1. **SQLite connection metadata**
2. **keyring-stored credentials**
3. **in-memory session state**

## 3. SQLite model

### 3.1 `connections` table

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | text | yes | primary key, UUID |
| `name` | text | yes | user-facing label |
| `group_name` | text | no | optional sidebar grouping |
| `host` | text | yes | hostname or IP |
| `port` | integer | yes | defaults to `22` |
| `username` | text | yes | SSH username |
| `created_at` | text | yes | ISO 8601 UTC |
| `updated_at` | text | yes | ISO 8601 UTC |

### 3.2 Suggested SQL

```sql
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_name TEXT,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 3.3 Validation rules

- `name`, `host`, and `username` must be non-empty after trimming
- `group_name` may be empty, which is treated as `NULL`
- `port` must be a valid TCP port

## 4. Keyring model

### 4.1 Key structure

- `service`: `iridium-remote`
- `account`: `username@host`

### 4.2 Value

- password only

### 4.3 Rules

- save only when the user enters a password in the connection form
- never mirror the password into SQLite or serialized UI state
- move or delete the keyring entry when connection identity changes

## 5. Frontend runtime state

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

type SessionState = {
  sessionId: string
  connectionId: string
  connectionName: string
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
  message?: string
}
```

The frontend also stores:

- selected connection id
- active session id
- theme
- locale

## 6. Backend runtime state

```rust
struct SessionResources {
    child: Box<dyn Child + Send>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    queued_password: Option<String>,
    connected: bool,
}

struct ManagedSession {
    snapshot: SessionStatePayload,
    resources: Option<SessionResources>,
}
```

The session manager stores:

- `HashMap<String, ManagedSession>`
- ordered session id list for tab ordering

## 7. Derived values

These do not need separate storage:

- sidebar subtitle: `username@host[:port]`
- keyring lookup account: `username@host`
- active connection count per connection id

## 8. Lifecycle rules

### 8.1 Create

- insert SQLite row
- optionally save password to keyring

### 8.2 Edit

- update row and `updated_at`
- keep the old keyring value if identity changes and no replacement password was provided
- allow explicit keyring deletion

### 8.3 Delete

- remove SQLite row
- delete the matching keyring entry
- close and remove tabs for that connection

### 8.4 Session close

- keep disconnected/error tab metadata in memory
- drop PTY/process handles
- remove the tab only when the user closes it

## 9. TODO section

Deferred model work:

- tags/search metadata
- transfer history records
- remote file browser cache
- preference sync across devices
