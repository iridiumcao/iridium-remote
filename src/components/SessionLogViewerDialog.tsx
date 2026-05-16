import { useState } from 'react'
import type { getTranslations } from '../lib/i18n'
import { formatStorageBytes } from '../lib/format'
import type {
  AppTheme,
  SessionLogPreview,
  SessionRecordingStatus,
} from '../lib/types'
import { Modal } from './Modal'

type SessionLogViewerDialogProps = {
  open: boolean
  onClose: () => void
  onExport: (paths: string[], password: string) => Promise<boolean>
  onOpenFolder: () => void
  onPickFiles: () => Promise<string[]>
  onPreview: (paths: string[], password: string) => Promise<SessionLogPreview>
  status: SessionRecordingStatus | null
  t: ReturnType<typeof getTranslations>
  theme: AppTheme
}

const fileNameFromPath = (path: string) => {
  const segments = path.split(/[\\/]/)
  return segments.at(-1) ?? path
}

export const SessionLogViewerDialog = ({
  open,
  onClose,
  onExport,
  onOpenFolder,
  onPickFiles,
  onPreview,
  status,
  t,
  theme,
}: SessionLogViewerDialogProps) => {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [password, setPassword] = useState('')
  const [preview, setPreview] = useState<SessionLogPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const isDark = theme === 'dark'
  const selectedFileNames = preview?.files.length
    ? preview.files.map((file) => file.fileName)
    : selectedPaths.map(fileNameFromPath)

  const actionButtonClass = `rounded-lg border px-4 py-2 text-sm transition ${
    isDark
      ? 'border-white/10 text-slate-200 hover:bg-white/5'
      : 'border-slate-200 text-slate-700 hover:bg-slate-100'
  }`
  const sectionClass = `rounded-2xl border p-4 ${
    isDark ? 'border-white/10 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
  }`
  const inputClass = `w-full rounded-xl border px-3 py-2 outline-none transition ${
    isDark
      ? 'border-white/10 bg-slate-950 text-white focus:border-cyan-400'
      : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
  }`

  const validate = () => {
    if (selectedPaths.length === 0) {
      setError(t.noSessionLogsSelected)
      return null
    }

    const normalizedPassword = password.trim()
    if (normalizedPassword.length < 8) {
      setError(t.validationPasswordLength)
      return null
    }

    setError(null)
    return normalizedPassword
  }

  const handlePickFiles = async () => {
    try {
      const paths = await onPickFiles()
      setSelectedPaths(paths)
      setPreview(null)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.noSessionLogsSelected)
    }
  }

  const handlePreview = async () => {
    const normalizedPassword = validate()
    if (!normalizedPassword) {
      return
    }

    setIsWorking(true)
    try {
      const nextPreview = await onPreview(selectedPaths, normalizedPassword)
      setPreview(nextPreview)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.saveFailed)
    } finally {
      setIsWorking(false)
    }
  }

  const handleExport = async () => {
    const normalizedPassword = validate()
    if (!normalizedPassword) {
      return
    }

    setIsWorking(true)
    try {
      const exported = await onExport(selectedPaths, normalizedPassword)
      if (!exported) {
        return
      }
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.saveFailed)
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <Modal
      description={t.sessionLogViewerDescription}
      footer={
        <button
          type="button"
          className={actionButtonClass}
          onClick={onClose}
        >
          {t.close}
        </button>
      }
      open={open}
      theme={theme}
      title={t.sessionLogViewerTitle}
      widthClass="max-w-5xl"
    >
      <div className={sectionClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.sessionRecordingLogDirectory}</p>
            <p className={`mt-1 break-all text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {status?.logDirectory ?? '-'}
            </p>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {t.sessionRecordingCurrentUsage}: {formatStorageBytes(status?.currentStorageBytes ?? 0)}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" className={actionButtonClass} onClick={handlePickFiles}>
              {t.selectSessionLogs}
            </button>
            <button type="button" className={actionButtonClass} onClick={onOpenFolder}>
              {t.openFolder}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className={sectionClass}>
          <p className="text-sm font-medium">{t.selectedSessionLogs}</p>
          {selectedFileNames.length > 0 ? (
            <ul className={`mt-3 space-y-2 text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {selectedFileNames.map((fileName) => (
                <li key={fileName} className="break-all rounded-xl border px-3 py-2">
                  {fileName}
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-3 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {t.noSessionLogsSelected}
            </p>
          )}

          <label className="mt-4 block text-sm">
            <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {t.sessionRecordingPassword}
            </span>
            <input
              className={inputClass}
              onChange={(event) => {
                setPassword(event.target.value)
              }}
              type="password"
              value={password}
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={actionButtonClass}
              disabled={isWorking}
              onClick={() => {
                void handlePreview()
              }}
            >
              {t.decryptSessionLogs}
            </button>
            <button
              type="button"
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
              disabled={isWorking}
              onClick={() => {
                void handleExport()
              }}
            >
              {t.exportSessionLogs}
            </button>
          </div>
        </div>

        <div className={sectionClass}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{t.sessionLogsPreview}</p>
            {preview?.truncated ? (
              <span className={`text-xs ${isDark ? 'text-amber-200' : 'text-amber-700'}`}>
                {t.sessionLogsPreviewTruncated}
              </span>
            ) : null}
          </div>
          <textarea
            className={`themed-scrollbar mt-3 h-[420px] w-full rounded-xl border px-3 py-2 font-mono text-sm outline-none ${
              isDark
                ? 'border-white/10 bg-slate-950 text-slate-100 themed-scrollbar-dark'
                : 'border-slate-200 bg-white text-slate-900 themed-scrollbar-light'
            }`}
            readOnly
            value={preview?.previewText ?? ''}
          />
        </div>
      </div>

      {error ? (
        <p
          className={`rounded-xl border px-3 py-2 text-sm ${
            isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
