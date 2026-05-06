import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { appClient } from '../api/client'
import { getTranslations } from '../lib/i18n'
import type { ConnectionRecord, SessionState } from '../lib/types'
import { TerminalWorkspace } from './TerminalWorkspace'

const terminalMocks = vi.hoisted(() => {
  const terminal = {
    cols: 120,
    rows: 32,
    options: {} as { theme?: unknown },
    loadAddon: vi.fn(),
    open: vi.fn(),
    onData: vi.fn(),
    reset: vi.fn(),
    write: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    getSelection: vi.fn(() => 'selected text'),
    selectAll: vi.fn(),
  }

  return { terminal }
})

vi.mock('../api/client', () => ({
  appClient: {
    onTerminalOutput: vi.fn().mockResolvedValue(() => {}),
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
})
