import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  AppError,
  ConnectionRecord,
  CreateConnectionInput,
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
  session: SessionState
  sessionListeners: Set<(state: SessionState) => void>
  terminalListeners: Set<(event: TerminalOutputEvent) => void>
}

const mockStore: MockStore = {
  connections: [],
  session: {
    connectionId: null,
    status: 'idle',
    message: 'Ready',
  },
  sessionListeners: new Set(),
  terminalListeners: new Set(),
}

const emitMockSession = (session: SessionState) => {
  mockStore.session = session
  for (const listener of mockStore.sessionListeners) {
    listener(session)
  }
}

const emitMockOutput = (data: string) => {
  const payload: TerminalOutputEvent = { stream: 'stdout', data }
  for (const listener of mockStore.terminalListeners) {
    listener(payload)
  }
}

const now = () => new Date().toISOString()

export const appClient = {
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
        id: crypto.randomUUID(),
        name: input.name.trim(),
        host: input.host.trim(),
        port: input.port ?? 22,
        username: input.username.trim(),
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
      if (mockStore.session.connectionId === id) {
        emitMockSession({
          connectionId: id,
          status: 'disconnected',
          message: 'Session closed.',
        })
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

      const state: SessionState = {
        connectionId,
        status: 'connected',
        message: `Connected to ${connection.host} (mock session).`,
      }

      emitMockSession(state)
      emitMockOutput(`Connected to ${connection.username}@${connection.host}\r\n`)
      emitMockOutput('This is a browser preview session. Run through Tauri for a real SSH shell.\r\n')
      return state
    }

    return invoke<SessionState>('connect_session', { connectionId })
  },



  async writeSessionInput(data: string) {
    if (!isTauriRuntime()) {
      emitMockOutput(data)
      return
    }

    await invoke('write_session_input', { data })
  },

  async resizeSession(cols: number, rows: number) {
    if (!isTauriRuntime()) {
      return
    }

    await invoke('resize_session', { cols, rows })
  },

  async disconnectSession() {
    if (!isTauriRuntime()) {
      const state: SessionState = {
        connectionId: mockStore.session.connectionId,
        status: 'disconnected',
        message: 'Session closed.',
      }

      emitMockSession(state)
      return state
    }

    return invoke<SessionState>('disconnect_session')
  },

  async getSessionState() {
    if (!isTauriRuntime()) {
      return mockStore.session
    }

    return invoke<SessionState>('get_session_state')
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
