import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { appClient } from './api/client'
import { defaultAppSettings } from './lib/types'
import type {
  ConnectionHistoryDateRange,
  ConnectionHistoryHostSummary,
  ConnectionRecord,
  SessionState,
} from './lib/types'

const appClientMocks = vi.hoisted(() => ({
  listConnectionsMock: vi.fn<() => Promise<ConnectionRecord[]>>(),
  getSessionStatesMock: vi.fn<() => Promise<SessionState[]>>(),
  getAppSettingsMock: vi.fn<() => Promise<typeof defaultAppSettings>>(),
  getSessionRecordingStatusMock: vi.fn(),
  verifySessionRecordingPasswordMock: vi.fn(),
  pauseSessionRecordingForRunMock: vi.fn(),
  getConnectionHistoryOverviewMock: vi.fn(),
  getConnectionHistoryHostDetailsMock: vi.fn(),
  listSessionLogsMock: vi.fn(),
  onSessionStateMock: vi.fn(),
  onSessionRemovedMock: vi.fn(),
}))

const tauriMenuMocks = vi.hoisted(() => ({
  lastMenuItems: [] as MenuItemMock[],
  menuSetAsAppMenuMock: vi.fn(),
}))

type MenuItemMock = {
  id?: string
  text?: string
  items?: MenuItemMock[]
  action?: () => void
}

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: vi.fn(async ({ items }: { items: MenuItemMock[] }) => {
      tauriMenuMocks.lastMenuItems = items
      return {
        setAsAppMenu: tauriMenuMocks.menuSetAsAppMenuMock,
      }
    }),
  },
}))

vi.mock('./api/client', () => ({
  appClient: {
    isTauriRuntime: vi.fn(() => false),
    listConnections: appClientMocks.listConnectionsMock,
    getSessionStates: appClientMocks.getSessionStatesMock,
    getAppSettings: appClientMocks.getAppSettingsMock,
    getSessionRecordingStatus: appClientMocks.getSessionRecordingStatusMock,
    verifySessionRecordingPassword: appClientMocks.verifySessionRecordingPasswordMock,
    pauseSessionRecordingForRun: appClientMocks.pauseSessionRecordingForRunMock,
    getConnectionHistoryOverview: appClientMocks.getConnectionHistoryOverviewMock,
    getConnectionHistoryHostDetails: appClientMocks.getConnectionHistoryHostDetailsMock,
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
    updateSessionRecordingSettings: vi.fn(),
    listSessionLogs: appClientMocks.listSessionLogsMock,
    pickSessionLogFiles: vi.fn(),
    previewSessionLogs: vi.fn(),
    exportSessionLogs: vi.fn(),
    openSessionLogsDirectory: vi.fn(),
    pickSessionLogDirectory: vi.fn(),
    transferFile: vi.fn(),
  },
}))

vi.mock('./components/ConnectionList', () => ({
  ConnectionList: ({
    connections,
    onConnect,
    onSelect,
    selectedConnectionId,
    topContent,
  }: {
    connections: ConnectionRecord[]
    onConnect?: (connection: ConnectionRecord) => void
    onSelect: (connectionId: string) => void
    selectedConnectionId: string | null
    topContent?: ReactNode
  }) => (
    <aside data-testid="connection-list">
      {topContent}
      <div data-testid="selected-connection">{selectedConnectionId ?? 'none'}</div>
      {connections.map((connection) => (
        <div key={connection.id}>
          <button
            type="button"
            onClick={() => onSelect(connection.id)}
          >
            Select {connection.name}
          </button>
          {onConnect ? (
            <button
              type="button"
              onClick={() => onConnect(connection)}
            >
              Connect {connection.name}
            </button>
          ) : null}
        </div>
      ))}
    </aside>
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
      <div data-testid="active-session-recording">
        {activeSession?.recordingActive ? 'recording' : 'not-recording'}
      </div>
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

const findMenuAction = (items: MenuItemMock[], id: string): (() => void) | null => {
  for (const item of items) {
    if (item.id === id && item.action) {
      return item.action
    }

    if (item.items) {
      const nestedAction = findMenuAction(item.items, id)
      if (nestedAction) {
        return nestedAction
      }
    }
  }

  return null
}

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

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    void innerReject
  })
  return { promise, resolve }
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    appClientMocks.listConnectionsMock.mockResolvedValue(connections)
    appClientMocks.getSessionStatesMock.mockResolvedValue([])
    appClientMocks.getAppSettingsMock.mockResolvedValue(defaultAppSettings)
    appClientMocks.getSessionRecordingStatusMock.mockResolvedValue({
      configuredEnabled: false,
      passwordConfigured: false,
      passwordLoaded: false,
      canRecord: false,
      pausedForRun: false,
      needsPasswordVerification: false,
      logDirectory: 'C:\\mock\\SessionLogs',
      currentStorageBytes: 0,
    })
    appClientMocks.verifySessionRecordingPasswordMock.mockResolvedValue({
      configuredEnabled: true,
      passwordConfigured: true,
      passwordLoaded: true,
      canRecord: true,
      pausedForRun: false,
      needsPasswordVerification: false,
      logDirectory: 'C:\\mock\\SessionLogs',
      currentStorageBytes: 0,
    })
    appClientMocks.pauseSessionRecordingForRunMock.mockResolvedValue({
      configuredEnabled: true,
      passwordConfigured: true,
      passwordLoaded: false,
      canRecord: false,
      pausedForRun: true,
      needsPasswordVerification: false,
      logDirectory: 'C:\\mock\\SessionLogs',
      currentStorageBytes: 0,
    })
    appClientMocks.getConnectionHistoryOverviewMock.mockResolvedValue({
      hosts: [],
      dailyUsage: [],
    })
    appClientMocks.getConnectionHistoryHostDetailsMock.mockResolvedValue({
      host: {
        historyKey: 'history-1',
        connectionId: 'connection-1',
        connectionName: 'Alpha',
        host: '192.168.1.10',
        port: 22,
        username: 'root',
        deleted: false,
        latestConnectionAt: '2026-01-01T00:00:00Z',
        totalConnectionCount: 1,
        totalDurationSeconds: 60,
      },
      sessions: [],
      durationBuckets: [],
      summarizedSessionCount: 0,
      summarizedDurationSeconds: 0,
    })
    appClientMocks.onSessionStateMock.mockResolvedValue(() => {})
    appClientMocks.onSessionRemovedMock.mockResolvedValue(() => {})
    appClientMocks.listSessionLogsMock.mockResolvedValue([])
    vi.mocked(appClient.updateAppSettings).mockImplementation(async (settings) => settings)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    window.localStorage.clear()
  })

  it('renders the shell and empty connection state', async () => {
    render(<App />)

    expect(within(screen.getByTestId('connection-list')).getByRole('heading', { name: 'Iridium Remote' })).toBeInTheDocument()
    expect(within(screen.getByTestId('connection-list')).getByText('Another Remote Tool')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
    })

    expect(screen.queryByRole('button', { name: 'New Connection' })).not.toBeInTheDocument()
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

  it('verifies the session recording password before the first connection when recording is awaiting verification', async () => {
    appClientMocks.getAppSettingsMock.mockResolvedValue({
      ...defaultAppSettings,
      sessionRecording: {
        ...defaultAppSettings.sessionRecording,
        enabled: true,
        mode: 'full',
      },
    })
    appClientMocks.getSessionRecordingStatusMock.mockResolvedValue({
      configuredEnabled: true,
      passwordConfigured: true,
      passwordLoaded: false,
      canRecord: false,
      pausedForRun: false,
      needsPasswordVerification: true,
      logDirectory: 'C:\\mock\\SessionLogs',
      currentStorageBytes: 0,
    })
    vi.mocked(appClient.connectSession).mockResolvedValue(sessionAlpha)
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
    })

    await user.click(screen.getByRole('button', { name: 'Connect Alpha' }))

    expect(screen.getByRole('heading', { name: 'Verify Session Recording Password' })).toBeInTheDocument()
    expect(appClient.connectSession).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Encryption password'), 'super-secret')
    await user.click(screen.getByRole('button', { name: 'Verify and Continue' }))

    await waitFor(() => {
      expect(appClient.verifySessionRecordingPassword).toHaveBeenCalledWith('super-secret')
    })
    await waitFor(() => {
      expect(appClient.connectSession).toHaveBeenCalledWith('connection-1')
    })
    expect(screen.getByText('Password verified. Detailed session recording is active for this app run.')).toBeInTheDocument()
  })

  it('can pause session recording for the current run and continue connecting', async () => {
    appClientMocks.getAppSettingsMock.mockResolvedValue({
      ...defaultAppSettings,
      sessionRecording: {
        ...defaultAppSettings.sessionRecording,
        enabled: true,
      },
    })
    appClientMocks.getSessionRecordingStatusMock.mockResolvedValue({
      configuredEnabled: true,
      passwordConfigured: true,
      passwordLoaded: false,
      canRecord: false,
      pausedForRun: false,
      needsPasswordVerification: true,
      logDirectory: 'C:\\mock\\SessionLogs',
      currentStorageBytes: 0,
    })
    vi.mocked(appClient.connectSession).mockResolvedValue(sessionAlpha)
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
    })

    await user.click(screen.getByRole('button', { name: 'Connect Alpha' }))
    await user.click(screen.getByRole('button', { name: 'Pause Recording' }))

    await waitFor(() => {
      expect(appClient.pauseSessionRecordingForRun).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(appClient.connectSession).toHaveBeenCalledWith('connection-1')
    })
    expect(screen.getByText('Session recording is paused for this app run.')).toBeInTheDocument()
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

  it('reveals a collapsed group when switching to a session from that connection', async () => {
    const groupedConnections: ConnectionRecord[] = [
      {
        ...connections[0]!,
        groupName: 'Alpha Group',
      },
      {
        ...connections[1]!,
        groupName: 'Beta Group',
      },
    ]
    appClientMocks.listConnectionsMock.mockResolvedValue(groupedConnections)
    appClientMocks.getSessionStatesMock.mockResolvedValue([sessionBeta, sessionAlpha])
    appClientMocks.getAppSettingsMock.mockResolvedValue({
      ...defaultAppSettings,
      collapsedGroups: ['Alpha Group'],
    })
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-2')
    })

    await user.click(screen.getByRole('button', { name: 'Session Alpha' }))

    await waitFor(() => {
      expect(appClient.updateAppSettings).toHaveBeenCalledWith({
        ...defaultAppSettings,
        collapsedGroups: [],
      })
    })
  })

  it('updates the active session recording state when a session-status event stops recording', async () => {
    let sessionStateListener: ((state: SessionState) => void) | undefined
    appClientMocks.getSessionStatesMock.mockResolvedValue([
      { ...sessionAlpha, recordingActive: true, recordingMode: 'full' },
    ])
    appClientMocks.onSessionStateMock.mockImplementation(async (listener) => {
      sessionStateListener = listener
      return () => {}
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('active-session-recording')).toHaveTextContent('recording')
    })

    act(() => {
      sessionStateListener?.({
        ...sessionAlpha,
        recordingActive: false,
        recordingMode: null,
      })
    })

    expect(screen.getByTestId('active-session-recording')).toHaveTextContent('not-recording')
  })

  it('does not let background session-status events steal the active tab', async () => {
    let sessionStateListener: ((state: SessionState) => void) | undefined
    appClientMocks.getSessionStatesMock.mockResolvedValue([sessionAlpha, sessionBeta])
    appClientMocks.onSessionStateMock.mockImplementation(async (listener) => {
      sessionStateListener = listener
      return () => {}
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('active-session')).toHaveTextContent('session-alpha')
    })

    act(() => {
      sessionStateListener?.({
        ...sessionBeta,
        message: 'Connected.',
      })
    })

    expect(screen.getByTestId('active-session')).toHaveTextContent('session-alpha')
    expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
  })

  it('does not let a late connect response steal the tab after the user switches away', async () => {
    const pendingConnect = createDeferred<SessionState>()
    appClientMocks.getSessionStatesMock.mockResolvedValue([sessionBeta])
    vi.mocked(appClient.connectSession).mockReturnValue(pendingConnect.promise)
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('active-session')).toHaveTextContent('session-beta')
    })

    await user.click(screen.getByRole('button', { name: 'Connect Alpha' }))

    await waitFor(() => {
      expect(appClient.connectSession).toHaveBeenCalledWith('connection-1')
    })

    await user.click(screen.getByRole('button', { name: 'Session Beta' }))

    await act(async () => {
      pendingConnect.resolve({
        ...sessionAlpha,
        status: 'connecting',
        message: 'Connecting...',
      })
      await pendingConnect.promise
    })

    expect(screen.getByTestId('active-session')).toHaveTextContent('session-beta')
    expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-2')
  })

  it('adopts a session-status update when no session tab is active yet', async () => {
    let sessionStateListener: ((state: SessionState) => void) | undefined
    appClientMocks.getSessionStatesMock.mockResolvedValue([])
    appClientMocks.onSessionStateMock.mockImplementation(async (listener) => {
      sessionStateListener = listener
      return () => {}
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('active-session')).toHaveTextContent('none')
    })

    act(() => {
      sessionStateListener?.({
        ...sessionBeta,
        status: 'connecting',
        message: 'Connecting...',
      })
    })

    expect(screen.getByTestId('active-session')).toHaveTextContent('session-beta')
    expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-2')
  })

  it('shows the Logs workspace tab only when session recording is enabled', async () => {
    const { unmount } = render(<App />)

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2)
    })

    appClientMocks.getAppSettingsMock.mockResolvedValue({
      ...defaultAppSettings,
      sessionRecording: {
        ...defaultAppSettings.sessionRecording,
        enabled: true,
      },
    })

    unmount()
    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(3)
    })
  })

  it('persists collapsed history sidebar sections in app settings', async () => {
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2)
    })

    await user.click(screen.getByRole('tab', { name: 'History' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Overall statistics/ })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Overall statistics/ }))

    await waitFor(() => {
      expect(appClient.updateAppSettings).toHaveBeenCalledWith({
        ...defaultAppSettings,
        connectionHistoryCollapsedSections: ['overview'],
      })
    })
  })

  it('localizes workspace tab labels for each supported locale', async () => {
    appClientMocks.getAppSettingsMock.mockResolvedValue({
      ...defaultAppSettings,
      sessionRecording: {
        ...defaultAppSettings.sessionRecording,
        enabled: true,
      },
    })
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Connections' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Logs' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('combobox', { name: 'Language' }))
    await user.click(screen.getByRole('option', { name: '简体中文' }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '连接' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: '历史' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: '日志' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('combobox', { name: '语言' }))
    await user.click(screen.getByRole('option', { name: '繁體中文' }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '連線' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: '歷史' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: '日誌' })).toBeInTheDocument()
    })
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

  it('keeps native locale names in the language selector after switching languages', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
    })

    await user.click(screen.getByRole('combobox', { name: 'Language' }))

    expect(screen.getByRole('listbox')).toHaveClass('bg-slate-900')
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '简体中文' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '繁體中文' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: '简体中文' }))

    await waitFor(() => {
      expect(screen.getByText('语言')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('combobox', { name: '语言' }))

    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '简体中文' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '繁體中文' })).toBeInTheDocument()
  })

  it('keeps browser-mode sidebar dropdown menus aligned with the active theme', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-connection')).toHaveTextContent('connection-1')
    })

    await user.click(screen.getByRole('combobox', { name: 'Theme' }))
    expect(screen.getByRole('listbox')).toHaveClass('bg-slate-900')

    await user.click(screen.getByRole('option', { name: 'Light' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Iridium Remote' }).closest('main')).toHaveClass('bg-slate-100')
    })

    await user.click(screen.getByRole('combobox', { name: 'Theme' }))
    expect(screen.getByRole('listbox')).toHaveClass('bg-white')
  })

  it('auto-dismisses the update notice after a short delay and plays the exit transition', async () => {
    vi.mocked(appClient.isTauriRuntime).mockReturnValue(true)
    vi.mocked(appClient.checkForUpdates).mockResolvedValue({
      currentVersion: '0.1.4',
      latestVersion: '0.1.4',
      updateAvailable: false,
    })

    render(<App />)

    await waitFor(() => {
      expect(tauriMenuMocks.menuSetAsAppMenuMock).toHaveBeenCalled()
    })

    const checkForUpdateAction = findMenuAction(tauriMenuMocks.lastMenuItems, 'check-for-update')
    expect(checkForUpdateAction).not.toBeNull()

    vi.useFakeTimers()

    await act(async () => {
      checkForUpdateAction?.()
      await Promise.resolve()
    })

    expect(screen.getByText('You are up to date. Current version: v0.1.4.')).toBeInTheDocument()
    const notice = screen.getByTestId('app-notice')
    expect(notice).toHaveClass('opacity-100')

    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(screen.getByTestId('app-notice')).toHaveClass('opacity-0')

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.queryByTestId('app-notice')).not.toBeInTheDocument()
  })

  it('moves language and theme into a top-level settings menu for desktop runtime', async () => {
    vi.mocked(appClient.isTauriRuntime).mockReturnValue(true)

    render(<App />)

    await waitFor(() => {
      expect(tauriMenuMocks.menuSetAsAppMenuMock).toHaveBeenCalled()
    })

    expect(tauriMenuMocks.lastMenuItems.some((item) => item.text === 'Settings')).toBe(true)
    expect(screen.queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Theme' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New Connection' })).not.toBeInTheDocument()
    const settingsMenu = tauriMenuMocks.lastMenuItems.find((item) => item.text === 'Settings')
    expect(settingsMenu?.items?.at(-1)?.id).toBe('session-recording')

    const selectLanguageAction = findMenuAction(tauriMenuMocks.lastMenuItems, 'settings-locale-zh-CN')
    expect(selectLanguageAction).not.toBeNull()

    await act(async () => {
      selectLanguageAction?.()
      await Promise.resolve()
    })

    expect(appClient.updateAppSettings).toHaveBeenCalledWith({
      ...defaultAppSettings,
      locale: 'zh-CN',
    })

    const selectThemeAction = findMenuAction(tauriMenuMocks.lastMenuItems, 'settings-theme-light')
    expect(selectThemeAction).not.toBeNull()

    await act(async () => {
      selectThemeAction?.()
      await Promise.resolve()
    })

    expect(appClient.updateAppSettings).toHaveBeenLastCalledWith({
      ...defaultAppSettings,
      locale: 'zh-CN',
      theme: 'light',
    })
  })

  it('uses the renamed Help update item', async () => {
    vi.mocked(appClient.isTauriRuntime).mockReturnValue(true)

    render(<App />)

    await waitFor(() => {
      expect(tauriMenuMocks.menuSetAsAppMenuMock).toHaveBeenCalled()
    })

    expect(
      tauriMenuMocks.lastMenuItems.some(
        (item) =>
          item.text === 'Help' &&
          item.items?.some((child) => child.id === 'check-for-update' && child.text === 'Check for Updates...'),
      )
    ).toBe(true)
  })

  it('keeps File menu focused on connection import/export actions', async () => {
    vi.mocked(appClient.isTauriRuntime).mockReturnValue(true)

    render(<App />)

    await waitFor(() => {
      expect(tauriMenuMocks.menuSetAsAppMenuMock).toHaveBeenCalled()
    })

    const fileMenu = tauriMenuMocks.lastMenuItems.find((item) => item.text === 'File')
    expect(fileMenu?.items?.map((item) => item.id)).toEqual([
      'new-connection',
      'import-connections',
      'export-connections',
      'exit',
    ])
  })

  it('keeps the selected history host visible when switching away and back', async () => {
    const allTimeHost: ConnectionHistoryHostSummary = {
      historyKey: 'history-1',
      connectionId: 'connection-1',
      connectionName: 'Alpha',
      host: '192.168.1.10',
      port: 22,
      username: 'root',
      deleted: false,
      latestConnectionAt: '2026-01-01T00:00:00Z',
      totalConnectionCount: 2,
      totalDurationSeconds: 120,
    }
    const secondHost: ConnectionHistoryHostSummary = {
      historyKey: 'history-2',
      connectionId: 'connection-2',
      connectionName: 'Beta',
      host: '10.0.0.2',
      port: 22,
      username: 'deploy',
      deleted: false,
      latestConnectionAt: '2026-01-02T00:00:00Z',
      totalConnectionCount: 3,
      totalDurationSeconds: 180,
    }

    appClientMocks.getConnectionHistoryOverviewMock.mockImplementation(
      async (range: ConnectionHistoryDateRange) => ({
        hosts: range === 'all_time' ? [allTimeHost, secondHost] : [allTimeHost, secondHost],
        dailyUsage:
          range === 'all_time'
            ? [
                {
                  date: '2026-01-02',
                  totalConnectionCount: 5,
                  totalDurationSeconds: 300,
                  hosts: [
                    {
                      historyKey: 'history-2',
                      connectionId: 'connection-2',
                      connectionName: 'Beta',
                      host: '10.0.0.2',
                      port: 22,
                      username: 'deploy',
                      deleted: false,
                      connectionCount: 3,
                      totalDurationSeconds: 180,
                    },
                    {
                      historyKey: 'history-1',
                      connectionId: 'connection-1',
                      connectionName: 'Alpha',
                      host: '192.168.1.10',
                      port: 22,
                      username: 'root',
                      deleted: false,
                      connectionCount: 2,
                      totalDurationSeconds: 120,
                    },
                  ],
                },
              ]
            : [],
      }),
    )
    appClientMocks.getConnectionHistoryHostDetailsMock.mockImplementation(
      async (historyKey: string, range: ConnectionHistoryDateRange) => ({
        host:
          range === 'all_time'
            ? historyKey === 'history-2'
              ? secondHost
              : allTimeHost
            : {
                ...(historyKey === 'history-2' ? secondHost : allTimeHost),
                latestConnectionAt: historyKey === 'history-2' ? secondHost.latestConnectionAt : null,
                totalConnectionCount: historyKey === 'history-2' ? secondHost.totalConnectionCount : 0,
                totalDurationSeconds: historyKey === 'history-2' ? secondHost.totalDurationSeconds : 0,
              },
        sessions: [],
        durationBuckets: [
          { bucket: 'under_5_minutes', sessionCount: 0 },
          { bucket: 'between_5_and_30_minutes', sessionCount: 0 },
          { bucket: 'between_30_minutes_and_2_hours', sessionCount: 0 },
          { bucket: 'over_2_hours', sessionCount: 0 },
        ],
        summarizedSessionCount: 0,
        summarizedDurationSeconds: 0,
      }),
    )
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2)
    })

    const [, historyTab] = screen.getAllByRole('tab')

    await user.click(historyTab)

    await waitFor(() => {
      expect(appClient.getConnectionHistoryOverview).toHaveBeenCalledWith('last_30_days')
    })

    await user.click(screen.getByRole('button', { name: /Beta/ }))

    await waitFor(() => {
      expect(screen.getAllByText('deploy@10.0.0.2').length).toBeGreaterThan(0)
    })

    await user.click(screen.getAllByRole('tab')[0]!)
    await user.click(screen.getAllByRole('tab')[1]!)

    expect(screen.getAllByText('deploy@10.0.0.2').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument()
  })

  it('separates overall and host history navigation', async () => {
    const allTimeHost: ConnectionHistoryHostSummary = {
      historyKey: 'history-1',
      connectionId: 'connection-1',
      connectionName: 'Alpha',
      host: '192.168.1.10',
      port: 22,
      username: 'root',
      deleted: false,
      latestConnectionAt: '2026-01-01T00:00:00Z',
      totalConnectionCount: 2,
      totalDurationSeconds: 120,
    }

    appClientMocks.getConnectionHistoryOverviewMock.mockResolvedValue({
      hosts: [allTimeHost],
      dailyUsage: [
        {
          date: '2026-01-02',
          totalConnectionCount: 2,
          totalDurationSeconds: 120,
          hosts: [
            {
              historyKey: 'history-1',
              connectionId: 'connection-1',
              connectionName: 'Alpha',
              host: '192.168.1.10',
              port: 22,
              username: 'root',
              deleted: false,
              connectionCount: 2,
              totalDurationSeconds: 120,
            },
          ],
        },
      ],
    })
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2)
    })

    await user.click(screen.getByRole('tab', { name: 'History' }))

    await waitFor(() => {
      expect(screen.getByText('Overall statistics')).toBeInTheDocument()
      expect(screen.getByText('Host statistics')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Daily usage/i }))

    expect(screen.getByText('Selected-day host duration share')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeInTheDocument()
  })

  it('clears decrypted log state but preserves the selected log when switching tabs', async () => {
    appClientMocks.getAppSettingsMock.mockResolvedValue({
      ...defaultAppSettings,
      sessionRecording: {
        ...defaultAppSettings.sessionRecording,
        enabled: true,
      },
    })
    appClientMocks.getSessionRecordingStatusMock.mockResolvedValue({
      configuredEnabled: true,
      passwordConfigured: false,
      passwordLoaded: false,
      canRecord: false,
      pausedForRun: false,
      needsPasswordVerification: false,
      logDirectory: 'C:\\mock\\SessionLogs',
      currentStorageBytes: 0,
    })
    appClientMocks.listSessionLogsMock.mockResolvedValue([
      {
        fileName: '2026-01-01_root_example.com.irlog',
        path: 'C:\\mock\\SessionLogs\\2026-01-01_root_example.com.irlog',
        createdAt: '2026-01-01T00:00:00Z',
        host: 'example.com',
        username: 'root',
        recordingMode: 'full',
        part: 1,
      },
    ])
    vi.mocked(appClient.previewSessionLogs).mockResolvedValue({
      files: [
        {
          fileName: '2026-01-01_root_example.com.irlog',
          path: 'C:\\mock\\SessionLogs\\2026-01-01_root_example.com.irlog',
          createdAt: '2026-01-01T00:00:00Z',
          host: 'example.com',
          username: 'root',
          recordingMode: 'full',
          part: 1,
        },
      ],
      previewText: 'example output',
      truncated: false,
    })
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(3)
    })

    await user.click(screen.getAllByRole('tab')[2]!)

    await waitFor(() => {
      expect(appClientMocks.listSessionLogsMock).toHaveBeenCalled()
    })

    await user.type(screen.getByLabelText('Encryption password'), 'super-secret')
    await user.click(screen.getByRole('button', { name: 'Decrypt Preview' }))

    const previewCard = screen.getByTestId('session-logs-preview-card')

    await waitFor(() => {
      expect(within(previewCard).getByRole('textbox')).toHaveValue('example output')
    })

    await user.click(screen.getAllByRole('tab')[0]!)
    await user.click(screen.getAllByRole('tab')[2]!)

    expect(within(screen.getByTestId('session-logs-preview-card')).getByRole('textbox')).toHaveValue('')
    expect(screen.getByLabelText('Encryption password')).toHaveValue('')
    expect(screen.getAllByText('2026-01-01_root_example.com.irlog').length).toBeGreaterThan(0)
  })
})
