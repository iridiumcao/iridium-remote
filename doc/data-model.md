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

## `connection_history_sessions` table

Detailed connection-history rows are stored in SQLite.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text | Primary key UUID |
| `history_key` | text | Stable history subject key derived from connection id + host + port + username snapshot |
| `connection_id` | text nullable | Saved connection id when the historical snapshot still belongs to that connection |
| `connection_name_snapshot` | text | Display name at session start |
| `host_snapshot` | text | Host at session start |
| `port_snapshot` | integer | Port at session start |
| `username_snapshot` | text | Username at session start |
| `started_at` | text | ISO timestamp |
| `last_activity_at` | text nullable | Throttled last-known activity timestamp |
| `ended_at` | text nullable | ISO timestamp when the session was finalized |
| `duration_seconds` | integer nullable | Stored total duration in seconds |
| `close_status` | text | `normal` or `abnormal` |
| `is_estimated` | integer | `1` when startup recovery had to reconstruct the end time |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | ISO timestamp |

## `connection_history_rollups` table

Older connection-history detail rows are compacted into monthly host rollups.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text | Primary key UUID |
| `history_key` | text | Same history subject key used by detail rows |
| `connection_id` | text nullable | Saved connection id when still applicable |
| `connection_name_snapshot` | text | Display name snapshot |
| `host_snapshot` | text | Host snapshot |
| `port_snapshot` | integer | Port snapshot |
| `username_snapshot` | text | Username snapshot |
| `bucket_month` | text | `YYYY-MM` month bucket |
| `session_count` | integer | Number of sessions rolled into the month |
| `total_duration_seconds` | integer | Total duration of the month bucket |
| `latest_started_at` | text nullable | Latest session start time represented by the bucket |
| `under_5_minutes_count` | integer | Duration-bucket count for `< 5 minutes` |
| `between_5_and_30_minutes_count` | integer | Duration-bucket count for `5 to 30 minutes` |
| `between_30_minutes_and_2_hours_count` | integer | Duration-bucket count for `30 minutes to 2 hours` |
| `over_2_hours_count` | integer | Duration-bucket count for `> 2 hours` |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | ISO timestamp |

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
- `logDirectory?`

The recording password is runtime-only and is never stored in SQLite.

### Session

An active session contains:

- `sessionId`
- `connectionId`
- `connectionName`
- `status`
- `message?`

Session output is event-driven and buffered on the frontend per session.

### Connection history

Connection history overview data contains:

- `historyKey`
- `connectionId`
- `connectionName`
- `host`
- `port`
- `username`
- `deleted`
- `latestConnectionAt`
- `totalConnectionCount`
- `totalDurationSeconds`

Detailed host history also contains:

- `sessions[]`
- `durationBuckets[]`
- `summarizedSessionCount`
- `summarizedDurationSeconds`

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
