import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { appClient } from '../api/client'
import { getTranslations } from '../lib/i18n'
import type { ConnectionRecord, SessionState, TerminalOutputEvent } from '../lib/types'
import { TerminalWorkspace } from './TerminalWorkspace'

const terminalMocks = vi.hoisted(() => {
  let dataHandler: ((data: string) => void) | undefined
  const terminal = {
    cols: 120,
    rows: 32,
    options: {} as { theme?: unknown },
    loadAddon: vi.fn(),
    open: vi.fn(),
    onData: vi.fn((handler: (data: string) => void) => {
      dataHandler = handler
      return { dispose: vi.fn() }
    }),
    reset: vi.fn(),
    write: vi.fn((data: string) => {
      if (data.includes('\u001b[6n')) {
        dataHandler?.('\u001b[1;1R')
      }
    }),
    focus: vi.fn(),
    dispose: vi.fn(),
    getSelection: vi.fn(() => 'selected text'),
    selectAll: vi.fn(),
    paste: vi.fn(),
    attachCustomKeyEventHandler: vi.fn(),
  }

  return { terminal }
})

vi.mock('../api/client', () => ({
  appClient: {
    onTerminalOutput: vi.fn().mockResolvedValue(() => {}),
    getSessionTerminalBuffer: vi.fn().mockResolvedValue(''),
    resizeSession: vi.fn().mockResolvedValue(undefined),
    writeSessionInput: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
  },
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options: { theme?: unknown }

    constructor(options: { theme?: unknown }) {
      terminalMocks.terminal.options = { ...options }
      this.options = terminalMocks.terminal.options
    }

    loadAddon = terminalMocks.terminal.loadAddon
    open = terminalMocks.terminal.open
    onData = terminalMocks.terminal.onData
    reset = terminalMocks.terminal.reset
    write = terminalMocks.terminal.write
    focus = terminalMocks.terminal.focus
    dispose = terminalMocks.terminal.dispose
    getSelection = terminalMocks.terminal.getSelection
    selectAll = terminalMocks.terminal.selectAll
    paste = terminalMocks.terminal.paste
    attachCustomKeyEventHandler = terminalMocks.terminal.attachCustomKeyEventHandler

    get cols() {
      return terminalMocks.terminal.cols
    }

    get rows() {
      return terminalMocks.terminal.rows
    }
  },
}))

const connection: ConnectionRecord = {
  id: 'connection-1',
  name: 'Test Only',
  groupName: null,
  host: '192.168.1.10',
  port: 22,
  username: 'tester',
  hasPassword: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const secondConnection: ConnectionRecord = {
  id: 'connection-2',
  name: 'Second Session',
  groupName: null,
  host: '192.168.1.11',
  port: 22,
  username: 'operator',
  hasPassword: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const session: SessionState = {
  sessionId: 'session-1',
  connectionId: connection.id,
  connectionName: connection.name,
  status: 'connected',
  message: 'Connected.',
}

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
    unobserve() {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  })

  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: vi.fn().mockResolvedValue('clipboard text'),
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  terminalMocks.terminal.cols = 120
  terminalMocks.terminal.rows = 32
  terminalMocks.terminal.getSelection.mockReturnValue('selected text')
  vi.mocked(appClient.getSessionTerminalBuffer).mockResolvedValue('')
})

afterEach(() => {
  cleanup()
})

describe('TerminalWorkspace', () => {
  it('uses the SSH target as the workspace title instead of repeating the tab label', () => {
    render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    expect(screen.getByRole('heading', { name: 'tester@192.168.1.10' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Test Only' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test Only' })).toBeInTheDocument()
    expect(screen.queryByText('Test Only', { selector: 'p' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Connected')).toHaveLength(1)
    expect(appClient.resizeSession).not.toHaveBeenCalled()
  })

  it('keeps the terminal visible while a session is connecting so SSH prompts can appear', () => {
    render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection]}
        activeSession={{ ...session, status: 'connecting', message: 'Connecting...' }}
        onCloseSession={vi.fn()}
        onDisconnect={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[{ ...session, status: 'connecting', message: 'Connecting...' }]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    expect(screen.queryByText('Starting the SSH session and waiting for the remote shell.')).not.toBeInTheDocument()
    expect(screen.getByText('Connecting', { selector: 'span' })).toBeInTheDocument()
    expect(appClient.resizeSession).not.toHaveBeenCalled()
  })

  it('waits for real terminal output before resizing the backend PTY', async () => {
    let terminalOutputListener: ((payload: TerminalOutputEvent) => void) | undefined
    vi.mocked(appClient.onTerminalOutput).mockImplementationOnce(async (listener) => {
      terminalOutputListener = listener
      return () => {}
    })

    render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection]}
        activeSession={{ ...session, status: 'connecting', message: 'Connecting...' }}
        onCloseSession={vi.fn()}
        onDisconnect={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[{ ...session, status: 'connecting', message: 'Connecting...' }]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    await waitFor(() => expect(terminalOutputListener).toBeDefined())

    expect(appClient.resizeSession).not.toHaveBeenCalled()

    terminalOutputListener?.({
      sessionId: 'session-1',
      stream: 'stdout',
      data: `${connection.username}@${connection.host}:~$ `,
    })

    await waitFor(() =>
      expect(appClient.resizeSession).toHaveBeenCalledWith('session-1', 120, 32),
    )
    expect(appClient.resizeSession).not.toHaveBeenCalledWith('session-1', 0, 0)
  })

  it('shows a recording indicator when the active session is being recorded', () => {
    render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection]}
        activeSession={{ ...session, recordingActive: true, recordingMode: 'input_only' }}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[{ ...session, recordingActive: true, recordingMode: 'input_only' }]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    expect(screen.getByText('● Input Recording')).toBeInTheDocument()
  })

  it('shows a localized, theme-aware custom terminal context menu', () => {
    const { container } = render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session]}
        t={getTranslations('zh-TW')}
        theme="dark"
      />,
    )

    const terminalShell = container.querySelector('.terminal-shell')
    expect(terminalShell).not.toBeNull()

    fireEvent.contextMenu(terminalShell!, {
      clientX: 120,
      clientY: 120,
    })

    const menu = screen.getByRole('menu')
    expect(menu).toHaveClass('bg-slate-900')
    expect(menu).toHaveClass('text-[14px]')
    expect(screen.getByRole('menuitem', { name: '複製' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '貼上' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '全選' })).toBeInTheDocument()
    expect(screen.queryByText('表情符号')).not.toBeInTheDocument()
    expect(screen.queryByText('书写方向')).not.toBeInTheDocument()
  })

  it('keeps the terminal tab-strip scrollbar classes in sync with the active theme', () => {
    const secondSession: SessionState = {
      ...session,
      sessionId: 'session-2',
      connectionId: 'connection-2',
      connectionName: 'Second Session',
    }

    const { container, rerender } = render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection, secondConnection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session, secondSession]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    const tabScrollRegion = container.querySelector('.terminal-tab-scroll-region')
    expect(tabScrollRegion).not.toBeNull()
    expect(tabScrollRegion).toHaveClass('themed-scrollbar', 'themed-scrollbar-dark')
    expect(tabScrollRegion).not.toHaveClass('themed-scrollbar-light')

    rerender(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection, secondConnection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session, secondSession]}
        t={getTranslations('en')}
        theme="light"
      />,
    )

    expect(tabScrollRegion).toHaveClass('themed-scrollbar', 'themed-scrollbar-light')
    expect(tabScrollRegion).not.toHaveClass('themed-scrollbar-dark')
  })

  it('shows the SSH target as a hover tooltip only for inactive tabs', () => {
    const secondSession: SessionState = {
      ...session,
      sessionId: 'session-2',
      connectionId: secondConnection.id,
      connectionName: secondConnection.name,
    }

    render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection, secondConnection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session, secondSession]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    expect(screen.getByRole('button', { name: 'Test Only' }).closest('[title]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Second Session' }).closest('[title]')).toHaveAttribute(
      'title',
      'operator@192.168.1.11',
    )
  })

  it('opens a tab context menu with only the requested close actions', () => {
    const secondSession: SessionState = {
      ...session,
      sessionId: 'session-2',
      connectionId: secondConnection.id,
      connectionName: secondConnection.name,
    }

    render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection, secondConnection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session, secondSession]}
        t={getTranslations('zh-CN')}
        theme="dark"
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Test Only' }).closest('div')!, {
      clientX: 120,
      clientY: 80,
    })

    expect(screen.getByRole('menuitem', { name: '关闭当前标签页' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: '关闭其他标签页' })).toBeEnabled()
    expect(screen.queryByRole('menuitem', { name: '关闭左侧标签页' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: '关闭右侧标签页' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: '关闭全部标签页' })).toBeNull()
  })

  it('routes the remaining tab close actions to the expected sessions', () => {
    const secondSession: SessionState = {
      ...session,
      sessionId: 'session-2',
      connectionId: secondConnection.id,
      connectionName: secondConnection.name,
    }
    const onCloseSession = vi.fn()
    const onCloseSessions = vi.fn()

    render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection, secondConnection]}
        activeSession={session}
        onCloseSession={onCloseSession}
        onCloseSessions={onCloseSessions}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session, secondSession]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    const secondTab = screen.getByRole('button', { name: 'Second Session' }).closest('div')!

    fireEvent.contextMenu(secondTab, { clientX: 140, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close Tab' }))
    expect(onCloseSession).toHaveBeenCalledWith('session-2')

    fireEvent.contextMenu(secondTab, { clientX: 140, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close Other Tabs' }))
    expect(onCloseSession).toHaveBeenCalledWith('session-1')
    expect(onCloseSessions).not.toHaveBeenCalled()
  })

  it('replays buffered tab output without resending terminal status queries as input', async () => {
    const secondSession: SessionState = {
      ...session,
      sessionId: 'session-2',
      connectionId: 'connection-2',
      connectionName: 'Second Session',
    }

    let terminalOutputListener: ((payload: TerminalOutputEvent) => void) | undefined
    vi.mocked(appClient.onTerminalOutput).mockImplementationOnce(async (listener) => {
      terminalOutputListener = listener
      return () => {}
    })

    const { rerender } = render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection, secondConnection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session, secondSession]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    await waitFor(() => expect(terminalOutputListener).toBeDefined())

    terminalOutputListener?.({
      sessionId: secondSession.sessionId,
      stream: 'stdout',
      data: 'prompt\u001b[6nready',
    })

    await waitFor(() =>
      expect(appClient.writeSessionInput).toHaveBeenCalledWith(secondSession.sessionId, '\u001b[1;1R'),
    )
    const queryResponseCountBeforeReplay = vi.mocked(appClient.writeSessionInput).mock.calls.length

    rerender(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection, secondConnection]}
        activeSession={secondSession}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session, secondSession]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    expect(terminalMocks.terminal.write).toHaveBeenLastCalledWith('promptready')
    expect(vi.mocked(appClient.writeSessionInput).mock.calls).toHaveLength(queryResponseCountBeforeReplay)
  })

  it('responds to split cursor-position queries for inactive sessions', async () => {
    const secondSession: SessionState = {
      ...session,
      sessionId: 'session-2',
      connectionId: 'connection-2',
      connectionName: 'Second Session',
      status: 'connecting',
      message: 'Connecting...',
    }

    let terminalOutputListener: ((payload: TerminalOutputEvent) => void) | undefined
    vi.mocked(appClient.onTerminalOutput).mockImplementationOnce(async (listener) => {
      terminalOutputListener = listener
      return () => {}
    })

    render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection, secondConnection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session, secondSession]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    await waitFor(() => expect(terminalOutputListener).toBeDefined())

    terminalOutputListener?.({
      sessionId: secondSession.sessionId,
      stream: 'stdout',
      data: '\u001b[',
    })

    expect(appClient.writeSessionInput).not.toHaveBeenCalled()

    terminalOutputListener?.({
      sessionId: secondSession.sessionId,
      stream: 'stdout',
      data: '6n',
    })

    await waitFor(() =>
      expect(appClient.writeSessionInput).toHaveBeenCalledWith(secondSession.sessionId, '\u001b[1;1R'),
    )
  })

  it('rehydrates the active session from the backend snapshot when early SSH prompts were missed', async () => {
    let terminalOutputListener: ((payload: TerminalOutputEvent) => void) | undefined
    let resolveSnapshot: ((value: string) => void) | undefined

    vi.mocked(appClient.onTerminalOutput).mockImplementationOnce(async (listener) => {
      terminalOutputListener = listener
      return () => {}
    })
    vi.mocked(appClient.getSessionTerminalBuffer).mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveSnapshot = resolve
        }),
    )

    render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    await waitFor(() => expect(terminalOutputListener).toBeDefined())

    terminalOutputListener?.({
      sessionId: session.sessionId,
      stream: 'stdout',
      data: `${connection.username}@${connection.host}'s password:`,
    })

    resolveSnapshot?.(
      [
        `The authenticity of host '${connection.host} (${connection.host})' can't be established.`,
        'ED25519 key fingerprint is SHA256:test.',
        "Are you sure you want to continue connecting (yes/no/[fingerprint])? yes",
        `Warning: Permanently added '${connection.host}' (ED25519) to the list of known hosts.`,
        `${connection.username}@${connection.host}'s password:`,
      ].join('\r\n'),
    )

    await waitFor(() =>
      expect(terminalMocks.terminal.write).toHaveBeenLastCalledWith(
        [
          `The authenticity of host '${connection.host} (${connection.host})' can't be established.`,
          'ED25519 key fingerprint is SHA256:test.',
          "Are you sure you want to continue connecting (yes/no/[fingerprint])? yes",
          `Warning: Permanently added '${connection.host}' (ED25519) to the list of known hosts.`,
          `${connection.username}@${connection.host}'s password:`,
        ].join('\r\n'),
      ),
    )
  })

  it('keeps resyncing the backend terminal buffer while connecting so missed SSH prompts still appear', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(appClient.getSessionTerminalBuffer)
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(
          [
            `The authenticity of host '${connection.host} (${connection.host})' can't be established.`,
            'ED25519 key fingerprint is SHA256:test.',
            "Are you sure you want to continue connecting (yes/no/[fingerprint])?",
          ].join('\r\n'),
        )

      render(
        <TerminalWorkspace
        shortcuts={{}}
          activeConnection={connection}
          connections={[connection]}
          activeSession={{ ...session, status: 'connecting', message: 'Connecting...' }}
          onCloseSession={vi.fn()}
          onDisconnect={vi.fn()}
          onSelectSession={vi.fn()}
          selectedConnection={connection}
          sessions={[{ ...session, status: 'connecting', message: 'Connecting...' }]}
          t={getTranslations('en')}
          theme="dark"
        />,
      )

      await act(async () => {
        await Promise.resolve()
      })

      const initialSyncCount = vi.mocked(appClient.getSessionTerminalBuffer).mock.calls.length
      expect(initialSyncCount).toBeGreaterThanOrEqual(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(vi.mocked(appClient.getSessionTerminalBuffer).mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(terminalMocks.terminal.write).toHaveBeenLastCalledWith(
        [
          `The authenticity of host '${connection.host} (${connection.host})' can't be established.`,
          'ED25519 key fingerprint is SHA256:test.',
          "Are you sure you want to continue connecting (yes/no/[fingerprint])?",
        ].join('\r\n'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps resyncing briefly after a session turns connected if the first visible prompt was missed', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(appClient.getSessionTerminalBuffer)
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(
          [
            `Welcome to ${connection.host}`,
            `${connection.username}@${connection.host}:~$ `,
          ].join('\r\n'),
        )

      const { rerender } = render(
        <TerminalWorkspace
        shortcuts={{}}
          activeConnection={connection}
          connections={[connection]}
          activeSession={{ ...session, status: 'connecting', message: 'Connecting...' }}
          onCloseSession={vi.fn()}
          onDisconnect={vi.fn()}
          onSelectSession={vi.fn()}
          selectedConnection={connection}
          sessions={[{ ...session, status: 'connecting', message: 'Connecting...' }]}
          t={getTranslations('en')}
          theme="dark"
        />,
      )

      await act(async () => {
        await Promise.resolve()
      })

      const initialSyncCount = vi.mocked(appClient.getSessionTerminalBuffer).mock.calls.length
      expect(initialSyncCount).toBeGreaterThanOrEqual(1)

      rerender(
        <TerminalWorkspace
        shortcuts={{}}
          activeConnection={connection}
          connections={[connection]}
          activeSession={{ ...session, status: 'connected', message: 'Connected.' }}
          onCloseSession={vi.fn()}
          onDisconnect={vi.fn()}
          onSelectSession={vi.fn()}
          selectedConnection={connection}
          sessions={[{ ...session, status: 'connected', message: 'Connected.' }]}
          t={getTranslations('en')}
          theme="dark"
        />,
      )

      await act(async () => {
        await Promise.resolve()
      })

      const connectedSyncCount = vi.mocked(appClient.getSessionTerminalBuffer).mock.calls.length
      expect(connectedSyncCount).toBeGreaterThan(initialSyncCount)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(vi.mocked(appClient.getSessionTerminalBuffer).mock.calls.length).toBeGreaterThan(
        connectedSyncCount,
      )
      expect(terminalMocks.terminal.write).toHaveBeenLastCalledWith(
        [
          `Welcome to ${connection.host}`,
          `${connection.username}@${connection.host}:~$ `,
        ].join('\r\n'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('pastes text via the terminal instance to ensure proper normalization and bracketed paste support', async () => {
    const { container } = render(
      <TerminalWorkspace
        shortcuts={{}}
        activeConnection={connection}
        connections={[connection]}
        activeSession={session}
        onCloseSession={vi.fn()}
        onSelectSession={vi.fn()}
        selectedConnection={connection}
        sessions={[session]}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    const terminalShell = container.querySelector('.terminal-shell')
    fireEvent.contextMenu(terminalShell!, {
      clientX: 100,
      clientY: 100,
    })

    const pasteButton = screen.getByRole('menuitem', { name: 'Paste' })
    await act(async () => {
      fireEvent.click(pasteButton)
    })

    expect(terminalMocks.terminal.paste).toHaveBeenCalledWith('clipboard text')
    expect(appClient.writeSessionInput).not.toHaveBeenCalledWith(session.sessionId, 'clipboard text')
  })
})
