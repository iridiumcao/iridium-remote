import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
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
}: {
  initialDisplayMode?: ConnectionListDisplayMode
}) => {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <ConnectionList
      activeConnectionCounts={{}}
      collapsedGroups={[]}
      connections={connections}
      displayMode={initialDisplayMode}
      isLoading={false}
      onConnect={vi.fn()}
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
      theme="dark"
    />
  )
}

describe('ConnectionList', () => {
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
})
