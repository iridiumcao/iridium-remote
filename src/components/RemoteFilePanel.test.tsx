import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appClient } from '../api/client'
import { getTranslations } from '../lib/i18n'
import type { RemotePathListing } from '../lib/types'
import { RemoteFilePanel } from './RemoteFilePanel'

vi.mock('../api/client', () => ({ appClient: {
  listRemoteDirectory: vi.fn(),
  openRemotePath: vi.fn(),
  closeRemoteBrowser: vi.fn().mockResolvedValue(undefined),
  pickTransferLocalPath: vi.fn(),
  transferFile: vi.fn().mockResolvedValue({ message: 'done' }),
  searchRemoteFiles: vi.fn().mockResolvedValue({ matches: [], scannedEntries: 0, skippedEntries: 0, truncated: false }),
  normalizeError: (cause: Error & { details?: string }) => ({ message: cause.message, details: cause.details }),
} }))

const home: RemotePathListing = { currentPath: '/home/demo', entries: [
  { name: 'logs', path: '/home/demo/logs', isDirectory: true },
  { name: 'hello.txt', path: '/home/demo/hello.txt', isDirectory: false },
] }
const props = { sessionId: 'session-1', connectionId: 'host-1', connectionName: 'Host One', visible: true, onClose: vi.fn(), theme: 'dark' as const, t: getTranslations('en') }
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const chooseUpload = (mode: 'file' | 'directory') => {
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  fireEvent.click(screen.getByRole('menuitem', { name: mode === 'file' ? 'Browse file' : 'Browse folder' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  vi.mocked(appClient.listRemoteDirectory).mockImplementation(async (_id, path) => path === '/home/demo/logs'
    ? { currentPath: path, entries: [{ name: 'app.log', path: `${path}/app.log`, isDirectory: false }] }
    : home)
  vi.mocked(appClient.openRemotePath).mockImplementation(async (id, path, options) => {
    const isFile = /\.(txt|log)$/.test(path)
    const listing = await appClient.listRemoteDirectory(id, isFile ? path.replace(/\/[^/]*$/, '') : path, options)
    return { listing, selectedEntry: isFile ? listing.entries.find(entry => entry.path === path)!
      : { name: listing.currentPath, path: listing.currentPath, isDirectory: true } }
  })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('RemoteFilePanel', () => {
  it('commits double-clicked directories and refreshes there without changing the tree anchor', async () => {
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'logs' }))
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo')
    fireEvent.doubleClick(screen.getByRole('button', { name: 'logs' }))
    await screen.findByRole('button', { name: 'app.log' })
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo/logs')
    expect(screen.getByRole('button', { name: '/home/demo' })).toBeInTheDocument()
    fireEvent.doubleClick(screen.getByRole('button', { name: 'app.log' }))
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo/logs')
    fireEvent.click(screen.getByRole('button', { name: 'app.log' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Remote path' }), { target: { value: '/unsubmitted' } })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(appClient.listRemoteDirectory).toHaveBeenCalledTimes(3))
    expect(appClient.listRemoteDirectory).toHaveBeenLastCalledWith('host-1', '/home/demo/logs', { browserId: 'session-1', showHidden: false })
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo/logs')
    await waitFor(() => expect(screen.getByRole('button', { name: 'app.log' })).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.click(screen.getByRole('button', { name: 'Hidden files' }))
    await waitFor(() => expect(appClient.listRemoteDirectory).toHaveBeenLastCalledWith('host-1', '/home/demo/logs', { browserId: 'session-1', showHidden: true }))
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo/logs')
    expect(screen.getByRole('button', { name: 'app.log' })).toHaveAttribute('aria-pressed', 'true')
  })

  it.each(['/home/demo/logs/app.log', 'logs/app.log'])('opens file path %s at its parent, selects it and scrolls it into view', async input => {
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'logs' })
    scroll.mockClear()
    fireEvent.change(screen.getByRole('textbox', { name: 'Remote path' }), { target: { value: input } })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const file = await screen.findByRole('button', { name: 'app.log' })
    expect(file).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo/logs')
    expect(appClient.openRemotePath).toHaveBeenCalledWith('host-1', '/home/demo/logs/app.log', { browserId: 'session-1', showHidden: false })
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('resets the tree at the canonical directory on Open and uses it for parent navigation', async () => {
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open logs' }))
    await screen.findByRole('button', { name: 'app.log' })
    vi.mocked(appClient.openRemotePath).mockResolvedValueOnce({ listing: { currentPath: '/home/demo/logs', entries: [{ name: 'app.log', path: '/home/demo/logs/app.log', isDirectory: false }] }, selectedEntry: { name: 'logs', path: '/home/demo/logs', isDirectory: true } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Remote path' }), { target: { value: '/home/demo/./logs/' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo/logs'))
    expect(screen.getByRole('button', { name: '/home/demo/logs' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '/home/demo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'app.log' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Up to parent folder' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo'))
  })

  it('retains the last valid directory, tree and selection when Open fails', async () => {
    render(<RemoteFilePanel {...props} />)
    fireEvent.doubleClick(await screen.findByRole('button', { name: 'logs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'app.log' }))
    vi.mocked(appClient.openRemotePath).mockRejectedValueOnce({ message: 'Failed to inspect the remote path.', details: 'Permission denied' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Remote path' }), { target: { value: '/private' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
    expect(screen.getByRole('button', { name: 'app.log' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo/logs'))
    expect(appClient.listRemoteDirectory).toHaveBeenLastCalledWith('host-1', '/home/demo/logs', { browserId: 'session-1', showHidden: false })
  })

  it('clears a selected file that disappears during refresh', async () => {
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'hello.txt' }))
    vi.mocked(appClient.listRemoteDirectory).mockResolvedValueOnce({ ...home, entries: [home.entries[0]] })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'hello.txt' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
  })

  it('keeps browsing a hidden directory when hidden files are turned off', async () => {
    const hiddenDirectory = { name: '.private', path: '/home/demo/.private', isDirectory: true }
    const secret = { name: 'secret.txt', path: '/home/demo/.private/secret.txt', isDirectory: false }
    vi.mocked(appClient.listRemoteDirectory).mockImplementation(async (_id, path, options) => path === hiddenDirectory.path
      ? { currentPath: path, entries: [secret] }
      : { ...home, entries: options?.showHidden ? [hiddenDirectory, ...home.entries] : home.entries })
    render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'logs' })
    fireEvent.click(screen.getByRole('button', { name: 'Hidden files' }))
    fireEvent.doubleClick(await screen.findByRole('button', { name: '.private' }))
    fireEvent.click(await screen.findByRole('button', { name: 'secret.txt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hidden files' }))
    await screen.findByRole('button', { name: hiddenDirectory.path })
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue(hiddenDirectory.path)
    expect(screen.getByRole('button', { name: 'secret.txt' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(screen.queryByText(props.t.loadingRemotePaths)).not.toBeInTheDocument())
  })

  it('temporarily selects an explicitly opened hidden file and filters it on refresh', async () => {
    const hiddenFile = { name: '.env', path: '/home/demo/.env', isDirectory: false }
    render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'logs' })
    vi.mocked(appClient.openRemotePath).mockResolvedValueOnce({ listing: { ...home, entries: [...home.entries, hiddenFile] }, selectedEntry: hiddenFile })
    fireEvent.change(screen.getByRole('textbox', { name: 'Remote path' }), { target: { value: '.env' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('button', { name: '.env' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Hidden files' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '.env' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
  })

  it('ignores a delayed file navigation after Home is requested', async () => {
    const delayed = deferred<Awaited<ReturnType<typeof appClient.openRemotePath>>>()
    render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'logs' })
    vi.mocked(appClient.openRemotePath).mockReturnValueOnce(delayed.promise)
    fireEvent.change(screen.getByRole('textbox', { name: 'Remote path' }), { target: { value: '/var/app.log' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo'))
    await act(async () => delayed.resolve({ listing: { currentPath: '/var', entries: [] }, selectedEntry: { name: 'app.log', path: '/var/app.log', isDirectory: false } }))
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo')
    expect(screen.getByRole('button', { name: 'logs' })).toBeInTheDocument()
  })

  it('retains current contents and selection on refresh failure', async () => {
    render(<RemoteFilePanel {...props} />)
    fireEvent.doubleClick(await screen.findByRole('button', { name: 'logs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'app.log' }))
    vi.mocked(appClient.listRemoteDirectory).mockRejectedValueOnce(new Error('Connection lost'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
    expect(screen.getByRole('button', { name: 'app.log' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo/logs')
  })

  it('loads children only when expanded and caches collapsed branches', async () => {
    render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'logs' })
    expect(appClient.listRemoteDirectory).toHaveBeenCalledTimes(1)
    expect(appClient.listRemoteDirectory).toHaveBeenCalledWith('host-1', '', { browserId: 'session-1', showHidden: false })
    fireEvent.click(screen.getByRole('button', { name: 'Open logs' }))
    await screen.findByRole('button', { name: 'app.log' })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse logs' }))
    expect(screen.queryByRole('button', { name: 'app.log' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open logs' }))
    expect(screen.getByRole('button', { name: 'app.log' })).toBeInTheDocument()
    expect(appClient.listRemoteDirectory).toHaveBeenCalledTimes(2)
  })

  it('keeps directory errors local and retries failed branches', async () => {
    vi.mocked(appClient.listRemoteDirectory).mockResolvedValueOnce(home).mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce({ currentPath: '/home/demo/logs', entries: [] })
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open logs' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
    expect(screen.getByRole('button', { name: 'hello.txt' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText(props.t.noRemotePaths)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores an old root response after navigating elsewhere', async () => {
    const old = deferred<RemotePathListing>()
    vi.mocked(appClient.listRemoteDirectory).mockReturnValueOnce(old.promise).mockResolvedValueOnce({ currentPath: '/var', entries: [] })
    render(<RemoteFilePanel {...props} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Remote path' }), { target: { value: '/var' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Remote path' }).closest('form')!)
    await screen.findByRole('button', { name: '/var' })
    await act(async () => old.resolve(home))
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/var')
    expect(screen.queryByRole('button', { name: 'logs' })).not.toBeInTheDocument()
  })

  it('invalidates cached branches when hidden files are enabled', async () => {
    render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'Open logs' })
    expect(screen.getByRole('button', { name: 'Hidden files' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Hidden files' }))
    expect(screen.getByRole('button', { name: 'Hidden files' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(appClient.listRemoteDirectory).toHaveBeenLastCalledWith('host-1', '/home/demo', { browserId: 'session-1', showHidden: true }))
  })

  it('returns Home immediately, resets expanded branches, and resolves the home address', async () => {
    const homeListing = deferred<RemotePathListing>()
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open logs' }))
    await screen.findByRole('button', { name: 'app.log' })
    vi.mocked(appClient.listRemoteDirectory).mockResolvedValueOnce({ currentPath: '/var', entries: [] })
    fireEvent.change(screen.getByRole('textbox', { name: 'Remote path' }), { target: { value: '/var' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Remote path' }).closest('form')!)
    await screen.findByRole('button', { name: '/var' })
    vi.mocked(appClient.listRemoteDirectory).mockReturnValueOnce(homeListing.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.getByRole('textbox', { name: 'Remote path' })).toHaveValue('/home/demo')
    expect(screen.queryByRole('button', { name: 'app.log' })).not.toBeInTheDocument()
    await act(async () => homeListing.resolve(home))
    expect(screen.getByRole('button', { name: 'Open logs' })).toHaveAttribute('aria-expanded', 'false')
    expect(appClient.listRemoteDirectory).toHaveBeenLastCalledWith('host-1', '', { browserId: 'session-1', showHidden: false })
  })

  it('selects the right-clicked item and copies its path', async () => {
    render(<RemoteFilePanel {...props} />)
    fireEvent.contextMenu(await screen.findByRole('button', { name: 'hello.txt' }), { clientX: 100, clientY: 100 })
    expect(screen.getByRole('button', { name: 'hello.txt' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))
    await screen.findByText('Path copied.')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/home/demo/hello.txt')
    expect(screen.getByRole('button', { name: 'Copy path' })).toHaveAttribute('title', 'Path copied.')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('refreshes a directory branch and discards cached descendants', async () => {
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open logs' }))
    await screen.findByRole('button', { name: 'app.log' })
    vi.mocked(appClient.listRemoteDirectory).mockResolvedValueOnce({ currentPath: '/home/demo/logs', entries: [] })
    fireEvent.contextMenu(screen.getByRole('button', { name: 'logs' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh' }))
    await screen.findByText(props.t.noRemotePaths)
    expect(screen.queryByRole('button', { name: 'app.log' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'hello.txt' })).toBeInTheDocument()
  })

  it('does not resurrect a stale descendant response after branch refresh', async () => {
    const stale = deferred<RemotePathListing>()
    const branch = { currentPath: '/home/demo/logs', entries: [{ name: 'nested', path: '/home/demo/logs/nested', isDirectory: true }] }
    vi.mocked(appClient.listRemoteDirectory).mockResolvedValueOnce(home).mockResolvedValueOnce(branch)
      .mockReturnValueOnce(stale.promise).mockResolvedValueOnce(branch)
      .mockResolvedValueOnce({ currentPath: '/home/demo/logs/nested', entries: [] })
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open logs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open nested' }))
    fireEvent.contextMenu(screen.getByRole('button', { name: 'logs' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh' }))
    await screen.findByRole('button', { name: 'Open nested' })
    await act(async () => stale.resolve({ currentPath: '/home/demo/logs/nested', entries: [{ name: 'stale.txt', path: '/home/demo/logs/nested/stale.txt', isDirectory: false }] }))
    fireEvent.click(screen.getByRole('button', { name: 'Open nested' }))
    await screen.findByText(props.t.noRemotePaths)
    expect(screen.queryByRole('button', { name: 'stale.txt' })).not.toBeInTheDocument()
    expect(appClient.listRemoteDirectory).toHaveBeenCalledTimes(5)
  })

  it.each([['name', 'Find by name', '/home/demo'], ['content', 'Find by content', '/home/demo/hello.txt']])('searches a selected file by %s using its proper scope', async (mode, label, path) => {
    vi.mocked(appClient.searchRemoteFiles).mockResolvedValueOnce({ matches: [{ name: 'hello.txt', path: '/home/demo/hello.txt', isDirectory: false, line: 2, preview: 'Hello world' }], scannedEntries: 1, skippedEntries: 0, truncated: false })
    render(<RemoteFilePanel {...props} />)
    fireEvent.contextMenu(await screen.findByRole('button', { name: 'hello.txt' }))
    fireEvent.click(screen.getByRole('menuitem', { name: label }))
    fireEvent.change(screen.getByRole('textbox', { name: props.t.remoteSearchQuery }), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
    const result = await screen.findByRole('button', { name: /\/home\/demo\/hello.txt:2/ })
    expect(appClient.searchRemoteFiles).toHaveBeenCalledWith({ connectionId: 'host-1', path, mode, query: 'hello', showHidden: false })
    fireEvent.click(result)
    await waitFor(() => expect(screen.getByRole('button', { name: 'hello.txt' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('region', { name: label })).not.toBeInTheDocument()
  })

  it('supports keyboard context menus and Escape dismissal', async () => {
    render(<RemoteFilePanel {...props} />)
    fireEvent.keyDown(await screen.findByRole('button', { name: 'logs' }), { key: 'F10', shiftKey: true })
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Refresh' }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Copy path' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps toolbar labels in hover titles and dismisses a menu on outside click', async () => {
    render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'logs' })
    for (const name of ['Up to parent folder', 'Home', 'Refresh', 'Hidden files']) {
      expect(screen.getByRole('button', { name })).toHaveAccessibleName(name)
      expect(screen.queryByText(name)).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('title', 'Home')
    fireEvent.contextMenu(screen.getByRole('button', { name: 'logs' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('ignores a search response after Home returns to the directory tree', async () => {
    const searching = deferred<Awaited<ReturnType<typeof appClient.searchRemoteFiles>>>()
    vi.mocked(appClient.searchRemoteFiles).mockReturnValueOnce(searching.promise)
    render(<RemoteFilePanel {...props} />)
    fireEvent.contextMenu(await screen.findByRole('button', { name: 'logs' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Find by content' }))
    fireEvent.change(screen.getByRole('textbox', { name: props.t.remoteSearchQuery }), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    await screen.findByRole('button', { name: 'logs' })
    await act(async () => searching.resolve({ matches: [{ name: 'late.txt', path: '/late.txt', isDirectory: false }], scannedEntries: 1, skippedEntries: 0, truncated: false }))
    expect(screen.queryByText('/late.txt')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Find by content' })).not.toBeInTheDocument()
  })

  it('confirms uploads, refreshes their target, and preserves the original host while hidden', async () => {
    const picked = deferred<string | null>()
    vi.mocked(appClient.pickTransferLocalPath).mockReturnValueOnce(picked.promise)
    const view = render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'Open logs' })
    chooseUpload('directory')
    view.rerender(<RemoteFilePanel {...props} visible={false} />)
    await act(async () => picked.resolve('C:\\data'))
    expect(appClient.transferFile).not.toHaveBeenCalled()
    expect(screen.getByText(props.t.transferOverwriteWarning)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start Transfer' }))
    await screen.findByText(props.t.transferSuccess)
    expect(appClient.transferFile).toHaveBeenCalledWith({ connectionId: 'host-1', direction: 'upload', localPath: 'C:\\data', remotePath: '/home/demo' })
    expect(appClient.listRemoteDirectory).toHaveBeenCalledTimes(1)
    view.rerender(<RemoteFilePanel {...props} />)
    await waitFor(() => expect(appClient.listRemoteDirectory).toHaveBeenLastCalledWith('host-1', '/home/demo', { browserId: 'session-1', showHidden: false }))
    expect(appClient.closeRemoteBrowser).toHaveBeenCalledWith('session-1')
  })

  it.each([['logs', 'directory', '/home/demo/logs'], ['hello.txt', 'file', '/home/demo/hello.txt']])('downloads %s using the appropriate native picker', async (name, mode, path) => {
    vi.mocked(appClient.pickTransferLocalPath).mockResolvedValueOnce('C:\\downloads')
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name }))
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Transfer' }))
    await screen.findByText(props.t.transferSuccess)
    expect(appClient.pickTransferLocalPath).toHaveBeenCalledWith('download', mode, '', path)
    expect(appClient.transferFile).toHaveBeenCalledWith({ connectionId: 'host-1', direction: 'download', localPath: 'C:\\downloads', remotePath: path })
  })

  it('does nothing on picker cancellation and allows retry after a failed transfer', async () => {
    vi.mocked(appClient.pickTransferLocalPath).mockResolvedValueOnce(null).mockResolvedValueOnce('C:\\upload.txt')
    vi.mocked(appClient.transferFile).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({ message: 'done' })
    render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'Open logs' })
    chooseUpload('file')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Start Transfer' })).not.toBeInTheDocument()
    chooseUpload('file')
    fireEvent.click(await screen.findByRole('button', { name: 'Start Transfer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
    fireEvent.click(screen.getByRole('button', { name: 'Start Transfer' }))
    await screen.findByText(props.t.transferSuccess)
  })

  it('isolates simultaneous panels and releases their browser connections on unmount', async () => {
    const view = render(<><RemoteFilePanel {...props} /><RemoteFilePanel {...props} sessionId="session-2" connectionId="host-2" connectionName="Host Two" /></>)
    await waitFor(() => expect(appClient.listRemoteDirectory).toHaveBeenCalledTimes(2))
    const second = within(screen.getByRole('complementary', { name: 'File Transfer: Host Two' }))
    fireEvent.click(await second.findByRole('button', { name: 'Open logs' }))
    await second.findByRole('button', { name: 'app.log' })
    expect(within(screen.getByRole('complementary', { name: 'File Transfer: Host One' })).queryByRole('button', { name: 'app.log' })).not.toBeInTheDocument()
    view.unmount()
    expect(appClient.closeRemoteBrowser).toHaveBeenCalledWith('session-1')
    expect(appClient.closeRemoteBrowser).toHaveBeenCalledWith('session-2')
  })

  it.each([
    ['logs', 'file', '/home/demo/logs'],
    ['logs', 'directory', '/home/demo/logs'],
    ['hello.txt', 'file', '/home/demo'],
    ['hello.txt', 'directory', '/home/demo'],
  ] as const)('uploads a local %s/%s into the selected directory or containing directory', async (name, mode, remotePath) => {
    vi.mocked(appClient.pickTransferLocalPath).mockResolvedValueOnce('C:\\source')
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name }))
    expect(screen.getByRole('button', { name: 'Upload' })).toHaveAttribute('title', `Upload to ${remotePath}`)
    expect(screen.queryByRole('button', { name: /Upload · Browse/ })).not.toBeInTheDocument()
    chooseUpload(mode)
    await screen.findByRole('button', { name: 'Start Transfer' })
    expect(appClient.pickTransferLocalPath).toHaveBeenCalledWith('upload', mode, '', remotePath)
    expect(screen.queryByRole('menu', { name: 'Upload' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Start Transfer' }))
    await screen.findByText(props.t.transferSuccess)
    expect(appClient.transferFile).toHaveBeenCalledWith({ connectionId: 'host-1', direction: 'upload', localPath: 'C:\\source', remotePath })
  })

  it('supports keyboard upload choices, Escape, outside dismissal and selection changes', async () => {
    render(<RemoteFilePanel {...props} />)
    await screen.findByRole('button', { name: 'logs' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Upload' }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Browse file' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Browse file' }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Browse folder' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Upload' })).toHaveFocus()
    expect(screen.queryByRole('menu', { name: 'Upload' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu', { name: 'Upload' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    fireEvent.click(screen.getByRole('button', { name: 'hello.txt' }))
    expect(screen.queryByRole('menu', { name: 'Upload' })).not.toBeInTheDocument()
    expect(appClient.pickTransferLocalPath).not.toHaveBeenCalled()
  })

  it('copies the complete selected path and resets success feedback after a short delay', async () => {
    const longPath = `/home/demo/${'long-folder-name/'.repeat(15)}report.txt`
    vi.mocked(appClient.listRemoteDirectory).mockResolvedValueOnce({ currentPath: '/home/demo', entries: [{ name: 'report.txt', path: longPath, isDirectory: false }] })
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'report.txt' }))
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Copy path' }))
    await act(async () => {})
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(longPath)
    expect(screen.getByRole('button', { name: 'Copy path' })).toHaveAttribute('title', 'Path copied.')
    act(() => { vi.advanceTimersByTime(1500) })
    expect(screen.getByRole('button', { name: 'Copy path' })).toHaveAttribute('title', 'Copy path')
    expect(screen.queryByText('Path copied.')).not.toBeInTheDocument()
  })

  it('reports clipboard failure without showing copy success', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Clipboard unavailable'))
    render(<RemoteFilePanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'hello.txt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy path' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Clipboard unavailable')
    expect(screen.getByRole('button', { name: 'Copy path' })).toHaveAttribute('title', 'Copy path')
  })
})
