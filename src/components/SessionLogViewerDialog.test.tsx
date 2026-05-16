import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getTranslations } from '../lib/i18n'
import type { SessionLogPreview, SessionRecordingStatus } from '../lib/types'
import { SessionLogViewerDialog } from './SessionLogViewerDialog'

const status: SessionRecordingStatus = {
  configuredEnabled: true,
  passwordLoaded: true,
  canRecord: true,
  logDirectory: 'C:\\Users\\iridi\\AppData\\Local\\Iridium Remote\\SessionLogs',
  currentStorageBytes: 1024,
}

const preview: SessionLogPreview = {
  files: [],
  previewText: 'example output',
  truncated: false,
}

describe('SessionLogViewerDialog', () => {
  it('keeps the preview scrollbar classes in sync with the active theme', async () => {
    const { container, rerender } = render(
      <SessionLogViewerDialog
        onClose={vi.fn()}
        onExport={vi.fn(async () => true)}
        onOpenFolder={vi.fn()}
        onPickFiles={vi.fn(async () => ['C:\\mock\\one.irlog'])}
        onPreview={vi.fn(async () => preview)}
        open
        status={status}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    const modalScrollRegion = container.querySelector('.modal-scroll-region')
    expect(modalScrollRegion).not.toBeNull()
    expect(modalScrollRegion).toHaveClass('themed-scrollbar', 'themed-scrollbar-dark')
    expect(modalScrollRegion).not.toHaveClass('themed-scrollbar-light')

    const previewArea = screen.getByRole('textbox')
    expect(previewArea).toHaveClass('themed-scrollbar', 'themed-scrollbar-dark')
    expect(previewArea).not.toHaveClass('themed-scrollbar-light')

    rerender(
      <SessionLogViewerDialog
        onClose={vi.fn()}
        onExport={vi.fn(async () => true)}
        onOpenFolder={vi.fn()}
        onPickFiles={vi.fn(async () => ['C:\\mock\\one.irlog'])}
        onPreview={vi.fn(async () => preview)}
        open
        status={status}
        t={getTranslations('en')}
        theme="light"
      />,
    )

    expect(modalScrollRegion).toHaveClass('themed-scrollbar', 'themed-scrollbar-light')
    expect(modalScrollRegion).not.toHaveClass('themed-scrollbar-dark')
    expect(previewArea).toHaveClass('themed-scrollbar', 'themed-scrollbar-light')
    expect(previewArea).not.toHaveClass('themed-scrollbar-dark')
  })
})
