import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { appClient } from '../api/client'
import { getTranslations } from '../lib/i18n'
import type { ConnectionRecord, SessionState } from '../lib/types'
import { TerminalWorkspace } from './TerminalWorkspace'

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
      this.options = { ...options }
    }

    loadAddon = vi.fn()
    open = vi.fn()
    onData = vi.fn()
    reset = vi.fn()
    write = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
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
    expect(screen.getByText('Test Only', { selector: 'p' })).toBeInTheDocument()
    expect(appClient.resizeSession).toHaveBeenCalledWith('session-1', 120, 32)
  })
})
