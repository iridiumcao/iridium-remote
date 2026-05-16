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
  getConnectionHistoryOverviewMock: vi.fn(),
  getConnectionHistoryHostDetailsMock: vi.fn(),
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
    onSelect,
    selectedConnectionId,
    topContent,
  }: {
    connections: ConnectionRecord[]
    onSelect: (connectionId: string) => void
    selectedConnectionId: string | null
    topContent?: ReactNode
  }) => (
    <aside data-testid="connection-list">
      {topContent}
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

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    appClientMocks.listConnectionsMock.mockResolvedValue(connections)
    appClientMocks.getSessionStatesMock.mockResolvedValue([])
    appClientMocks.getAppSettingsMock.mockResolvedValue(defaultAppSettings)
    appClientMocks.getSessionRecordingStatusMock.mockResolvedValue({
      configuredEnabled: false,
      passwordLoaded: false,
      canRecord: false,
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
      currentVersion: '0.1.3',
      latestVersion: '0.1.3',
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

    expect(screen.getByText('You are up to date. Current version: v0.1.3.')).toBeInTheDocument()
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

  it('places Connection History in the File menu after Export and opens the dialog', async () => {
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
      'connection-history',
      'session-logs',
      'exit',
    ])

    const openConnectionHistory = findMenuAction(tauriMenuMocks.lastMenuItems, 'connection-history')
    expect(openConnectionHistory).not.toBeNull()

    await act(async () => {
      openConnectionHistory?.()
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { name: 'Connection History & Statistics' })).toBeInTheDocument()
    expect(appClient.getConnectionHistoryOverview).toHaveBeenCalledWith('last_30_days')
  })

  it('keeps all-time history hosts visible when the selected range has no sessions', async () => {
    vi.mocked(appClient.isTauriRuntime).mockReturnValue(true)
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

    appClientMocks.getConnectionHistoryOverviewMock.mockImplementation(
      async (range: ConnectionHistoryDateRange) => ({
        hosts: range === 'all_time' ? [allTimeHost] : [],
        dailyUsage:
          range === 'all_time'
            ? [
                {
                  date: '2026-01-01',
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
              ]
            : [],
      }),
    )
    appClientMocks.getConnectionHistoryHostDetailsMock.mockImplementation(
      async (_historyKey: string, range: ConnectionHistoryDateRange) => ({
        host:
          range === 'all_time'
            ? allTimeHost
            : {
                ...allTimeHost,
                latestConnectionAt: null,
                totalConnectionCount: 0,
                totalDurationSeconds: 0,
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

    render(<App />)

    await waitFor(() => {
      expect(tauriMenuMocks.menuSetAsAppMenuMock).toHaveBeenCalled()
    })

    const openConnectionHistory = findMenuAction(tauriMenuMocks.lastMenuItems, 'connection-history')
    await act(async () => {
      openConnectionHistory?.()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(appClient.getConnectionHistoryOverview).toHaveBeenCalledWith('all_time')
      expect(appClient.getConnectionHistoryHostDetails).toHaveBeenCalledWith('history-1', 'last_30_days')
    })

    expect(screen.getByRole('heading', { name: 'Connection History & Statistics' })).toBeInTheDocument()
    expect(screen.getAllByText('root@192.168.1.10').length).toBeGreaterThan(0)
    expect(screen.getByText('Total connections')).toBeInTheDocument()
    expect(appClient.getConnectionHistoryHostDetails).not.toHaveBeenCalledWith('history-1', 'all_time')
    expect(screen.getByText('No detailed sessions match the current filter.')).toBeInTheDocument()
    expect(screen.queryByText('No connection history yet.')).not.toBeInTheDocument()
  })
})
