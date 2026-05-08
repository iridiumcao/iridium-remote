import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { defaultAppSettings } from './lib/types'
import type { ConnectionRecord, SessionState } from './lib/types'

const appClientMocks = vi.hoisted(() => ({
  listConnectionsMock: vi.fn<() => Promise<ConnectionRecord[]>>(),
  getSessionStatesMock: vi.fn<() => Promise<SessionState[]>>(),
  getAppSettingsMock: vi.fn<() => Promise<typeof defaultAppSettings>>(),
  onSessionStateMock: vi.fn(),
  onSessionRemovedMock: vi.fn(),
}))

vi.mock('./api/client', () => ({
  appClient: {
    isTauriRuntime: vi.fn(() => false),
    listConnections: appClientMocks.listConnectionsMock,
    getSessionStates: appClientMocks.getSessionStatesMock,
    getAppSettings: appClientMocks.getAppSettingsMock,
    onSessionState: appClientMocks.onSessionStateMock,
    onSessionRemoved: appClientMocks.onSessionRemovedMock,
    normalizeError: vi.fn((cause: unknown) => ({
      code: 'INTERNAL_ERROR',
      message: cause instanceof Error ? cause.message : 'Unexpected error',
    })),
    openExternalUrl: vi.fn(),
    closeCurrentWindow: vi.fn(),
    updateAppSettings: vi.fn(),
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    deleteConnection: vi.fn(),
    connectSession: vi.fn(),
    disconnectSession: vi.fn(),
    closeSession: vi.fn(),
    exportConnections: vi.fn(),
    saveExportConnections: vi.fn(),
    importConnections: vi.fn(),
    checkForUpdates: vi.fn(),
    transferFile: vi.fn(),
  },
}))

vi.mock('./components/ConnectionList', () => ({
  ConnectionList: ({
    connections,
    onSelect,
    selectedConnectionId,
  }: {
    connections: ConnectionRecord[]
    onSelect: (connectionId: string) => void
    selectedConnectionId: string | null
  }) => (
    <div>
      <div data-testid="selected-connection">{selectedConnectionId ?? 'none'}</div>
      {connections.map((connection) => (
        <button
          key={connection.id}
          type="button"
          onClick={() => onSelect(connection.id)}
        >
          Select {connection.name}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('./components/TerminalWorkspace', () => ({
  TerminalWorkspace: ({
    activeSession,
    onSelectSession,
    sessions,
  }: {
    activeSession: SessionState | null
    onSelectSession: (sessionId: string) => void
    sessions: SessionState[]
  }) => (
    <div>
      <div>Terminal Workspace</div>
      <div data-testid="active-session">{activeSession?.sessionId ?? 'none'}</div>
      {sessions.map((session) => (
        <button
          key={session.sessionId}
          type="button"
          onClick={() => onSelectSession(session.sessionId)}
        >
          Session {session.connectionName}
        </button>
      ))}
    </div>
  ),
}))

const connections: ConnectionRecord[] = [
  {
    id: 'connection-1',
    name: 'Alpha',
    groupName: null,
    host: '192.168.1.10',
    port: 22,
    username: 'root',
    hasPassword: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'connection-2',
    name: 'Beta',
    groupName: null,
    host: '10.0.0.2',
    port: 22,
    username: 'deploy',
    hasPassword: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

const sessionAlpha: SessionState = {
  sessionId: 'session-alpha',
  connectionId: 'connection-1',
  connectionName: 'Alpha',
  status: 'connected',
  message: 'Connected.',
}

const sessionBeta: SessionState = {
  sessionId: 'session-beta',
  connectionId: 'connection-2',
  connectionName: 'Beta',
  status: 'connected',
  message: 'Connected.',
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appClientMocks.listConnectionsMock.mockResolvedValue(connections)
    appClientMocks.getSessionStatesMock.mockResolvedValue([])
    appClientMocks.getAppSettingsMock.mockResolvedValue(defaultAppSettings)
    appClientMocks.onSessionStateMock.mockResolvedValue(() => {})
    appClientMocks.onSessionRemovedMock.mockResolvedValue(() => {})
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the shell and empty connection state', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Iridium Remote' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
    })
  })

  it('switches to an existing session tab when its connection is single-clicked', async () => {
    appClientMocks.getSessionStatesMock.mockResolvedValue([sessionBeta, sessionAlpha])
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('active-session')).toHaveTextContent('session-beta')
    })

    await user.click(screen.getByRole('button', { name: 'Select Alpha' }))

    expect(screen.getByTestId('active-session')).toHaveTextContent('session-alpha')
    expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
  })

  it('keeps the current tab active when the clicked connection has no open session', async () => {
    appClientMocks.getSessionStatesMock.mockResolvedValue([sessionBeta])
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('active-session')).toHaveTextContent('session-beta')
    })

    await user.click(screen.getByRole('button', { name: 'Select Alpha' }))

    expect(screen.getByTestId('active-session')).toHaveTextContent('session-beta')
    expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
  })

  it('highlights the matching connection when a session tab is selected', async () => {
    appClientMocks.getSessionStatesMock.mockResolvedValue([sessionBeta, sessionAlpha])
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-2')
    })

    await user.click(screen.getByRole('button', { name: 'Session Alpha' }))

    expect(screen.getByTestId('active-session')).toHaveTextContent('session-alpha')
    expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
  })

  it('prevents the browser context menu outside the terminal panel', async () => {
    render(<App />)

    const heading = screen.getByRole('heading', { name: 'Iridium Remote' })
    const event = createEvent.contextMenu(heading)
    fireEvent(heading, event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('prevents the browser context menu inside the terminal panel', async () => {
    render(<App />)

    const terminal = screen.getByText('Terminal Workspace')
    const event = createEvent.contextMenu(terminal)
    fireEvent(terminal, event)

    expect(event.defaultPrevented).toBe(true)
  })
})
