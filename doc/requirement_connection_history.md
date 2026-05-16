# Iridium Remote - Connection History Requirements (V1)

## 1. Feature Overview

Implement a local **Connection History** feature for saved SSH hosts.

This feature lets users review:

- each host's historical connection sessions
- each session's start time, end time, and duration
- each host's total connection count
- each host's total connected duration

The feature is intended for:

- usage review
- troubleshooting
- lightweight auditing
- understanding how often and how long a host is used

This feature is local-only and does not sync across devices.

---

## 2. Naming and Menu Placement

### 2.1 User-facing names

- Feature name: `Connection History`
- Dialog title: `Connection History & Statistics`

### 2.2 File menu placement

The File menu should contain:

```text
File
  ├── New Connection
  ├── Import
  ├── Export
  ├── Connection History
  ├── Session Logs
  └── Exit
```

`Connection History` must appear **after `Export`** and **before `Session Logs`**.

---

## 3. Product Goals

V1 goals:

- show a reliable per-host connection history timeline
- show per-host aggregate statistics
- survive abnormal shutdowns as well as possible
- avoid unbounded history growth
- preserve historical facts even after a saved connection is deleted

V1 should favor clear, trustworthy data over overly complex analytics, but it may include a small number of simple summary charts when they directly improve readability.

---

## 4. Core User Experience

### 4.1 Entry point

Users open the feature from `File -> Connection History`.

The dialog should open as a desktop-style modal, similar to other top-level utility dialogs in the app.

### 4.2 Dialog structure

The `Connection History & Statistics` dialog should be split into two main areas:

1. **Host list / selector**
2. **Selected host details**
3. **Summary charts**

### Host list / selector

The host list should show all hosts that have recorded history.

Each row should display:

- connection display name if still available
- host
- username
- a deleted-connection marker when the original saved connection no longer exists
- the most recent connection time

The host list should support:

- search by connection name, host, and username
- sorting by most recent activity by default

### Selected host details

When a host is selected, the right side should show:

- summary statistics
- historical session records

Summary statistics should include at least:

- total connection count
- total connected duration
- most recent connection time

Historical session records should show one row per connection attempt/session with:

- start time
- end time
- duration
- close status

The list should be ordered with newest records first.
If a session is still running, the current filter should still show it as an in-progress row with an empty end time and a live duration up to now.

### Summary charts

The dialog should support simple pie-chart summaries that stay synchronized with the active date filter.

V1 should support the following charts:

1. **Cross-host connection duration share**
2. **Cross-host connection count share**
3. **Per-host session-duration distribution**

#### Cross-host connection duration share

This pie chart shows how total connected duration is distributed across different hosts in the current filter range.

Each slice represents one host.

The chart should use the same host identity as the host list:

- connection display name when available
- otherwise host and username snapshot

#### Cross-host connection count share

This pie chart shows how total connection count is distributed across different hosts in the current filter range.

Each slice represents one host.

This helps users quickly understand which hosts are used most frequently, even when those hosts are not the ones with the longest total duration.

#### Per-host session-duration distribution

This pie chart is shown for the currently selected host.

It should **not** create one slice per individual session, because that would become unreadable when many sessions exist.

Instead, the chart must group sessions into duration buckets and show the share of sessions in each bucket.

Recommended V1 buckets:

- less than 5 minutes
- 5 to 30 minutes
- 30 minutes to 2 hours
- more than 2 hours

Each slice represents the number of sessions that fall into that duration bucket for the selected host and current filter range.

If a host has too few sessions to make the chart meaningful, the UI may still show the buckets with zero values or replace the chart with a simple empty-state message.

### 4.3 Session status display

Each historical session row should show a human-readable close status:

- `In progress`
- `Normal`
- `Abnormal`

If the end time or duration was reconstructed after an abnormal shutdown, the UI should indicate that the value is estimated.

Example labels:

- `Abnormal interruption`
- `Estimated duration`

### 4.4 Date filtering

The dialog should support date-range filtering for the selected host.

V1 may provide quick filters such as:

- last 7 days
- last 30 days
- last 90 days
- all time

Statistics, charts, and the session list should stay consistent with the active filter.
Recent-range filters should include both completed sessions and still-running sessions whose `started_at` falls inside the selected range.

---

## 5. Session Capture Rules

The app should treat connection-history records as durable local facts that are separate from saved connection configuration.

Each SSH session should create or update history as follows.

### 5.1 On session start

When an SSH session is created successfully, the app must immediately insert a history row in a running state.

The initial row should include:

- connection snapshot fields
- `started_at`
- `last_activity_at` initialized to `started_at`
- `ended_at = NULL`

This ensures the history record exists even if the app later exits abnormally.

### 5.2 During the session

While the session is active, the app should update `last_activity_at` when terminal activity occurs.

To avoid excessive writes, these activity updates should be throttled.

Acceptable activity sources include:

- terminal output
- terminal input
- session state transitions that confirm the connection is still alive

### 5.3 On normal session end

When a session ends normally, the app should update the existing row with:

- `ended_at`
- `duration_seconds`
- `close_status = normal`
- `is_estimated = false`

### 5.4 On abnormal shutdown recovery

If the app is killed, crashes, or the machine loses power, some rows may still have `ended_at = NULL`.

On the next app startup, the app must scan unfinished history rows and recover them.

Recovery behavior:

1. Find rows with `ended_at IS NULL`
2. Set `ended_at` to `last_activity_at` when available
3. If `last_activity_at` is missing, fall back to `started_at`
4. Compute `duration_seconds` from `started_at` and the recovered `ended_at`
5. Mark the row as `close_status = abnormal`
6. Mark the row as `is_estimated = true`

This does not make the recovered duration perfectly accurate, but it keeps the record usable and clearly labeled.

---

## 6. Data Growth and Retention

Connection history must not grow without limit.

V1 should use a **detail + rollup** strategy.

### 6.1 Detailed session records

The app should keep recent per-session detail rows for direct viewing in the history list.

These rows contain one record per session and are the source for detailed start/end/duration views.

### 6.2 Aggregated rollups

The app should maintain aggregated statistics for older history so totals can remain accurate even after detailed rows are trimmed.

V1 should aggregate by:

- host identity snapshot
- calendar month

Each rollup should store at least:

- session count
- total duration

### 6.3 Retention policy

Recommended V1 behavior:

- keep detailed session rows for the most recent **365 days**
- roll older rows into monthly aggregates before deleting the detailed rows
- keep aggregate rows long term

This allows:

- recent records to remain inspectable in detail
- total statistics to remain available over a longer period
- database size to stay controlled

### 6.4 Cleanup timing

Cleanup and rollup work should run:

- at app startup
- after a session is finalized
- optionally after history dialog access if cleanup is due

Cleanup must not block SSH connection startup.

---

## 7. Deleting Connections

Deleting a saved connection must **not** delete its history by default.

Rationale:

- a saved connection is configuration
- connection history is a factual usage record

If the user deletes a connection:

- historical rows must be retained
- aggregate statistics must be retained
- the history UI must still display the host using snapshot fields
- the UI should mark the host as a deleted connection

V1 should not automatically cascade-delete history when a connection is removed.

The history feature should preserve a snapshot of the original connection metadata so records remain understandable after deletion.

Snapshot fields should include at least:

- connection display name
- host
- port
- username

---

## 8. Data Model

### 8.1 Detailed history table

Suggested table: `connection_history_sessions`

Suggested fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text | primary key |
| `connection_id` | text nullable | links to saved connection when still present |
| `connection_name_snapshot` | text | display name at session start |
| `host_snapshot` | text | host at session start |
| `port_snapshot` | integer | port at session start |
| `username_snapshot` | text | username at session start |
| `started_at` | text/datetime | session start |
| `last_activity_at` | text/datetime nullable | last known activity |
| `ended_at` | text/datetime nullable | null while running |
| `duration_seconds` | integer nullable | computed at close/recovery |
| `close_status` | text | `normal` or `abnormal` |
| `is_estimated` | integer/bool | true when recovered after abnormal shutdown |
| `created_at` | text/datetime | row creation time |
| `updated_at` | text/datetime | row update time |

Recommended indexes:

- `(connection_id, started_at DESC)`
- `(host_snapshot, username_snapshot, started_at DESC)`
- `(ended_at)`

### 8.2 Rollup table

Suggested table: `connection_history_rollups`

Suggested fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text | primary key |
| `connection_id` | text nullable | optional reference when still applicable |
| `connection_name_snapshot` | text | display name snapshot |
| `host_snapshot` | text | host snapshot |
| `port_snapshot` | integer | port snapshot |
| `username_snapshot` | text | username snapshot |
| `bucket_month` | text | e.g. `2026-05` |
| `session_count` | integer | number of sessions in the bucket |
| `total_duration_seconds` | integer | total duration for the bucket |
| `created_at` | text/datetime | row creation time |
| `updated_at` | text/datetime | row update time |

Rollups should be recomputable from detail rows if needed.

---

## 9. Statistics Rules

For a selected host, V1 must support at least these statistics:

- total connection count
- total connected duration
- latest connection time

These statistics should include:

- recent detailed rows that still exist
- older rolled-up rows

This ensures totals remain stable even after detailed cleanup.

The app should not double-count sessions when combining detail rows and rollups.

For chart calculations:

- cross-host duration share is based on total connected duration
- cross-host count share is based on total session count
- per-host duration distribution is based on bucketed session counts, not per-session pie slices

If rolled-up history is included in a charted range, the aggregation logic should still produce the same totals as the textual statistics for that range.

---

## 10. Scope Boundaries

V1 is focused on host-level history and totals.

Out of scope for V1:

- command-level analytics
- exporting connection-history data
- syncing history across devices
- restoring or reopening deleted connections from history
- manual editing of history rows
- cascade-delete options for history management UI
- highly customized chart builders, drill-down dashboards, or large numbers of chart types

---

## 11. Reliability Principles

The feature should follow these principles:

- prefer preserving a clearly labeled approximate record over losing the record entirely
- preserve statistics even when old detail rows are cleaned up
- preserve history after connection deletion unless the product later adds an explicit destructive flow
- keep history collection lightweight so it does not slow down SSH startup or terminal I/O

---

## 12. Summary

V1 `Connection History` should provide:

- a File-menu entry named `Connection History`
- a dialog titled `Connection History & Statistics`
- per-host historical session rows with start, end, duration, and close status
- per-host total connection count and total duration
- pie charts for cross-host duration share, cross-host count share, and selected-host duration-bucket distribution
- abnormal-shutdown recovery using a running row plus `last_activity_at`
- bounded storage through recent detail retention plus long-term rollups
- retained history even after the original saved connection is deleted
