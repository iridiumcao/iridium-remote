import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
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
  SessionRemovedEvent,
  SessionState,
  TerminalOutputEvent,
  UpdateConnectionInput,
} from '../lib/types'

type Unsubscribe = () => void | Promise<void>

const isTauriRuntime = () =>
  typeof window !== 'undefined' &&
  typeof (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    'undefined'

type MockStore = {
  settings: AppSettings
  connections: ConnectionRecord[]
  sessions: SessionState[]
  sessionListeners: Set<(state: SessionState) => void>
  sessionRemovedListeners: Set<(event: SessionRemovedEvent) => void>
  terminalListeners: Set<(event: TerminalOutputEvent) => void>
}

const MOCK_SETTINGS_STORAGE_KEY = 'iridium-remote.mock-settings'

const loadMockSettings = (): AppSettings => {
  if (typeof window === 'undefined') {
    return defaultAppSettings
  }

  try {
    const raw = window.localStorage.getItem(MOCK_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return defaultAppSettings
    }

    return {
      ...defaultAppSettings,
      ...(JSON.parse(raw) as Partial<AppSettings>),
    }
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

const mockStore: MockStore = {
  settings: loadMockSettings(),
  connections: [],
  sessions: [],
  sessionListeners: new Set(),
  sessionRemovedListeners: new Set(),
  terminalListeners: new Set(),
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
  const payload: SessionRemovedEvent = { sessionId }
  for (const listener of mockStore.sessionRemovedListeners) {
    listener(payload)
  }
}

const emitMockOutput = (sessionId: string, data: string) => {
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

const getExportFileName = (payload: ConnectionsExportPayload) => {
  const timestamp = payload.exportedAt.replace(/[:.]/g, '-')
  return `iridium-remote-backup-${timestamp}.json`
}

const normalizeGroup = (value?: string | null) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const randomId = () => crypto.randomUUID()
type TransferLocalPathSelectionMode = 'file' | 'directory'

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
      return mockStore.settings
    }

    return invoke<AppSettings>('get_app_settings')
  },

  async updateAppSettings(settings: AppSettings) {
    if (!isTauriRuntime()) {
      mockStore.settings = settings
      persistMockSettings(settings)
      return settings
    }

    return invoke<AppSettings>('update_app_settings', { settings })
  },

  async createConnection(input: CreateConnectionInput) {
    if (!isTauriRuntime()) {
      const timestamp = now()
      const created: ConnectionRecord = {
        id: randomId(),
        name: input.name.trim(),
        groupName: normalizeGroup(input.groupName),
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
              groupName: normalizeGroup(input.groupName),
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
        }
        persistMockSettings(mockStore.settings)
        settingsApplied = true
      }

      const existing = new Set(
        mockStore.connections.map(
          (connection) =>
            `${connection.groupName ?? ''}|${connection.name.toLowerCase()}|${connection.host.toLowerCase()}|${connection.port}|${connection.username.toLowerCase()}`,
        ),
      )

      let imported = 0
      let skipped = 0

      for (const entry of payload.connections) {
        const signature = `${entry.groupName ?? ''}|${entry.name.toLowerCase()}|${entry.host.toLowerCase()}|${entry.port}|${entry.username.toLowerCase()}`
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
            groupName: normalizeGroup(entry.groupName),
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

const getMockRemoteEntries = (path: string): RemotePathListing['entries'] => {
  const normalized = normalizeMockRemotePath(path)

  switch (normalized) {
    case '/':
      return [
        { name: 'home', path: '/home', isDirectory: true },
        { name: 'var', path: '/var', isDirectory: true },
        { name: 'README.txt', path: '/README.txt', isDirectory: false },
      ]
    case '/home':
      return [
        { name: 'demo', path: '/home/demo', isDirectory: true },
        { name: 'notes.txt', path: '/home/notes.txt', isDirectory: false },
      ]
    case '/home/demo':
      return [
        { name: 'deploy.sh', path: '/home/demo/deploy.sh', isDirectory: false },
        { name: 'logs', path: '/home/demo/logs', isDirectory: true },
      ]
    case '/var':
      return [
        { name: 'www', path: '/var/www', isDirectory: true },
        { name: 'app.log', path: '/var/app.log', isDirectory: false },
      ]
    default:
      return []
  }
}
