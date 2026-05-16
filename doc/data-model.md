# Data Model

## SQLite database

The desktop app stores local data in SQLite.

## `connections` table

Connection metadata is stored in SQLite.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text | Primary key UUID |
| `name` | text | User-facing display name |
| `host` | text | SSH host |
| `port` | integer | SSH port |
| `username` | text | Login username |
| `group_name` | text nullable | Optional folder/group stored in Title Case |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | ISO timestamp |

## `app_settings` table

App preferences are stored as key/value rows.

| Column | Type | Notes |
| --- | --- | --- |
| `key` | text | Primary key |
| `value` | text | Serialized setting value |

Current key:

- `app` - serialized `AppSettings` JSON payload

## Keyring model

Passwords are stored only in the system keyring.

- **service:** `iridium-remote`
- **account:** `username@host`

`has_password` is not persisted in SQLite; the backend enriches returned connection records by checking the keyring when it serves connection data.

## Runtime models

### Connection

Frontend and backend share a connection model with:

- id
- name
- host
- port
- username
- groupName
- hasPassword
- createdAt
- updatedAt

### AppSettings

`AppSettings` contains:

- `locale`
- `theme`
- `connectionListDisplayMode`
- `collapsedGroups`
- `sessionRecording`

### SessionRecordingSettings

`SessionRecordingSettings` contains:

- `enabled`
- `mode`
- `maxFileSizeMb`
- `maxTotalStorageGb`
- `retentionDays`

The recording password is runtime-only and is never stored in SQLite.

### Session

An active session contains:

- `sessionId`
- `connectionId`
- `connectionName`
- `status`
- `message?`

Session output is event-driven and buffered on the frontend per session.

### TerminalOutputEvent

Terminal output events contain:

- `sessionId`
- `stream`
- `data`

### Session recording status

Runtime-only session recording status contains:

- `configuredEnabled`
- `passwordLoaded`
- `canRecord`
- `logDirectory`
- `currentStorageBytes`

### Session log files

Session recordings are stored outside SQLite as encrypted `.irlog` files.

- header line
- plaintext metadata line
- encrypted chunk lines

Plaintext metadata includes only non-secret context such as host, username, mode, timestamp, salt, and rotation part. The payload chunks are compressed and then encrypted independently.

## Export file model

Connection export/import uses JSON.

```json
{
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00Z",
  "settings": {
    "locale": "en",
    "theme": "dark",
    "connectionListDisplayMode": "compact",
    "collapsedGroups": ["Servers"]
  },
  "connections": [
    {
      "name": "Production",
      "host": "prod.example.com",
      "port": 22,
      "username": "admin",
      "groupName": "Servers"
    }
  ]
}
```

Rules:

- app settings are included when exporting from the current app
- passwords are never included
- imports skip duplicates
- group names are case-insensitive and normalized to Title Case on save/import
- imports may restore settings when the backup contains them
- unknown future fields should be ignored when practical
