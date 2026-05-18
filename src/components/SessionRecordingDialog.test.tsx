import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
  it('disables dependent controls when recording is unchecked', () => {
    render(
      <SessionRecordingDialog
        onClose={vi.fn()}
        onOpenFolder={vi.fn()}
        onPickLogDirectory={vi.fn()}
        onSave={vi.fn(async () => undefined)}
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

  it('shows a masked placeholder when a password is already loaded', () => {
    render(
      <SessionRecordingDialog
        onClose={vi.fn()}
        onOpenFolder={vi.fn()}
        onPickLogDirectory={vi.fn()}
        onSave={vi.fn(async () => undefined)}
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
    const passwordInput = document.querySelector('input[type="password"]')
    expect(passwordInput).toHaveAttribute('placeholder', '********')
  })

  it('keeps the log-directory action buttons aligned with the input row', () => {
    render(
      <SessionRecordingDialog
        onClose={vi.fn()}
        onOpenFolder={vi.fn()}
        onPickLogDirectory={vi.fn()}
        onSave={vi.fn(async () => undefined)}
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
