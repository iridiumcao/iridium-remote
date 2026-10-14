import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTranslations } from '../lib/i18n'
import type { SessionRecordingStatus } from '../lib/types'
import { SessionRecordingDialog } from './SessionRecordingDialog'

const baseStatus: SessionRecordingStatus = {
  configuredEnabled: false,
  passwordConfigured: true,
  passwordLoaded: true,
  canRecord: false,
  pausedForRun: false,
  needsPasswordVerification: false,
  logDirectory: 'C:\\Users\\iridi\\AppData\\Local\\Iridium Remote\\SessionLogs',
  currentStorageBytes: 1024,
}

describe('SessionRecordingDialog', () => {
  afterEach(cleanup)
  const renderDialog = (overrides: Partial<Parameters<typeof SessionRecordingDialog>[0]> = {}) => {
    const onSave = vi.fn(async () => undefined)
    const onVerify = vi.fn(async () => undefined)
    render(<SessionRecordingDialog
      open onClose={vi.fn()} onOpenFolder={vi.fn()} onPickLogDirectory={vi.fn()}
      onSave={onSave} onVerify={onVerify}
      settings={{ enabled: true, mode: 'input_only', maxFileSizeMb: 100, maxTotalStorageGb: 5, retentionDays: 30, logDirectory: null }}
      status={{ ...baseStatus, configuredEnabled: true }} t={getTranslations('en')} theme="dark"
      {...overrides}
    />)
    return { onSave, onVerify, user: userEvent.setup() }
  }

  it('preserves the password when saving other settings', async () => {
    const { user, onSave } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }), undefined)
  })

  it.each([true, false])('changes the password without the old password when loaded=%s', async (passwordLoaded) => {
    const { user, onSave } = renderDialog({ status: { ...baseStatus, passwordLoaded, pausedForRun: !passwordLoaded } })
    await user.click(screen.getByRole('button', { name: 'Change Password' }))
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset Password' })).not.toBeInTheDocument()
    expect(screen.getByText(getTranslations('en').sessionRecordingPasswordChangeWarning)).toBeInTheDocument()
    await user.type(screen.getByLabelText('New password'), 'new-secret')
    await user.type(screen.getByLabelText('Confirm password'), 'new-secret')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(expect.anything(), 'new-secret')
  })

  it('requires a valid password and matching confirmation for first-time setup', async () => {
    const { user, onSave } = renderDialog({ status: { ...baseStatus, passwordConfigured: false, passwordLoaded: false } })
    expect(screen.queryByRole('button', { name: 'Change Password' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(getTranslations('en').validationPasswordLength)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Encryption password'), 'first-secret')
    await user.type(screen.getByLabelText('Confirm password'), 'mismatched-secret')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(getTranslations('en').validationPasswordConfirm)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText('Confirm password'), 'first-secret')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(expect.anything(), 'first-secret')
  })

  it('resumes recording by verifying the existing password without replacing it', async () => {
    const { user, onSave, onVerify } = renderDialog({ status: { ...baseStatus, passwordLoaded: false, pausedForRun: true } })
    await user.click(screen.getByRole('button', { name: 'Verify Password' }))
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Encryption password'), 'super-secret')
    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(onVerify).toHaveBeenCalledWith('super-secret')
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Encryption password')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(expect.anything(), undefined)
  })

  it('disables dependent controls when recording is unchecked', () => {
    render(
      <SessionRecordingDialog
        onClose={vi.fn()}
        onOpenFolder={vi.fn()}
        onPickLogDirectory={vi.fn()}
        onSave={vi.fn(async () => undefined)}
        onVerify={vi.fn(async () => undefined)}
        open
        settings={{
          enabled: false,
          mode: 'input_only',
          maxFileSizeMb: 100,
          maxTotalStorageGb: 5,
          retentionDays: 30,
          logDirectory: null,
        }}
        status={baseStatus}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    const fieldsets = document.querySelectorAll('fieldset[disabled]')
    expect(fieldsets).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Browse folder' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled()
  })

  it('shows password status and explicit management actions when a password is already loaded', () => {
    render(
      <SessionRecordingDialog
        onClose={vi.fn()}
        onOpenFolder={vi.fn()}
        onPickLogDirectory={vi.fn()}
        onSave={vi.fn(async () => undefined)}
        onVerify={vi.fn(async () => undefined)}
        open
        settings={{
          enabled: true,
          mode: 'input_only',
          maxFileSizeMb: 100,
          maxTotalStorageGb: 5,
          retentionDays: 30,
          logDirectory: null,
        }}
        status={baseStatus}
        t={getTranslations('en')}
        theme="dark"
      />,
    )
    expect(document.querySelector('input[type="password"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Reset Password' })).not.toBeInTheDocument()
    expect(screen.getByText('An encryption password is currently loaded for this app run.')).toBeInTheDocument()
  })

  it('keeps the log-directory action buttons aligned with the input row', () => {
    render(
      <SessionRecordingDialog
        onClose={vi.fn()}
        onOpenFolder={vi.fn()}
        onPickLogDirectory={vi.fn()}
        onSave={vi.fn(async () => undefined)}
        onVerify={vi.fn(async () => undefined)}
        open
        settings={{
          enabled: true,
          mode: 'input_only',
          maxFileSizeMb: 100,
          maxTotalStorageGb: 5,
          retentionDays: 30,
          logDirectory: null,
        }}
        status={baseStatus}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    const logDirectoryRow = screen
      .getAllByDisplayValue('C:\\Users\\iridi\\AppData\\Local\\Iridium Remote\\SessionLogs')[0]
      .closest('div')

    expect(logDirectoryRow).toHaveClass('flex', 'flex-col', 'gap-3', 'sm:flex-row', 'sm:items-center')
  })
})
