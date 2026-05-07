import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTranslations } from '../lib/i18n'
import type { ConnectionListDisplayMode, ConnectionRecord } from '../lib/types'
import { ConnectionList } from './ConnectionList'

const connections: ConnectionRecord[] = [
  {
    id: '1',
    name: 'Alpha',
    groupName: 'Servers',
    host: '192.168.1.10',
    port: 22,
    username: 'root',
    hasPassword: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Beta',
    groupName: 'Servers',
    host: '10.0.0.2',
    port: 22,
    username: 'deploy',
    hasPassword: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

const TestConnectionList = ({
  initialDisplayMode = 'normal',
  onConnect = vi.fn(),
  theme = 'dark',
}: {
  initialDisplayMode?: ConnectionListDisplayMode
  onConnect?: (connection: ConnectionRecord) => void
  theme?: 'dark' | 'light'
}) => {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <ConnectionList
      activeConnectionCounts={{}}
      collapsedGroups={[]}
      connections={connections}
      displayMode={initialDisplayMode}
      isLoading={false}
      onConnect={onConnect}
      onCreate={vi.fn()}
      onDelete={vi.fn()}
      onDisplayModeChange={vi.fn()}
      onDuplicate={vi.fn()}
      onEdit={vi.fn()}
      onSearchChange={setSearchQuery}
      onSelect={vi.fn()}
      onToggleGroup={vi.fn()}
      searchQuery={searchQuery}
      selectedConnectionId={null}
      t={getTranslations('en')}
      theme={theme}
    />
  )
}

describe('ConnectionList', () => {
  afterEach(() => {
    cleanup()
  })

  it('filters connections in real time by name, host, and username', async () => {
    const user = userEvent.setup()

    render(<TestConnectionList />)

    await user.type(screen.getByRole('textbox', { name: 'Search connections' }), '192')

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })

  it('uses a compact more menu for edit, copy, and delete actions', async () => {
    const user = userEvent.setup()

    render(<TestConnectionList initialDisplayMode="compact" />)

    expect(screen.getAllByRole('button', { name: 'More actions' })).toHaveLength(2)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'More actions' })[0])

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('opens the compact action menu on right click', () => {
    render(<TestConnectionList initialDisplayMode="compact" />)

    fireEvent.contextMenu(screen.getByText('Alpha'))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('does not open a custom context menu in normal mode', () => {
    render(<TestConnectionList />)

    fireEvent.contextMenu(screen.getByText('Alpha'))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens a new session when a connection row is double-clicked', async () => {
    const user = userEvent.setup()
    const onConnect = vi.fn()

    render(<TestConnectionList onConnect={onConnect} />)

    await user.dblClick(screen.getByRole('button', { name: /Alpha root@192\.168\.1\.10/i }))

    expect(onConnect).toHaveBeenCalledTimes(1)
    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ id: '1', name: 'Alpha' }))
  })

  it('keeps the sidebar scrollbar classes in sync with the active theme', () => {
    const { container, rerender } = render(<TestConnectionList theme="dark" />)

    const scrollRegion = container.querySelector('.connection-list-scroll-region')
    expect(scrollRegion).not.toBeNull()
    expect(scrollRegion).toHaveClass('themed-scrollbar', 'themed-scrollbar-dark')
    expect(scrollRegion).not.toHaveClass('themed-scrollbar-light')

    rerender(<TestConnectionList theme="light" />)

    expect(scrollRegion).toHaveClass('themed-scrollbar', 'themed-scrollbar-light')
    expect(scrollRegion).not.toHaveClass('themed-scrollbar-dark')
  })
})
