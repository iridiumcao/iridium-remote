import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTranslations } from '../lib/i18n'
import { ConnectionFormDialog } from './ConnectionFormDialog'

describe('ConnectionFormDialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows existing groups as selectable suggestions', () => {
    const { container } = render(
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
    const listId = groupInput.getAttribute('list')
    const groupList = listId ? container.querySelector(`datalist[id="${listId}"]`) : null

    expect(listId).toBeTruthy()
    expect(groupList?.querySelector('option[value="Chengdu"]')).not.toBeNull()
    expect(groupList?.querySelector('option[value="Raleigh"]')).not.toBeNull()
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
})
