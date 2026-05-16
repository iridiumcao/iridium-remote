import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionsExportPayload } from '../lib/types'

const invokeMock = vi.fn()
const openMock = vi.fn()
const saveMock = vi.fn()
const createObjectUrlMock = vi.fn(() => 'blob:backup')
const revokeObjectUrlMock = vi.fn()
const appendMock = vi.fn()
const removeMock = vi.fn()
const clickMock = vi.fn()
const fetchMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
  save: saveMock,
}))

const payload: ConnectionsExportPayload = {
  version: 1,
  exportedAt: '2026-05-05T01:02:03.456Z',
  settings: {
    locale: 'en',
    theme: 'dark',
    connectionListDisplayMode: 'normal',
    collapsedGroups: [],
    connectionHistoryTimeZone: 'UTC',
    sessionRecording: {
      enabled: false,
      mode: 'input_only',
      maxFileSizeMb: 100,
      maxTotalStorageGb: 5,
      retentionDays: 30,
    },
  },
  connections: [],
}

describe('appClient.saveExportConnections', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)

    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectUrlMock,
      configurable: true,
    })

    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectUrlMock,
      configurable: true,
    })

    document.body.append = appendMock

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'a') {
        throw new Error(`Unexpected element request: ${tagName}`)
      }

      return {
        click: clickMock,
        remove: removeMock,
        href: '',
        download: '',
      } as unknown as HTMLAnchorElement
    })
  })

  afterEach(() => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads the export in browser mode', async () => {
    const { appClient } = await import('./client')

    const saved = await appClient.saveExportConnections(payload)

    expect(saved).toBe(true)
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1)
    expect(appendMock).toHaveBeenCalledTimes(1)
    expect(clickMock).toHaveBeenCalledTimes(1)
    expect(removeMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:backup')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('writes the export to the user-selected Tauri path', async () => {
    ;(window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    saveMock.mockResolvedValueOnce('C:\\Users\\iridi\\Desktop\\custom-backup.json')
    const { appClient } = await import('./client')

    const saved = await appClient.saveExportConnections(payload)

    expect(saved).toBe(true)
    expect(saveMock).toHaveBeenCalledWith({
      defaultPath: 'iridium-remote-backup-2026-05-05T01-02-03-456Z.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    expect(invokeMock).toHaveBeenCalledWith('write_export_file', {
      path: 'C:\\Users\\iridi\\Desktop\\custom-backup.json',
      payload,
    })
  })

  it('treats a cancelled Tauri save dialog as a no-op', async () => {
    ;(window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    saveMock.mockResolvedValueOnce(null)
    const { appClient } = await import('./client')

    const saved = await appClient.saveExportConnections(payload)

    expect(saved).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('opens a native file picker for upload local paths', async () => {
    ;(window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    openMock.mockResolvedValueOnce('C:\\Users\\iridi\\Desktop\\upload.txt')
    const { appClient } = await import('./client')

    const selected = await appClient.pickTransferLocalPath('upload', 'file', '', '/remote/upload.txt')

    expect(selected).toBe('C:\\Users\\iridi\\Desktop\\upload.txt')
    expect(openMock).toHaveBeenCalledWith({
      directory: false,
      multiple: false,
    })
  })

  it('opens a native save picker for download local paths', async () => {
    ;(window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    saveMock.mockResolvedValueOnce('C:\\Users\\iridi\\Desktop\\download.txt')
    const { appClient } = await import('./client')

    const selected = await appClient.pickTransferLocalPath('download', 'file', '', '/remote/download.txt')

    expect(selected).toBe('C:\\Users\\iridi\\Desktop\\download.txt')
    expect(saveMock).toHaveBeenCalledWith({
      defaultPath: 'download.txt',
    })
  })

  it('opens a native directory picker for folder selections', async () => {
    ;(window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    openMock.mockResolvedValueOnce('C:\\Users\\iridi\\Desktop\\Downloads')
    const { appClient } = await import('./client')

    const selected = await appClient.pickTransferLocalPath(
      'download',
      'directory',
      '',
      '/remote/folder',
    )

    expect(selected).toBe('C:\\Users\\iridi\\Desktop\\Downloads')
    expect(openMock).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      defaultPath: undefined,
    })
  })

  it('returns mock remote directory listings outside Tauri', async () => {
    const { appClient } = await import('./client')

    const listing = await appClient.listRemoteDirectory('connection-1', '/home')

    expect(listing.currentPath).toBe('/home')
    expect(listing.entries).toEqual([
      { name: 'demo', path: '/home/demo', isDirectory: true },
      { name: 'notes.txt', path: '/home/notes.txt', isDirectory: false },
    ])
  })

  it('hides dot-prefixed remote entries in browser mode', async () => {
    const { appClient } = await import('./client')

    const listing = await appClient.listRemoteDirectory('connection-1', '/')

    expect(listing.entries).toEqual([
      { name: 'home', path: '/home', isDirectory: true },
      { name: 'var', path: '/var', isDirectory: true },
      { name: 'README.txt', path: '/README.txt', isDirectory: false },
    ])
  })

  it('reports when the current version is already up to date', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: 'v0.1.3',
        html_url: 'https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.3',
      }),
    })

    const { appClient } = await import('./client')
    const result = await appClient.checkForUpdates()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/iridiumcao/iridium-remote/releases/latest',
      {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      },
    )
    expect(result).toEqual({
      currentVersion: '0.1.3',
      latestVersion: '0.1.3',
      updateAvailable: false,
      downloadUrl: 'https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.3',
    })
  })

  it('reports when a newer GitHub release is available', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: 'v0.1.4',
        html_url: 'https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.4',
      }),
    })

    const { appClient } = await import('./client')
    const result = await appClient.checkForUpdates()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/iridiumcao/iridium-remote/releases/latest',
      {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      },
    )
    expect(result).toEqual({
      currentVersion: '0.1.3',
      latestVersion: '0.1.4',
      updateAvailable: true,
      downloadUrl: 'https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.4',
    })
  })

  it('uses the Tauri backend update command inside the desktop runtime', async () => {
    ;(window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    invokeMock.mockResolvedValueOnce({
      currentVersion: '0.1.3',
      latestVersion: '0.1.4',
      updateAvailable: true,
      downloadUrl: 'https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.4',
    })

    const { appClient } = await import('./client')
    const result = await appClient.checkForUpdates()

    expect(invokeMock).toHaveBeenCalledWith('check_for_updates')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      currentVersion: '0.1.3',
      latestVersion: '0.1.4',
      updateAvailable: true,
      downloadUrl: 'https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.4',
    })
  })

  it('reports when an older GitHub release does not trigger an update', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: 'v0.1.1',
        html_url: 'https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.1',
      }),
    })

    const { appClient } = await import('./client')
    const result = await appClient.checkForUpdates()

    expect(result).toEqual({
      currentVersion: '0.1.3',
      latestVersion: '0.1.1',
      updateAvailable: false,
      downloadUrl: 'https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.1',
    })
  })
})

describe('appClient group normalization', () => {
  afterEach(() => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stores created groups in title case in browser mode', async () => {
    const { appClient } = await import('./client')

    const created = await appClient.createConnection({
      name: 'Home Lab',
      groupName: 'hOME',
      host: '192.168.1.10',
      port: 22,
      username: 'tester',
    })

    expect(created.groupName).toBe('Home')
  })

  it('skips imported duplicates when the group only differs by case', async () => {
    const { appClient } = await import('./client')

    await appClient.createConnection({
      name: 'Home Lab',
      groupName: 'home',
      host: '192.168.1.10',
      port: 22,
      username: 'tester',
    })

    const result = await appClient.importConnections({
      version: 1,
      exportedAt: '2026-05-05T01:02:03.456Z',
      connections: [
        {
          name: 'Home Lab',
          groupName: 'Home',
          host: '192.168.1.10',
          port: 22,
          username: 'tester',
        },
      ],
    })

    expect(result).toEqual({
      imported: 0,
      skipped: 1,
      settingsApplied: false,
    })
  })
})
