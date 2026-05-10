import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTranslations } from '../lib/i18n'
import { ConnectionFormDialog } from './ConnectionFormDialog'

describe('ConnectionFormDialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows existing groups as selectable suggestions', async () => {
    const user = userEvent.setup()

    render(
      <ConnectionFormDialog
        connection={null}
        existingGroups={['Chengdu', 'Raleigh']}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    const groupInput = screen.getByRole('combobox', { name: 'Group' })
    await user.click(groupInput)
    const groupList = screen.getByRole('listbox')

    expect(groupInput).toHaveAttribute('aria-expanded', 'true')
    expect(groupList).toHaveClass('bg-slate-950')
    expect(screen.getByRole('option', { name: 'Chengdu' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Raleigh' })).toBeInTheDocument()
  })

  it('keeps the group field freeform so new groups can be typed', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)

    render(
      <ConnectionFormDialog
        connection={null}
        existingGroups={['Chengdu', 'Raleigh']}
        onClose={vi.fn()}
        onSave={onSave}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Test Only')
    await user.type(screen.getByRole('combobox', { name: 'Group' }), 'New Group')
    await user.type(screen.getByRole('textbox', { name: 'Host' }), '192.168.1.10')
    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'tester')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({
      name: 'Test Only',
      groupName: 'New Group',
      host: '192.168.1.10',
      port: 22,
      username: 'tester',
      password: undefined,
    })
  })

  it('lets users pick an existing group from the suggestion list', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)

    render(
      <ConnectionFormDialog
        connection={null}
        existingGroups={['Chengdu', 'Raleigh']}
        onClose={vi.fn()}
        onSave={onSave}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Test Only')
    await user.click(screen.getByRole('combobox', { name: 'Group' }))
    await user.click(screen.getByRole('option', { name: 'Raleigh' }))
    await user.type(screen.getByRole('textbox', { name: 'Host' }), '192.168.1.10')
    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'tester')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({
      name: 'Test Only',
      groupName: 'Raleigh',
      host: '192.168.1.10',
      port: 22,
      username: 'tester',
      password: undefined,
    })
  })

  it('normalizes typed group names to title case before saving', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)

    render(
      <ConnectionFormDialog
        connection={null}
        existingGroups={['Home']}
        onClose={vi.fn()}
        onSave={onSave}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Test Only')
    await user.type(screen.getByRole('combobox', { name: 'Group' }), 'hOME')
    await user.type(screen.getByRole('textbox', { name: 'Host' }), '192.168.1.10')
    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'tester')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({
      name: 'Test Only',
      groupName: 'Home',
      host: '192.168.1.10',
      port: 22,
      username: 'tester',
      password: undefined,
    })
  })
})
