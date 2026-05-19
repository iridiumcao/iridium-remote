import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getTranslations } from '../lib/i18n'
import type { SessionLogFileInfo, SessionRecordingStatus } from '../lib/types'
import { SessionLogsWorkspace } from './SessionLogsWorkspace'

const status: SessionRecordingStatus = {
  configuredEnabled: true,
  passwordConfigured: true,
  passwordLoaded: true,
  canRecord: true,
  pausedForRun: false,
  needsPasswordVerification: false,
  logDirectory: 'C:\\Users\\iridi\\AppData\\Local\\Iridium Remote\\SessionLogs',
  currentStorageBytes: 1740,
}

const files: SessionLogFileInfo[] = [
  {
    fileName: '2026-01-02_root_alpha.irlog',
    path: 'C:\\Users\\iridi\\AppData\\Local\\Iridium Remote\\SessionLogs\\2026-01-02_root_alpha.irlog',
    createdAt: '2026-01-02T00:00:00Z',
    host: 'alpha.example.com',
    username: 'root',
    recordingMode: 'full',
    part: 1,
  },
]

describe('SessionLogsWorkspace', () => {
  it('shows the inline password row before the selected logs list and keeps the new panel order', async () => {
    render(
      <SessionLogsWorkspace
        active
        locale="en"
        onExport={vi.fn(async () => true)}
        onListLogs={vi.fn(async () => files)}
        onOpenFolder={vi.fn()}
        onPreview={vi.fn(async () => ({ files, previewText: '', truncated: false }))}
        status={status}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-logs-directory-card')).toBeInTheDocument()
    })

    const directoryCard = screen.getByTestId('session-logs-directory-card')
    const selectedCard = screen.getByTestId('session-logs-selected-card')
    const filesCard = screen.getByTestId('session-logs-files-card')
    const previewCard = screen.getByTestId('session-logs-preview-card')
    const passwordRow = screen.getByTestId('session-logs-password-row')
    const selectedList = screen.getByTestId('session-logs-selected-list')

    expect(
      within(directoryCard).getByText((_, node) =>
        node?.textContent?.replace(/\s+/g, ' ').trim() ===
        'Log directory (Current usage: 1.7 KB)',
      ),
    ).toBeInTheDocument()
    expect(within(directoryCard).getByText(status.logDirectory)).toBeInTheDocument()

    expect(
      selectedCard.compareDocumentPosition(filesCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(
      filesCard.compareDocumentPosition(previewCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)

    expect(
      within(directoryCard).queryByRole('button', { name: 'Clear selection' }),
    ).not.toBeInTheDocument()
    expect(
      within(selectedCard).getByRole('button', { name: 'Clear selection' }),
    ).toBeInTheDocument()
    expect(
      passwordRow.compareDocumentPosition(selectedList) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)

    const passwordInput = within(passwordRow).getByLabelText('Encryption password')
    expect(passwordInput).toBeInTheDocument()
    expect(within(selectedCard).getByRole('button', { name: 'Decrypt Preview' })).toBeInTheDocument()
    expect(within(selectedCard).getByRole('button', { name: 'Export as .txt' })).toBeInTheDocument()
    expect(within(selectedCard).getByRole('textbox', { name: 'Selected logs' })).toHaveValue(
      '2026-01-02_root_alpha.irlog',
    )
  })
})
