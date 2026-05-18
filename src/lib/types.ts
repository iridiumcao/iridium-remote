export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export type Locale = 'en' | 'zh-CN' | 'zh-TW'

export type AppTheme = 'dark' | 'light'

export type ConnectionListDisplayMode = 'normal' | 'compact'

export type SessionRecordingMode = 'input_only' | 'full'

export type ConnectionHistoryDateRange =
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'all_time'

export type ConnectionHistoryCloseStatus = 'in_progress' | 'normal' | 'abnormal'

export type ConnectionHistoryDurationBucketKind =
  | 'under_5_minutes'
  | 'between_5_and_30_minutes'
  | 'between_30_minutes_and_2_hours'
  | 'over_2_hours'

export type SessionRecordingSettings = {
  enabled: boolean
  mode: SessionRecordingMode
  maxFileSizeMb: number
  maxTotalStorageGb: number
  retentionDays: number
  logDirectory?: string | null
}

export type AppSettings = {
  locale: Locale
  theme: AppTheme
  connectionListDisplayMode: ConnectionListDisplayMode
  collapsedGroups: string[]
  connectionHistoryTimeZone: string
  sessionRecording: SessionRecordingSettings
}

export const defaultAppSettings: AppSettings = {
  locale: 'en',
  theme: 'dark',
  connectionListDisplayMode: 'normal',
  collapsedGroups: [],
  connectionHistoryTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  sessionRecording: {
    enabled: false,
    mode: 'input_only',
    maxFileSizeMb: 100,
    maxTotalStorageGb: 5,
    retentionDays: 30,
    logDirectory: null,
  },
}

export type ConnectionRecord = {
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

export type SessionState = {
  sessionId: string
  connectionId: string
  connectionName: string
  status: SessionStatus
  message?: string
  recordingActive?: boolean
  recordingMode?: SessionRecordingMode | null
}

export type TerminalOutputEvent = {
  sessionId: string
  stream: 'stdout' | 'stderr'
  data: string
}

export type SessionRemovedEvent = {
  sessionId: string
}

export type CreateConnectionInput = {
  name: string
  groupName?: string | null
  host: string
  port?: number
  username: string
  password?: string
}

export type UpdateConnectionInput = {
  id: string
  name: string
  groupName?: string | null
  host: string
  port: number
  username: string
  password?: string
  clearSavedPassword: boolean
}

export type FileTransferDirection = 'upload' | 'download'

export type FileTransferInput = {
  connectionId: string
  direction: FileTransferDirection
  localPath: string
  remotePath: string
}

export type FileTransferResult = {
  message: string
}

export type RemotePathEntry = {
  name: string
  path: string
  isDirectory: boolean
}

export type RemotePathListing = {
  currentPath: string
  entries: RemotePathEntry[]
}

export type ConnectionExportRecord = {
  name: string
  groupName: string | null
  host: string
  port: number
  username: string
}

export type ConnectionsExportPayload = {
  version: number
  exportedAt: string
  settings?: AppSettings
  connections: ConnectionExportRecord[]
}

export type ImportConnectionsResult = {
  imported: number
  skipped: number
  settingsApplied: boolean
}

export type ConnectionFormSeed = {
  name: string
  groupName?: string | null
  host: string
  port: number
  username: string
}

export type AppError = {
  code: string
  message: string
  details?: string
}

export type UpdateCheckResult = {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  downloadUrl?: string
}

export type SessionRecordingStatus = {
  configuredEnabled: boolean
  passwordConfigured: boolean
  passwordLoaded: boolean
  canRecord: boolean
  pausedForRun: boolean
  needsPasswordVerification: boolean
  logDirectory: string
  currentStorageBytes: number
}

export type UpdateSessionRecordingSettingsResult = {
  appSettings: AppSettings
  status: SessionRecordingStatus
}

export type SessionLogFileInfo = {
  fileName: string
  path: string
  createdAt: string
  host: string
  username: string
  recordingMode: SessionRecordingMode
  part: number
}

export type SessionLogPreview = {
  files: SessionLogFileInfo[]
  previewText: string
  truncated: boolean
}

export type ConnectionHistoryHostSummary = {
  historyKey: string
  connectionId: string | null
  connectionName: string
  host: string
  port: number
  username: string
  deleted: boolean
  latestConnectionAt: string | null
  totalConnectionCount: number
  totalDurationSeconds: number
}

export type ConnectionHistorySessionRecord = {
  id: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  closeStatus: ConnectionHistoryCloseStatus
  isEstimated: boolean
}

export type ConnectionHistoryDurationBucket = {
  bucket: ConnectionHistoryDurationBucketKind
  sessionCount: number
}

export type ConnectionHistoryDailyHostUsage = {
  historyKey: string
  connectionId: string | null
  connectionName: string
  host: string
  port: number
  username: string
  deleted: boolean
  connectionCount: number
  totalDurationSeconds: number
}

export type ConnectionHistoryDailyUsage = {
  date: string
  totalConnectionCount: number
  totalDurationSeconds: number
  hosts: ConnectionHistoryDailyHostUsage[]
}

export type ConnectionHistoryOverview = {
  hosts: ConnectionHistoryHostSummary[]
  dailyUsage: ConnectionHistoryDailyUsage[]
}

export type ConnectionHistoryHostDetails = {
  host: ConnectionHistoryHostSummary
  sessions: ConnectionHistorySessionRecord[]
  durationBuckets: ConnectionHistoryDurationBucket[]
  summarizedSessionCount: number
  summarizedDurationSeconds: number
}
