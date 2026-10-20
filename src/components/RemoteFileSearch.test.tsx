import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appClient } from '../api/client'
import { getTranslations } from '../lib/i18n'
import type { RemoteSearchResult } from '../lib/types'
import { RemoteFileSearch } from './RemoteFileSearch'

vi.mock('../api/client', () => ({ appClient: {
  searchRemoteFiles: vi.fn(),
  normalizeError: (cause: Error) => ({ message: cause.message }),
} }))
const props = { scope: { connectionId: 'host-1', mode: 'content' as const, path: '/var', showHidden: true }, dark: true, t: getTranslations('en'), onClose: vi.fn(), onSelect: vi.fn() }
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('RemoteFileSearch', () => {
  it('reports partial results and skipped items, then opens a chosen result', async () => {
    const match = { name: 'app.log', path: '/var/app.log', isDirectory: false, line: 5, preview: '<script>error</script>' }
    vi.mocked(appClient.searchRemoteFiles).mockResolvedValueOnce({ matches: [match], scannedEntries: 100, skippedEntries: 3, truncated: true })
    render(<RemoteFileSearch {...props} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'error' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
    await screen.findByText(props.t.remoteSearchLimited)
    expect(screen.getByText(props.t.remoteSearchSkipped(3))).toBeInTheDocument()
    expect(screen.getByText('<script>error</script>')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /\/var\/app.log:5/ }))
    expect(props.onSelect).toHaveBeenCalledWith(match)
  })

  it('allows retry after search errors and rejects duplicate submissions while busy', async () => {
    let finish!: (result: RemoteSearchResult) => void
    vi.mocked(appClient.searchRemoteFiles).mockRejectedValueOnce(new Error('Permission denied'))
      .mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    render(<RemoteFileSearch {...props} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'error' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
    expect(screen.getByRole('button', { name: 'Find' })).toBeDisabled()
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)
    expect(appClient.searchRemoteFiles).toHaveBeenCalledTimes(2)
    await act(async () => finish({ matches: [], scannedEntries: 1, skippedEntries: 0, truncated: false }))
    expect(screen.getByRole('status')).toHaveTextContent('0 result(s).')
  })
})
