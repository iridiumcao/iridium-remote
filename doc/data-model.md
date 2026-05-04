# Data Model Document

## 1. Purpose

This document defines the persistent, secure, and runtime data structures required for the MVP implementation of **Iridium Remote**.

## 2. Data domains

The MVP uses three distinct data domains:

1. **Persistent connection metadata** in SQLite
2. **Sensitive credentials** in the system keyring
3. **Ephemeral runtime session state** in memory

Keeping these domains separate is a core design rule.

## 3. SQLite model

## 3.1 `connections` table

This is the only required MVP database table.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | text | yes | primary key; UUID recommended |
| `name` | text | yes | user-facing label |
| `host` | text | yes | hostname or IP |
| `port` | integer | yes | defaults to `22` |
| `username` | text | yes | SSH username |
| `created_at` | text | yes | ISO 8601 UTC timestamp recommended |
| `updated_at` | text | yes | ISO 8601 UTC timestamp recommended |

### Suggested SQL

```sql
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Suggested indexes

MVP does not require additional indexes beyond the primary key. Search and grouping are out of scope.

## 3.2 Validation rules

- `name` must be non-empty after trimming
- `host` must be non-empty after trimming
- `port` must be a valid TCP port
- `username` must be non-empty after trimming
- store normalized values where appropriate, but do not silently alter user intent beyond trimming and defaulting

## 4. Keyring model

Credentials are stored outside SQLite.

### 4.1 Key

- `service`: `iridium-remote`
- `account`: `username@host`

### 4.2 Value

- password only

### 4.3 Rules

- write after successful authentication, not before
- update when the user provides a newer valid password
- never expose the credential in logs, UI state snapshots, or database rows

## 5. Runtime frontend state

Suggested frontend state shape:

```ts
type ConnectionSummary = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  createdAt: string;
  updatedAt: string;
};

type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

type ActiveSessionState = {
  connectionId: string | null;
  status: SessionStatus;
  statusMessage: string | null;
};
```

Frontend should avoid storing:

- raw passwords after submit
- unbounded terminal history outside the terminal renderer

## 6. Runtime backend state

Suggested backend in-memory structures:

```rust
struct Connection {
    id: String,
    name: String,
    host: String,
    port: i64,
    username: String,
    created_at: String,
    updated_at: String,
}

enum SessionStatus {
    Idle,
    Connecting,
    Connected,
    Disconnected,
    Error,
}

struct ActiveSession {
    connection_id: String,
    status: SessionStatus,
    ssh_pid: Option<u32>,
}
```

The exact Rust types may change, but backend state should preserve:

- current connection identity
- process handle or PID
- current session lifecycle status
- any channels or handles needed for stdin/stdout/stderr streaming

## 7. Derived display values

These values do not need separate storage:

- display subtitle: `username@host[:port]`
- account key for keyring lookup: `username@host`
- terminal header label combining connection name and endpoint

## 8. Data lifecycle rules

### 8.1 Connection creation

- insert a SQLite row
- do not create keyring data yet

### 8.2 First successful login

- keep existing SQLite row
- write password to keyring

### 8.3 Connection edit

- update SQLite row and `updated_at`
- re-evaluate future keyring lookups because `username` or `host` may change

### 8.4 Connection delete

- remove SQLite row
- credential deletion policy should be explicit in implementation; if applied, delete the matching keyring entry using the current `username@host`

## 9. Non-goals for the data model

The MVP should not introduce data structures for:

- terminal tabs
- host grouping
- tags
- command snippets
- transfer jobs
- cloud accounts

## 10. Acceptance criteria

The data model is complete for MVP when:

- all required connection metadata fits in one SQLite table
- passwords are stored only in keyring
- runtime session state can represent idle, connect, active, disconnect, and error flows
