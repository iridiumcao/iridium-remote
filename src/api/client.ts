import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  AppError,
  ConnectionRecord,
  CreateConnectionInput,
  FileTransferInput,
  FileTransferResult,
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
  connections: ConnectionRecord[]
  sessions: SessionState[]
  sessionListeners: Set<(state: SessionState) => void>
  sessionRemovedListeners: Set<(event: SessionRemovedEvent) => void>
  terminalListeners: Set<(event: TerminalOutputEvent) => void>
}

const mockStore: MockStore = {
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

const normalizeGroup = (value?: string | null) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const randomId = () => crypto.randomUUID()

export const appClient = {
  isTauriRuntime,

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
