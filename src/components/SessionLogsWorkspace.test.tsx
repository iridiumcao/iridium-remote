import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTranslations } from '../lib/i18n'
import type { SessionLogFileInfo, SessionLogList, SessionRecordingStatus } from '../lib/types'
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

const warning = {
  fileName: 'empty.irlog',
  path: `${status.logDirectory}\\empty.irlog`,
  error: { code: 'VALIDATION_ERROR', message: 'The selected file is not a supported .irlog file.', details: null },
}

const props = (overrides: Partial<ComponentProps<typeof SessionLogsWorkspace>> = {}) => ({
  active: true,
  locale: 'en' as const,
  onExport: vi.fn(async () => true),
  onListLogs: vi.fn(async (): Promise<SessionLogList> => ({ files, warnings: [] })),
  onOpenFolder: vi.fn(),
  onPreview: vi.fn(async () => ({ files, previewText: '', truncated: false })),
  status,
  t: getTranslations('en'),
  theme: 'dark' as const,
  ...overrides,
})

afterEach(cleanup)

describe('SessionLogsWorkspace', () => {
  it.each(['en', 'zh-CN', 'zh-TW'] as const)('shows readable logs and warning details in %s', async (locale) => {
    const t = getTranslations(locale)
    render(<SessionLogsWorkspace {...props({
      locale, t, theme: locale === 'en' ? 'dark' : 'light',
      onListLogs: vi.fn(async () => ({ files, warnings: [warning] })),
    })} />)
    const summary = await screen.findByText(t.sessionLogsScanWarnings(1, 1))
    expect(screen.queryByText(t.sessionLogsNoDiscoveredLogs)).not.toBeInTheDocument()
    expect(within(screen.getByTestId('session-logs-files-card')).getByText(files[0].fileName)).toBeInTheDocument()
    fireEvent.click(summary)
    expect(summary.closest('details')).toHaveAttribute('open')
    expect(screen.getByText(warning.fileName)).toBeVisible()
    expect(screen.getByText(warning.error.message, { exact: false })).toBeVisible()
  })

  it('reports all-invalid files separately from a genuinely empty directory', async () => {
    const onListLogs = vi.fn(async () => ({ files: [], warnings: [warning] }))
    render(<SessionLogsWorkspace {...props({ onListLogs })} />)
    await screen.findByText(getTranslations('en').sessionLogsScanWarnings(0, 1))
    expect(screen.queryByText(getTranslations('en').sessionLogsNoDiscoveredLogs)).not.toBeInTheDocument()
    onListLogs.mockResolvedValueOnce({ files: [], warnings: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText(getTranslations('en').sessionLogsNoDiscoveredLogs)
    expect(screen.queryByText(warning.fileName)).not.toBeInTheDocument()
  })

  it('shows the structured backend error on initial failure and supports retry', async () => {
    const onListLogs = vi.fn<() => Promise<SessionLogList>>()
      .mockRejectedValueOnce({ code: 'INTERNAL_ERROR', message: 'Cannot read the log directory.', details: 'Access denied' })
      .mockResolvedValueOnce({ files, warnings: [] })
    render(<SessionLogsWorkspace {...props({ onListLogs })} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot read the log directory.')
    expect(screen.getByRole('alert')).toHaveTextContent('Access denied')
    expect(screen.queryByText(getTranslations('en').sessionLogsNoDiscoveredLogs)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Selected logs' })).toHaveValue(files[0].fileName)
  })

  it('preserves the list and selection after refresh failure, then reconciles them on success', async () => {
    const replacement = { ...files[0], path: 'replacement.irlog', fileName: 'replacement.irlog', host: 'beta.example.com' }
    const onListLogs = vi.fn<() => Promise<SessionLogList>>()
      .mockResolvedValueOnce({ files, warnings: [] })
      .mockRejectedValueOnce({ code: 'INTERNAL_ERROR', message: 'Directory unavailable.' })
      .mockResolvedValueOnce({ files: [replacement], warnings: [] })
    render(<SessionLogsWorkspace {...props({ onListLogs })} />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Selected logs' })).toHaveValue(files[0].fileName))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Directory unavailable.')
    expect(screen.getByRole('textbox', { name: 'Selected logs' })).toHaveValue(files[0].fileName)
    expect(within(screen.getByTestId('session-logs-files-card')).getByText(files[0].fileName)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Selected logs' })).toHaveValue('replacement.irlog'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('session-logs-files-card')).getByText('root@beta.example.com')).toBeInTheDocument()
  })

  it('keeps fallback file selection within the current source after refresh', async () => {
    const beta = { ...files[0], path: 'beta.irlog', fileName: 'beta.irlog', host: 'beta.example.com' }
    const replacement = { ...files[0], path: 'alpha-new.irlog', fileName: 'alpha-new.irlog' }
    const onListLogs = vi.fn<() => Promise<SessionLogList>>()
      .mockResolvedValueOnce({ files: [...files, beta], warnings: [] })
      .mockResolvedValueOnce({ files: [beta, replacement], warnings: [] })
    render(<SessionLogsWorkspace {...props({ onListLogs })} />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Selected logs' })).toHaveValue(files[0].fileName))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Selected logs' })).toHaveValue(replacement.fileName))
    expect(within(screen.getByTestId('session-logs-files-card')).getByText('root@alpha.example.com')).toBeInTheDocument()
  })

  it('ignores an outstanding scan after leaving the tab', async () => {
    let finishScan!: (result: SessionLogList) => void
    const onListLogs = vi.fn<() => Promise<SessionLogList>>()
      .mockImplementationOnce(() => new Promise((resolve) => { finishScan = resolve }))
      .mockResolvedValueOnce({ files: [], warnings: [] })
    const workspaceProps = props({ onListLogs })
    const { rerender } = render(<SessionLogsWorkspace {...workspaceProps} />)
    await waitFor(() => expect(onListLogs).toHaveBeenCalledTimes(1))
    rerender(<SessionLogsWorkspace {...workspaceProps} active={false} />)
    finishScan({ files, warnings: [warning] })
    rerender(<SessionLogsWorkspace {...workspaceProps} />)
    await screen.findByText(getTranslations('en').sessionLogsNoDiscoveredLogs)
    expect(screen.queryByText(warning.fileName)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Selected logs' })).toHaveValue(getTranslations('en').noSessionLogsSelected)
  })

  it('shows the inline password row before the selected logs list and keeps the new panel order', async () => {
    render(
      <SessionLogsWorkspace
        active
        locale="en"
        onExport={vi.fn(async () => true)}
        onListLogs={vi.fn(async () => ({ files, warnings: [] }))}
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
