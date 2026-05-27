import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
    cols = 120
    rows = 32
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
  terminalMocks.terminal.getSelection.mockReturnValue('selected text')
  vi.mocked(appClient.getSessionTerminalBuffer).mockResolvedValue('')
})

describe('TerminalWorkspace', () => {
  it('uses the SSH target as the workspace title instead of repeating the tab label', () => {
    render(
      <TerminalWorkspace
        activeConnection={connection}
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
    expect(appClient.resizeSession).toHaveBeenCalledWith('session-1', 120, 32)
  })

  it('keeps the terminal visible while a session is connecting so SSH prompts can appear', () => {
    render(
      <TerminalWorkspace
        activeConnection={connection}
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
    expect(appClient.resizeSession).toHaveBeenCalledWith('session-1', 120, 32)
  })

  it('shows a recording indicator when the active session is being recorded', () => {
    render(
      <TerminalWorkspace
        activeConnection={connection}
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
        activeConnection={connection}
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
        activeConnection={connection}
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
        activeConnection={connection}
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
        activeConnection={connection}
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

    rerender(
      <TerminalWorkspace
        activeConnection={connection}
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
    expect(appClient.writeSessionInput).not.toHaveBeenCalledWith(secondSession.sessionId, '\u001b[1;1R')
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
        activeConnection={connection}
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
          activeConnection={connection}
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

      expect(appClient.getSessionTerminalBuffer).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(appClient.getSessionTerminalBuffer).toHaveBeenCalledTimes(2)
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

  it('pastes text via the terminal instance to ensure proper normalization and bracketed paste support', async () => {
    const { container } = render(
      <TerminalWorkspace
        activeConnection={connection}
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
