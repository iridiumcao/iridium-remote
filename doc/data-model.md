# Data Model

## SQLite database

The desktop app stores local data in SQLite.

## `connections` table

Connection metadata is stored in SQLite.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer | Primary key |
| `name` | text | User-facing display name |
| `host` | text | SSH host |
| `port` | integer | SSH port |
| `username` | text | Login username |
| `group_name` | text nullable | Optional folder/group |
| `notes` | text nullable | Optional notes |
| `has_password` | integer | Cached indicator that keyring credentials exist |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | ISO timestamp |

## `app_settings` table

App preferences are stored as key/value rows.

| Column | Type | Notes |
| --- | --- | --- |
| `key` | text | Primary key |
| `value` | text | Serialized setting value |

Current keys:

- `locale`
- `theme`
- `connection_list_display_mode`
- `collapsed_connection_groups`

## Keyring model

Passwords are stored only in the system keyring.

- **service:** `iridium-remote`
- **account:** `username@host`

SQLite stores `has_password` only as a convenience flag for the UI.

## Runtime models

### Connection

Frontend and backend share a connection model with:

- id
- name
- host
- port
- username
- groupName
- notes
- hasPassword
- createdAt
- updatedAt

### AppSettings

`AppSettings` contains:

- `locale`
- `theme`
- `connectionListDisplayMode`
- `collapsedConnectionGroups`

### Session

An active session contains:

- `sessionId`
- `connectionId`
- `title`
- `status`

Session output is event-driven and buffered on the frontend per session.

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
      "groupName": "Servers",
      "notes": "Primary production host"
    }
  ]
}
```

Rules:

- app settings are included when exporting from the current app
- passwords are never included
- imports skip duplicates
- imports may restore settings when the backup contains them
- unknown future fields should be ignored when practical
