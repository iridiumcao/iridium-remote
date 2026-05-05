import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionsExportPayload } from '../lib/types'

const invokeMock = vi.fn()
const saveMock = vi.fn()
const createObjectUrlMock = vi.fn(() => 'blob:backup')
const revokeObjectUrlMock = vi.fn()
const appendMock = vi.fn()
const removeMock = vi.fn()
const clickMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
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
  },
  connections: [],
}

describe('appClient.saveExportConnections', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

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
})
