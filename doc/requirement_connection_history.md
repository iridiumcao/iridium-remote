# Iridium Remote - Connection History Requirements (V1)

## 1. Feature Overview

Implement a local **Connection History** feature for saved SSH hosts.

This feature lets users review:

- each host's historical connection sessions
- each session's start time, end time, and duration
- each host's total connection count
- each host's total connected duration
- each local day’s total app usage time through recorded SSH connection duration
- each local day’s duration split across different hosts

The feature is intended for:

- usage review
- troubleshooting
- lightweight auditing
- understanding how often and how long a host is used
- understanding daily usage patterns

This feature is local-only and does not sync across devices.

---

## 2. Naming and Workspace Placement

### 2.1 User-facing names

- Sidebar tab name: `History`
- Workspace subject: `Connection History & Statistics`

### 2.2 Sidebar workspace placement

The main left panel should contain workspace tabs:

```text
Sidebar Tabs
  ├── Connections
  ├── History
  └── Logs (only when session recording is enabled)
```

`History` should open an in-window workspace rather than a modal dialog.

---

## 3. Product Goals

V1 goals:

- show a reliable per-host connection history timeline
- show per-host aggregate statistics
- show daily usage statistics based on connection duration
- survive abnormal shutdowns as well as possible
- avoid unbounded history growth
- preserve historical facts even after a saved connection is deleted

V1 should favor clear, trustworthy data over overly complex analytics, but it may include a small number of simple summary charts when they directly improve readability.

---

## 4. Core User Experience

### 4.1 Entry point

Users open the feature from the left-panel `History` tab.

The workspace should reuse the main application shell instead of opening a desktop-style modal.

### 4.2 Dialog structure

The `History` workspace should be split into two main areas:

1. **Left navigation**
   - overall-statistics links
   - host list / selector
2. **Right content area**
   - selected overall-statistics view or selected host details

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
The `Overall statistics` and `Host statistics` groups in the left navigation should be collapsible so users can focus on the area they are currently using.

V1 should support the following charts:

1. **Cross-host connection duration share**
2. **Cross-host connection count share**
3. **Per-host session-duration distribution**
4. **Daily total usage**
5. **Daily per-host duration share**

#### Cross-host connection duration share

This pie chart shows how total connected duration is distributed across different hosts in the current filter range.

Each slice represents one host.

The chart should use the same host identity as the host list:

- connection display name when available
- otherwise host and username snapshot

The companion host list beside this chart should:

- default to descending order by total duration for the current filter
- allow switching to descending order by latest connection time
- render a horizontal value bar for each host, scaled relative to the largest duration in the current result set

#### Cross-host connection count share

This pie chart shows how total connection count is distributed across different hosts in the current filter range.

Each slice represents one host.

This helps users quickly understand which hosts are used most frequently, even when those hosts are not the ones with the longest total duration.

The companion host list beside this chart should:

- default to descending order by total connection count for the current filter
- allow switching to descending order by latest connection time
- render a horizontal value bar for each host, scaled relative to the largest connection count in the current result set

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

#### Daily total usage

The daily total usage chart shows how long the current user used the app on each local day.

For V1, "usage time" means the sum of recorded SSH connection durations. It does not include time when the app is open but no SSH session is connected.

This chart should normally use a bar chart or line chart rather than a pie chart, because the primary task is comparing usage across dates.

Each bar or point represents one local calendar day in the active date filter.

The chart should support:

- total duration per day across all hosts
- zero-value days inside the selected range, when the range is bounded
- a clear empty state when no usage exists for the selected range

#### Daily per-host duration share

The daily per-host duration share view shows how a selected day’s connected duration is distributed across different hosts.

A pie chart is appropriate for this view because it answers a composition question: "on this day, which hosts consumed the connected time?"

Each slice represents one host.

The chart should use the same host identity as the host list:

- connection display name when available
- otherwise host and username snapshot

The UI should avoid rendering one pie chart per day by default, because many daily pies become difficult to scan. Instead, V1 should use one of these patterns:

- select a day from the daily total usage chart and show a single per-host pie chart for that day
- show the per-host pie chart for the most recent day with usage in the active range
- show a compact table beside the chart with each host’s duration and percentage for the selected day

When the user changes the active date filter, the selected day should remain selected only if it is still inside the new range. Otherwise the UI should choose the most recent day with usage.

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

Daily statistics should use the same active date filter, but the unit of grouping is the user’s configured local calendar day.

### 4.5 User time zone setting

Daily statistics require an explicit user time zone setting.

The app should provide a setting for the user’s preferred statistics time zone.

Recommended V1 behavior:

- default to the operating system’s current time zone on first launch
- store the selected time zone in app settings
- use the selected time zone for connection-history date filters, daily grouping, and displayed daily labels
- continue storing raw timestamps in UTC/RFC3339 so historical records remain stable

The setting should use an IANA time zone identifier where available, such as:

- `Asia/Shanghai`
- `America/Los_Angeles`
- `Europe/Berlin`

If the platform cannot provide or validate an IANA time zone, the app may fall back to a fixed UTC offset for display and grouping, but IANA time zones are preferred because they handle daylight saving transitions.

Changing the user time zone should not mutate historical session rows. It should only change how existing timestamps are grouped and displayed.

### 4.6 Daily usage view

The dialog should include a daily usage view that helps the current user understand per-day usage.

The daily usage view should show:

- date
- total connected duration for that day
- total connection count for that day
- most-used host by duration for that day
- optional per-host breakdown for the selected day

The daily usage view should support:

- selecting a day
- showing a per-host breakdown for the selected day
- sorting daily rows newest first in a table view
- using the active date filter

The daily usage view is user-local and based only on local connection-history records.

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
- local calendar day for daily usage statistics

Each rollup should store at least:

- session count
- total duration
- for daily rollups, the time zone or local-date basis used to calculate the bucket

### 6.3 Retention policy

Recommended V1 behavior:

- keep detailed session rows for the most recent **365 days**
- roll older rows into monthly and daily aggregates before deleting the detailed rows
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

### 8.3 Daily usage rollup table

Suggested table: `connection_history_daily_rollups`

The daily rollup table stores per-day statistics so the daily usage view remains fast and accurate after detailed rows are trimmed.

Suggested fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text | primary key |
| `local_date` | text | local calendar date, e.g. `2026-05-16` |
| `time_zone` | text | IANA time zone used to compute `local_date`, e.g. `Asia/Shanghai` |
| `history_key` | text nullable | host identity key; nullable or special value may represent all-host total |
| `connection_id` | text nullable | optional reference when still applicable |
| `connection_name_snapshot` | text nullable | display name snapshot for host-level rows |
| `host_snapshot` | text nullable | host snapshot for host-level rows |
| `port_snapshot` | integer nullable | port snapshot for host-level rows |
| `username_snapshot` | text nullable | username snapshot for host-level rows |
| `session_count` | integer | number of sessions contributing to the day/host bucket |
| `total_duration_seconds` | integer | total duration within this local day bucket |
| `created_at` | text/datetime | row creation time |
| `updated_at` | text/datetime | row update time |

Recommended uniqueness:

- `(local_date, time_zone, history_key)` for host-level daily rows

The app may derive all-host daily totals by summing host-level rows, or store explicit all-host rows if that simplifies query performance.

### 8.4 Settings fields

The app settings should include a connection-history statistics time zone field.

Suggested field:

| Field | Type | Notes |
| --- | --- | --- |
| `connection_history_time_zone` | text nullable | IANA time zone for date filters and daily grouping; defaults to OS time zone when missing |

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
- daily total usage is based on total connected duration grouped by configured local date
- daily per-host duration share is based on each host’s duration within the selected local day

If rolled-up history is included in a charted range, the aggregation logic should still produce the same totals as the textual statistics for that range.

### 9.1 Daily grouping and cross-day sessions

Daily statistics must split session duration by local calendar day using the configured statistics time zone.

If a session crosses midnight in the configured time zone, its duration should be split across the affected local days.

Example:

- configured time zone: `Asia/Shanghai`
- session starts at `2026-05-16 23:50`
- session ends at `2026-05-17 00:20`
- daily usage should count 10 minutes on `2026-05-16` and 20 minutes on `2026-05-17`

The same split rule applies to per-host daily duration.

Still-running sessions should contribute live duration up to the current time when they are displayed in recent date filters.

The sum of per-host daily durations should equal the all-host daily total for the same date, except for minor rounding differences in display formatting.

### 9.2 Time zone changes and rollups

Because daily buckets depend on time zone, changing the configured statistics time zone can change which local day a session belongs to.

V1 should handle this in one of these ways:

- recompute daily statistics from retained detail rows when the setting changes
- maintain daily rollups per time zone
- invalidate and rebuild affected daily rollups when possible

The UI must avoid silently mixing daily rollups computed with different time zones.

If older detailed rows have already been trimmed and only daily rollups remain, and the user changes the time zone, the app should either:

- preserve the old rollup time zone and clearly label the limitation, or
- rebuild only the portion that can be accurately recomputed

V1 should prefer correctness and clear labeling over pretending old daily buckets can be perfectly converted without detail rows.

---

## 10. Scope Boundaries

V1 is focused on host-level history, totals, and daily usage summaries.

Out of scope for V1:

- command-level analytics
- exporting connection-history data
- syncing history across devices
- restoring or reopening deleted connections from history
- manual editing of history rows
- cascade-delete options for history management UI
- highly customized chart builders, drill-down dashboards, or large numbers of chart types
- detailed idle-time detection while a connection is open
- measuring app-open time when no SSH session is connected

---

## 11. Reliability Principles

The feature should follow these principles:

- prefer preserving a clearly labeled approximate record over losing the record entirely
- preserve statistics even when old detail rows are cleaned up
- keep daily statistics consistent with the configured user time zone
- preserve history after connection deletion unless the product later adds an explicit destructive flow
- keep history collection lightweight so it does not slow down SSH startup or terminal I/O

---

## 12. Summary

V1 `Connection History` should provide:

- a sidebar workspace tab named `History`
- an in-window history workspace instead of a modal dialog
- per-host historical session rows with start, end, duration, and close status
- per-host total connection count and total duration
- pie charts for cross-host duration share, cross-host count share, and selected-host duration-bucket distribution
- daily usage statistics grouped by the user’s configured time zone
- a daily total usage chart
- a selected-day per-host duration share chart, preferably as a pie chart
- a settings field for the connection-history statistics time zone
- abnormal-shutdown recovery using a running row plus `last_activity_at`
- bounded storage through recent detail retention plus long-term rollups
- retained history even after the original saved connection is deleted
- preserved selected host/filter state when switching away and back
