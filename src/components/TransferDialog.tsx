import { useState } from 'react'
import type { getTranslations } from '../lib/i18n'
import type { AppTheme, FileTransferDirection, FileTransferInput } from '../lib/types'
import { Modal } from './Modal'

type TransferDialogProps = {
  connectionName: string
  open: boolean
  onClose: () => void
  onTransfer: (input: Omit<FileTransferInput, 'connectionId'>) => Promise<void>
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

export const TransferDialog = ({
  connectionName,
  onClose,
  onTransfer,
  open,
  theme,
  t,
}: TransferDialogProps) => {
  const isDark = theme === 'dark'
  const [direction, setDirection] = useState<FileTransferDirection>('upload')
  const [localPath, setLocalPath] = useState('')
  const [remotePath, setRemotePath] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputClass = `w-full rounded-xl border px-3 py-2 outline-none transition ${
    isDark
      ? 'border-white/10 bg-slate-950 text-white focus:border-cyan-400'
      : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
  }`

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      await onTransfer({
        direction,
        localPath,
        remotePath,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.transferDescription)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      description={`${connectionName}. ${t.transferDescription}`}
      footer={
        <>
          <button
            type="button"
            className={`rounded-lg border px-4 py-2 text-sm transition ${
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
            className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
            disabled={isSubmitting}
            onClick={() => {
              void handleSubmit()
            }}
          >
            {isSubmitting ? t.saving : t.startTransfer}
          </button>
        </>
      }
      open={open}
      theme={theme}
      title={t.fileTransfer}
    >
      <div className="grid grid-cols-2 gap-3">
        {(['upload', 'download'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              direction === value
                ? 'border-cyan-400 bg-cyan-400/10 text-cyan-500'
                : isDark
                  ? 'border-white/10 text-slate-200 hover:bg-white/5'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            onClick={() => setDirection(value)}
          >
            {value === 'upload' ? t.upload : t.download}
          </button>
        ))}
      </div>

      <label className="block text-sm">
        <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          {t.localPath}
        </span>
        <input className={inputClass} onChange={(event) => setLocalPath(event.target.value)} value={localPath} />
      </label>

      <label className="block text-sm">
        <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          {t.remotePath}
        </span>
        <input
          className={inputClass}
          onChange={(event) => setRemotePath(event.target.value)}
          value={remotePath}
        />
      </label>

      {error ? (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            isDark
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {error}
        </div>
      ) : null}
    </Modal>
  )
}
