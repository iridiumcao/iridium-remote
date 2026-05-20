import { useEffect, useMemo, useState } from 'react'
import { appClient } from '../api/client'
import type { getTranslations } from '../lib/i18n'
import type { AppTheme, RemotePathEntry } from '../lib/types'
import { Modal } from './Modal'

type RemotePathPickerDialogProps = {
  connectionId: string
  connectionName: string
  onClose: () => void
  onSelect: (path: string) => void
  open: boolean
  remotePath: string
  t: ReturnType<typeof getTranslations>
  theme: AppTheme
}

const getParentRemotePath = (path: string) => {
  if (path === '/') {
    return null
  }

  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 1) {
    return '/'
  }

  return `/${parts.slice(0, -1).join('/')}`
}

const getInitialRemoteBrowserPath = (remotePath: string) => {
  const trimmed = remotePath.trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed.endsWith('/')) {
    return trimmed
  }

  const parts = trimmed.split('/').filter(Boolean)
  if (parts.length <= 1) {
    return '/'
  }

  return `/${parts.slice(0, -1).join('/')}`
}

export const RemotePathPickerDialog = ({
  connectionId,
  connectionName,
  onClose,
  onSelect,
  open,
  remotePath,
  t,
  theme,
}: RemotePathPickerDialogProps) => {
  const isDark = theme === 'dark'
  const [currentPath, setCurrentPath] = useState(() => getInitialRemoteBrowserPath(remotePath))
  const [entries, setEntries] = useState<RemotePathEntry[]>([])
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    let active = true

    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const listing = await appClient.listRemoteDirectory(connectionId, currentPath)
        if (!active) {
          return
        }

        setCurrentPath(listing.currentPath)
        setEntries(listing.entries)
      } catch (cause) {
        if (!active) {
          return
        }

        const normalized = appClient.normalizeError(cause)
        setError(normalized.message)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [connectionId, currentPath, open])

  const parentPath = useMemo(() => getParentRemotePath(currentPath), [currentPath])

  const rowClass = `flex w-full items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left transition ${
    isDark
      ? 'border-white/10 bg-slate-950/60 text-slate-100 hover:bg-white/5'
      : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
  }`

  return (
    <Modal
      description={`${connectionName}. ${t.remoteBrowserDescription}`}
      footer={
        <>
          <button
            type="button"
            className={`rounded-sm border px-4 py-2 text-sm transition ${
              isDark
                ? 'border-white/10 text-slate-300 hover:bg-white/5'
                : 'border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            onClick={onClose}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            className="rounded-sm bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            onClick={() => {
              onSelect(currentPath)
              onClose()
            }}
          >
            {t.selectCurrentFolder}
          </button>
        </>
      }
      open={open}
      theme={theme}
      title={t.remoteBrowserTitle}
    >
      <div className="space-y-3">
        <div
          className={`rounded-sm border px-3 py-2 text-sm ${
            isDark ? 'border-white/10 bg-slate-950/60 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          {currentPath}
        </div>

        {parentPath ? (
          <button
            type="button"
            className={rowClass}
            onClick={() => {
              setCurrentPath(parentPath)
            }}
          >
            <span>{t.parentFolder}</span>
          </button>
        ) : null}

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {isLoading ? (
            <div className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {t.loadingRemotePaths}
            </div>
          ) : null}

          {!isLoading && entries.length === 0 ? (
            <div className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {t.noRemotePaths}
            </div>
          ) : null}

          {!isLoading
            ? entries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className={rowClass}
                  onClick={() => {
                    if (entry.isDirectory) {
                      setCurrentPath(entry.path)
                      return
                    }

                    onSelect(entry.path)
                    onClose()
                  }}
                >
                  <span className="truncate">
                    {entry.isDirectory ? `${entry.name}/` : entry.name}
                  </span>
                  <span className={`shrink-0 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {entry.isDirectory ? t.openFolder : t.select}
                  </span>
                </button>
              ))
            : null}
        </div>

        {error ? (
          <div
            className={`rounded-sm border px-3 py-2 text-sm ${
              isDark
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
