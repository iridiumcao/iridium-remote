import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { APP_VERSION, LATEST_RELEASE_API_URL } from '../lib/appInfo'
import { normalizeCollapsedGroups, normalizeGroupName } from '../lib/groups'
import { defaultAppSettings } from '../lib/types'
import type {
  AppSettings,
  AppError,
  ConnectionRecord,
  ConnectionsExportPayload,
  CreateConnectionInput,
  FileTransferInput,
  FileTransferResult,
  ImportConnectionsResult,
  RemotePathListing,
  SessionLogPreview,
  SessionRecordingMode,
  SessionRecordingSettings,
  SessionRecordingStatus,
  SessionRemovedEvent,
  SessionState,
  TerminalOutputEvent,
  UpdateCheckResult,
  UpdateConnectionInput,
  UpdateSessionRecordingSettingsResult,
} from '../lib/types'

type Unsubscribe = () => void | Promise<void>

type GitHubLatestReleaseResponse = {
  tag_name?: string
  html_url?: string
}

const isTauriRuntime = () =>
  typeof window !== 'undefined' &&
  typeof (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    'undefined'

type MockStore = {
  settings: AppSettings
  connections: ConnectionRecord[]
  sessions: SessionState[]
  sessionRecordingPassword: string | null
  sessionLogs: Array<{
    path: string
    text: string
    createdAt: string
    host: string
    username: string
    recordingMode: SessionRecordingMode
    part: number
  }>
  sessionLogPathsBySessionId: Map<string, string>
  sessionListeners: Set<(state: SessionState) => void>
  sessionRemovedListeners: Set<(event: SessionRemovedEvent) => void>
  terminalListeners: Set<(event: TerminalOutputEvent) => void>
}

const MOCK_SETTINGS_STORAGE_KEY = 'iridium-remote.mock-settings'
const MOCK_LOG_DIRECTORY = 'C:\\mock\\SessionLogs'

const loadMockSettings = (): AppSettings => {
  if (typeof window === 'undefined') {
    return defaultAppSettings
  }

  try {
    const raw = window.localStorage.getItem(MOCK_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return defaultAppSettings
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return normalizeMockSettings({
      ...defaultAppSettings,
      ...parsed,
      sessionRecording: {
        ...defaultAppSettings.sessionRecording,
        ...(parsed.sessionRecording ?? {}),
      },
    })
  } catch {
    return defaultAppSettings
  }
}

const persistMockSettings = (settings: AppSettings) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(MOCK_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

const normalizeMockSettings = (settings: AppSettings): AppSettings => ({
  ...settings,
  collapsedGroups: normalizeCollapsedGroups(settings.collapsedGroups),
})

const sanitizeMockVisibleText = (data: string) =>
  data
    .replace(
      new RegExp(
        String.raw`\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))`,
        'g',
      ),
      '',
    )
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

const mockStore: MockStore = {
  settings: loadMockSettings(),
  connections: [],
  sessions: [],
  sessionRecordingPassword: null,
  sessionLogs: [],
  sessionLogPathsBySessionId: new Map(),
  sessionListeners: new Set(),
  sessionRemovedListeners: new Set(),
  terminalListeners: new Set(),
}

const buildMockRecordingStatus = (): SessionRecordingStatus => ({
  configuredEnabled: mockStore.settings.sessionRecording.enabled,
  passwordLoaded: Boolean(mockStore.sessionRecordingPassword),
  canRecord:
    mockStore.settings.sessionRecording.enabled && Boolean(mockStore.sessionRecordingPassword),
  logDirectory: MOCK_LOG_DIRECTORY,
  currentStorageBytes: mockStore.sessionLogs.reduce(
    (total, log) => total + new TextEncoder().encode(log.text).length,
    0,
  ),
})

const appendMockSessionLog = (sessionId: string, data: string) => {
  const logPath = mockStore.sessionLogPathsBySessionId.get(sessionId)
  if (!logPath) {
    return
  }

  mockStore.sessionLogs = mockStore.sessionLogs.map((log) =>
    log.path === logPath
      ? {
          ...log,
          text: `${log.text}${data}`,
        }
      : log,
  )
}

const emitMockSession = (session: SessionState) => {
  const existingIndex = mockStore.sessions.findIndex((item) => item.sessionId === session.sessionId)

  if (existingIndex >= 0) {
    mockStore.sessions = mockStore.sessions.map((item) =>
      item.sessionId === session.sessionId ? session : item,
    )
  } else {
    mockStore.sessions = [...mockStore.sessions, session]
  }

  for (const listener of mockStore.sessionListeners) {
    listener(session)
  }
}

const emitMockSessionRemoved = (sessionId: string) => {
  mockStore.sessions = mockStore.sessions.filter((session) => session.sessionId !== sessionId)
  mockStore.sessionLogPathsBySessionId.delete(sessionId)
  const payload: SessionRemovedEvent = { sessionId }
  for (const listener of mockStore.sessionRemovedListeners) {
    listener(payload)
  }
}

const emitMockOutput = (sessionId: string, data: string) => {
  const session = mockStore.sessions.find((item) => item.sessionId === sessionId)
  if (session?.recordingActive && session.recordingMode === 'full') {
    appendMockSessionLog(sessionId, sanitizeMockVisibleText(data))
  }
  const payload: TerminalOutputEvent = { sessionId, stream: 'stdout', data }
  for (const listener of mockStore.terminalListeners) {
    listener(payload)
  }
}

const now = () => new Date().toISOString()

const getRemoteFileName = (path: string) => {
  const normalized = path.trim().replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) ?? ''
}

const fileNameFromPath = (path: string) => {
  const normalized = path.trim().replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) ?? path
}

const getExportFileName = (payload: ConnectionsExportPayload) => {
  const timestamp = payload.exportedAt.replace(/[:.]/g, '-')
  return `iridium-remote-backup-${timestamp}.json`
}

const randomId = () => crypto.randomUUID()
type TransferLocalPathSelectionMode = 'file' | 'directory'

const buildMockSessionLogPreview = (paths: string[], password: string): SessionLogPreview => {
  if (!mockStore.sessionRecordingPassword || password.trim() !== mockStore.sessionRecordingPassword) {
    throw new Error('Failed to decrypt the selected session logs. Check the encryption password.')
  }

  const selectedLogs = mockStore.sessionLogs.filter((log) => paths.includes(log.path))
  return {
    files: selectedLogs.map((log) => ({
      fileName: fileNameFromPath(log.path),
      path: log.path,
      createdAt: log.createdAt,
      host: log.host,
      username: log.username,
      recordingMode: log.recordingMode,
      part: log.part,
    })),
    previewText: selectedLogs.map((log) => log.text).join(''),
    truncated: false,
  }
}

type ParsedVersion = {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

const normalizeVersion = (value: string) => value.trim().replace(/^v/i, '')

const parseVersion = (value: string): ParsedVersion | null => {
  const match = normalizeVersion(value).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) {
    return null
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

const compareIdentifiers = (left: string, right: string) => {
  const leftIsNumeric = /^\d+$/.test(left)
  const rightIsNumeric = /^\d+$/.test(right)

  if (leftIsNumeric && rightIsNumeric) {
    return Number(left) - Number(right)
  }

  if (leftIsNumeric) {
    return -1
  }

  if (rightIsNumeric) {
    return 1
  }

  return left.localeCompare(right)
}

const compareVersions = (left: string, right: string) => {
  const leftVersion = parseVersion(left)
  const rightVersion = parseVersion(right)

  if (!leftVersion || !rightVersion) {
    throw new Error('Invalid version format.')
  }

  if (leftVersion.major !== rightVersion.major) {
    return leftVersion.major - rightVersion.major
  }

  if (leftVersion.minor !== rightVersion.minor) {
    return leftVersion.minor - rightVersion.minor
  }

  if (leftVersion.patch !== rightVersion.patch) {
    return leftVersion.patch - rightVersion.patch
  }

  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) {
    return 0
  }

  if (leftVersion.prerelease.length === 0) {
    return 1
  }

  if (rightVersion.prerelease.length === 0) {
    return -1
  }

  const segmentCount = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length)
  for (let index = 0; index < segmentCount; index += 1) {
    const leftSegment = leftVersion.prerelease[index]
    const rightSegment = rightVersion.prerelease[index]

    if (leftSegment === undefined) {
      return -1
    }

    if (rightSegment === undefined) {
      return 1
    }

    const comparison = compareIdentifiers(leftSegment, rightSegment)
    if (comparison !== 0) {
      return comparison
    }
  }

  return 0
}

export const appClient = {
  isTauriRuntime,

  async closeCurrentWindow() {
    if (!isTauriRuntime()) {
      window.close()
      return
    }

    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  },

  async openExternalUrl(url: string) {
    if (!isTauriRuntime()) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  },

  async checkForUpdates() {
    if (isTauriRuntime()) {
      return invoke<UpdateCheckResult>('check_for_updates')
    }

    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub release lookup failed with status ${response.status}.`)
    }

    const payload = (await response.json()) as GitHubLatestReleaseResponse
    const latestVersion = payload.tag_name ? normalizeVersion(payload.tag_name) : ''
    const downloadUrl = payload.html_url?.trim()

    if (!latestVersion || !parseVersion(latestVersion) || !parseVersion(APP_VERSION)) {
      throw new Error('GitHub returned an invalid release version.')
    }

    if (compareVersions(APP_VERSION, latestVersion) < 0 && !downloadUrl) {
      throw new Error('GitHub returned no download URL for the latest release.')
    }

    return {
      currentVersion: APP_VERSION,
      latestVersion,
      updateAvailable: compareVersions(APP_VERSION, latestVersion) < 0,
      downloadUrl,
    } satisfies UpdateCheckResult
  },

  normalizeError(cause: unknown): AppError {
    if (
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      'message' in cause
    ) {
      return cause as AppError
    }

    if (cause instanceof Error) {
      return {
        code: 'INTERNAL_ERROR',
        message: cause.message,
      }
    }

    return {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    }
  },

  async listConnections() {
    if (!isTauriRuntime()) {
      return [...mockStore.connections]
    }

    return invoke<ConnectionRecord[]>('list_connections')
  },

  async getAppSettings() {
    if (!isTauriRuntime()) {
      return normalizeMockSettings(mockStore.settings)
    }

    return invoke<AppSettings>('get_app_settings')
  },

  async updateAppSettings(settings: AppSettings) {
    if (!isTauriRuntime()) {
      const normalized = normalizeMockSettings(settings)
      mockStore.settings = normalized
      persistMockSettings(normalized)
      return normalized
    }

    return invoke<AppSettings>('update_app_settings', { settings })
  },

  async createConnection(input: CreateConnectionInput) {
    if (!isTauriRuntime()) {
      const timestamp = now()
      const created: ConnectionRecord = {
        id: randomId(),
        name: input.name.trim(),
        groupName: normalizeGroupName(input.groupName),
        host: input.host.trim(),
        port: input.port ?? 22,
        username: input.username.trim(),
        hasPassword: Boolean(input.password?.trim()),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      mockStore.connections = [...mockStore.connections, created]
      return created
    }

    return invoke<ConnectionRecord>('create_connection', { input })
  },

  async updateConnection(input: UpdateConnectionInput) {
    if (!isTauriRuntime()) {
      mockStore.connections = mockStore.connections.map((connection) =>
        connection.id === input.id
          ? {
              ...connection,
              ...input,
              groupName: normalizeGroupName(input.groupName),
              hasPassword: input.clearSavedPassword
                ? false
                : input.password?.trim()
                  ? true
                  : connection.hasPassword,
              updatedAt: now(),
            }
          : connection,
      )

      const updated = mockStore.connections.find((connection) => connection.id === input.id)

      if (!updated) {
        throw {
          code: 'DATABASE_ERROR',
          message: 'Connection not found.',
        } satisfies AppError
      }

      return updated
    }

    return invoke<ConnectionRecord>('update_connection', { input })
  },

  async deleteConnection(id: string) {
    if (!isTauriRuntime()) {
      mockStore.connections = mockStore.connections.filter((connection) => connection.id !== id)
      const sessionIds = mockStore.sessions
        .filter((session) => session.connectionId === id)
        .map((session) => session.sessionId)

      for (const sessionId of sessionIds) {
        emitMockSessionRemoved(sessionId)
      }

      return
    }

    await invoke('delete_connection', { id })
  },

  async connectSession(connectionId: string) {
    if (!isTauriRuntime()) {
      const connection = mockStore.connections.find((item) => item.id === connectionId)

      if (!connection) {
        throw {
          code: 'DATABASE_ERROR',
          message: 'Connection not found.',
        } satisfies AppError
      }

      const session: SessionState = {
        sessionId: randomId(),
        connectionId,
        connectionName: connection.name,
        status: 'connected',
        message: `Connected to ${connection.host} (mock session).`,
        recordingActive: false,
        recordingMode: null,
      }

      if (mockStore.settings.sessionRecording.enabled && !mockStore.sessionRecordingPassword) {
        throw {
          code: 'VALIDATION_ERROR',
          message:
            'Session recording is enabled but the encryption password is not loaded. Open Settings > Session Recording and enter it again.',
        } satisfies AppError
      }

      if (mockStore.settings.sessionRecording.enabled && mockStore.sessionRecordingPassword) {
        session.recordingActive = true
        session.recordingMode = mockStore.settings.sessionRecording.mode
        const createdAt = now()
        const path = `${MOCK_LOG_DIRECTORY}\\${createdAt.replace(/[:.]/g, '-')}_${connection.username}_${connection.host}.irlog`
        mockStore.sessionLogs = [
          ...mockStore.sessionLogs,
          {
            path,
            text: '',
            createdAt,
            host: connection.host,
            username: connection.username,
            recordingMode: mockStore.settings.sessionRecording.mode,
            part: 1,
          },
        ]
        mockStore.sessionLogPathsBySessionId.set(session.sessionId, path)
      }

      emitMockSession(session)
      emitMockOutput(session.sessionId, `Connected to ${connection.username}@${connection.host}\r\n`)
      emitMockOutput(
        session.sessionId,
        'This is a browser preview session. Run through Tauri for a real SSH shell.\r\n',
      )
      return session
    }

    return invoke<SessionState>('connect_session', { connectionId })
  },

  async writeSessionInput(sessionId: string, data: string) {
    if (!isTauriRuntime()) {
      const session = mockStore.sessions.find((item) => item.sessionId === sessionId)
      if (session?.recordingActive && session.recordingMode === 'input_only') {
        appendMockSessionLog(sessionId, data.replace(/\r/g, '\n'))
      }
      emitMockOutput(sessionId, data)
      return
    }

    await invoke('write_session_input', { sessionId, data })
  },

  async resizeSession(sessionId: string, cols: number, rows: number) {
    if (!isTauriRuntime()) {
      return
    }

    await invoke('resize_session', { sessionId, cols, rows })
  },

  async disconnectSession(sessionId: string) {
    if (!isTauriRuntime()) {
      const existing = mockStore.sessions.find((session) => session.sessionId === sessionId)
      if (!existing) {
        throw {
          code: 'NO_ACTIVE_SESSION',
          message: 'Session not found.',
        } satisfies AppError
      }

      const nextState: SessionState = {
        ...existing,
        status: 'disconnected',
        message: 'Session closed.',
      }

      emitMockSession(nextState)
      return nextState
    }

    return invoke<SessionState>('disconnect_session', { sessionId })
  },

  async closeSession(sessionId: string) {
    if (!isTauriRuntime()) {
      emitMockSessionRemoved(sessionId)
      return
    }

    await invoke('close_session', { sessionId })
  },

  async getSessionStates() {
    if (!isTauriRuntime()) {
      return [...mockStore.sessions]
    }

    return invoke<SessionState[]>('get_session_states')
  },

  async exportConnections() {
    if (!isTauriRuntime()) {
      return {
        version: 1,
        exportedAt: now(),
        settings: mockStore.settings,
        connections: mockStore.connections.map((connection) => ({
          name: connection.name,
          groupName: connection.groupName,
          host: connection.host,
          port: connection.port,
          username: connection.username,
        })),
      } satisfies ConnectionsExportPayload
    }

    return invoke<ConnectionsExportPayload>('export_connections')
  },

  async saveExportConnections(payload: ConnectionsExportPayload) {
    if (!isTauriRuntime()) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = getExportFileName(payload)
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      return true
    }

    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      defaultPath: getExportFileName(payload),
      filters: [
        {
          name: 'JSON',
          extensions: ['json'],
        },
      ],
    })

    if (!path) {
      return false
    }

    await invoke('write_export_file', { path, payload })
    return true
  },

  async importConnections(payload: ConnectionsExportPayload) {
    if (!isTauriRuntime()) {
      let settingsApplied = false

      if (payload.settings) {
        mockStore.settings = {
          ...defaultAppSettings,
          ...payload.settings,
          sessionRecording: {
            ...defaultAppSettings.sessionRecording,
            ...payload.settings.sessionRecording,
          },
        }
        mockStore.settings = normalizeMockSettings(mockStore.settings)
        persistMockSettings(mockStore.settings)
        settingsApplied = true
      }

      const existing = new Set(
        mockStore.connections.map(
          (connection) =>
            `${normalizeGroupName(connection.groupName) ?? ''}|${connection.name.toLowerCase()}|${connection.host.toLowerCase()}|${connection.port}|${connection.username.toLowerCase()}`,
        ),
      )

      let imported = 0
      let skipped = 0

      for (const entry of payload.connections) {
        const signature = `${normalizeGroupName(entry.groupName) ?? ''}|${entry.name.toLowerCase()}|${entry.host.toLowerCase()}|${entry.port}|${entry.username.toLowerCase()}`
        if (existing.has(signature)) {
          skipped += 1
          continue
        }

        existing.add(signature)
        imported += 1
        mockStore.connections = [
          ...mockStore.connections,
            {
              id: randomId(),
              name: entry.name,
              groupName: normalizeGroupName(entry.groupName),
              host: entry.host,
            port: entry.port,
            username: entry.username,
            hasPassword: false,
            createdAt: now(),
            updatedAt: now(),
          },
        ]
      }

      return {
        imported,
        skipped,
        settingsApplied,
      } satisfies ImportConnectionsResult
    }

    return invoke<ImportConnectionsResult>('import_connections', { payload })
  },

  async transferFile(input: FileTransferInput) {
    if (!isTauriRuntime()) {
      return {
        message:
          input.direction === 'upload'
            ? `Uploaded ${input.localPath} to ${input.remotePath}.`
            : `Downloaded ${input.remotePath} to ${input.localPath}.`,
      } satisfies FileTransferResult
    }

    return invoke<FileTransferResult>('transfer_file', { input })
  },

  async getSessionRecordingStatus() {
    if (!isTauriRuntime()) {
      return buildMockRecordingStatus()
    }

    return invoke<SessionRecordingStatus>('get_session_recording_status')
  },

  async updateSessionRecordingSettings(
    settings: SessionRecordingSettings,
    password?: string,
  ) {
    if (!isTauriRuntime()) {
      const normalizedPassword = password?.trim()
      if (normalizedPassword && normalizedPassword.length < 8) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Session recording requires an encryption password with at least 8 characters.',
        } satisfies AppError
      }

      if (settings.enabled && !normalizedPassword && !mockStore.sessionRecordingPassword) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Session recording requires an encryption password with at least 8 characters.',
        } satisfies AppError
      }

      mockStore.settings = normalizeMockSettings({
        ...mockStore.settings,
        sessionRecording: settings,
      })
      persistMockSettings(mockStore.settings)
      mockStore.sessionRecordingPassword = settings.enabled
        ? normalizedPassword || mockStore.sessionRecordingPassword
        : null

      return {
        appSettings: mockStore.settings,
        status: buildMockRecordingStatus(),
      } satisfies UpdateSessionRecordingSettingsResult
    }

    return invoke<UpdateSessionRecordingSettingsResult>('update_session_recording_settings', {
      settings,
      password,
    })
  },

  async pickSessionLogFiles() {
    if (!isTauriRuntime()) {
      return mockStore.sessionLogs.map((log) => log.path)
    }

    const { open } = await import('@tauri-apps/plugin-dialog')
    const selection = await open({
      multiple: true,
      filters: [
        {
          name: 'Iridium Session Logs',
          extensions: ['irlog'],
        },
      ],
    })

    if (!selection) {
      return []
    }

    return Array.isArray(selection) ? selection : [selection]
  },

  async previewSessionLogs(paths: string[], password: string) {
    if (!isTauriRuntime()) {
      return buildMockSessionLogPreview(paths, password)
    }

    return invoke<SessionLogPreview>('preview_session_logs', { paths, password })
  },

  async exportSessionLogs(paths: string[], password: string) {
    if (!isTauriRuntime()) {
      const preview = buildMockSessionLogPreview(paths, password)
      const blob = new Blob([preview.previewText], {
        type: 'text/plain;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'iridium-remote-session-log.txt'
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      return true
    }

    const { save } = await import('@tauri-apps/plugin-dialog')
    const outputPath = await save({
      defaultPath: 'iridium-remote-session-log.txt',
      filters: [
        {
          name: 'Text',
          extensions: ['txt'],
        },
      ],
    })

    if (!outputPath) {
      return false
    }

    await invoke('export_session_logs', { paths, password, outputPath })
    return true
  },

  async openSessionLogsDirectory() {
    if (!isTauriRuntime()) {
      return
    }

    await invoke('open_session_logs_directory')
  },

  async pickTransferLocalPath(
    direction: FileTransferInput['direction'],
    selectionMode: TransferLocalPathSelectionMode,
    currentLocalPath: string,
    currentRemotePath: string,
  ) {
    if (!isTauriRuntime()) {
      if (selectionMode === 'directory') {
        return currentLocalPath || 'C:\\mock\\folder'
      }

      if (direction === 'upload') {
        return currentLocalPath || 'C:\\mock\\upload.txt'
      }

      return currentLocalPath || `C:\\mock\\${getRemoteFileName(currentRemotePath) || 'download.txt'}`
    }

    const { open, save } = await import('@tauri-apps/plugin-dialog')
    if (selectionMode === 'directory') {
      const path = await open({
        directory: true,
        multiple: false,
        defaultPath: currentLocalPath.trim() || undefined,
      })

      return typeof path === 'string' ? path : null
    }

    if (direction === 'upload') {
      const path = await open({
        directory: false,
        multiple: false,
        defaultPath: currentLocalPath.trim() || undefined,
      })

      return typeof path === 'string' ? path : null
    }

    const path = await save({
      defaultPath: currentLocalPath.trim() || getRemoteFileName(currentRemotePath) || 'download.txt',
    })

    return path
  },

  async listRemoteDirectory(connectionId: string, path?: string) {
    if (!isTauriRuntime()) {
      const currentPath = normalizeMockRemotePath(path)
      return {
        currentPath,
        entries: getMockRemoteEntries(currentPath),
      } satisfies RemotePathListing
    }

    return invoke<RemotePathListing>('list_remote_directory', {
      connectionId,
      path,
    })
  },

  async onSessionState(listener: (state: SessionState) => void): Promise<Unsubscribe> {
    if (!isTauriRuntime()) {
      mockStore.sessionListeners.add(listener)
      return () => {
        mockStore.sessionListeners.delete(listener)
      }
    }

    return listen<SessionState>('session-status', (event) => {
      listener(event.payload)
    })
  },

  async onSessionRemoved(listener: (payload: SessionRemovedEvent) => void): Promise<Unsubscribe> {
    if (!isTauriRuntime()) {
      mockStore.sessionRemovedListeners.add(listener)
      return () => {
        mockStore.sessionRemovedListeners.delete(listener)
      }
    }

    return listen<SessionRemovedEvent>('session-removed', (event) => {
      listener(event.payload)
    })
  },

  async onTerminalOutput(listener: (payload: TerminalOutputEvent) => void): Promise<Unsubscribe> {
    if (!isTauriRuntime()) {
      mockStore.terminalListeners.add(listener)
      return () => {
        mockStore.terminalListeners.delete(listener)
      }
    }

    return listen<TerminalOutputEvent>('terminal-output', (event) => {
      listener(event.payload)
    })
  },
}

const normalizeMockRemotePath = (path?: string) => {
  const trimmed = path?.trim()
  if (!trimmed || trimmed === '.') {
    return '/'
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const isVisibleRemoteEntry = (entry: RemotePathListing['entries'][number]) => !entry.name.startsWith('.')

const getMockRemoteEntries = (path: string): RemotePathListing['entries'] => {
  const normalized = normalizeMockRemotePath(path)

  switch (normalized) {
    case '/':
      return [
        { name: 'home', path: '/home', isDirectory: true },
        { name: 'var', path: '/var', isDirectory: true },
        { name: '.ssh', path: '/.ssh', isDirectory: true },
        { name: 'README.txt', path: '/README.txt', isDirectory: false },
      ].filter(isVisibleRemoteEntry)
    case '/home':
      return [
        { name: 'demo', path: '/home/demo', isDirectory: true },
        { name: '.bashrc', path: '/home/.bashrc', isDirectory: false },
        { name: 'notes.txt', path: '/home/notes.txt', isDirectory: false },
      ].filter(isVisibleRemoteEntry)
    case '/home/demo':
      return [
        { name: '.env', path: '/home/demo/.env', isDirectory: false },
        { name: 'deploy.sh', path: '/home/demo/deploy.sh', isDirectory: false },
        { name: 'logs', path: '/home/demo/logs', isDirectory: true },
      ].filter(isVisibleRemoteEntry)
    case '/var':
      return [
        { name: 'www', path: '/var/www', isDirectory: true },
        { name: '.cache', path: '/var/.cache', isDirectory: true },
        { name: 'app.log', path: '/var/app.log', isDirectory: false },
      ].filter(isVisibleRemoteEntry)
    default:
      return []
  }
}
