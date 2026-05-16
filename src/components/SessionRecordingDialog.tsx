import { useState } from 'react'
import type { getTranslations } from '../lib/i18n'
import { formatStorageBytes } from '../lib/format'
import type {
  AppTheme,
  SessionRecordingSettings,
  SessionRecordingStatus,
} from '../lib/types'
import { Modal } from './Modal'

type SessionRecordingDialogProps = {
  open: boolean
  onClose: () => void
  onOpenFolder: () => void
  onSave: (settings: SessionRecordingSettings, password?: string) => Promise<void>
  settings: SessionRecordingSettings
  status: SessionRecordingStatus | null
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

type FormState = {
  enabled: boolean
  mode: SessionRecordingSettings['mode']
  maxFileSizeMb: string
  maxTotalStorageGb: string
  retentionDays: string
  password: string
  confirmPassword: string
}

export const SessionRecordingDialog = ({
  open,
  onClose,
  onOpenFolder,
  onSave,
  settings,
  status,
  theme,
  t,
}: SessionRecordingDialogProps) => {
  const buildFormState = (): FormState => ({
    enabled: settings.enabled,
    mode: settings.mode,
    maxFileSizeMb: String(settings.maxFileSizeMb),
    maxTotalStorageGb: String(settings.maxTotalStorageGb),
    retentionDays: String(settings.retentionDays),
    password: '',
    confirmPassword: '',
  })
  const [formState, setFormState] = useState<FormState>({
    ...buildFormState(),
  })
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isDark = theme === 'dark'

  const inputClass = `w-full rounded-xl border px-3 py-2 outline-none transition ${
    isDark
      ? 'border-white/10 bg-slate-950 text-white focus:border-cyan-400'
      : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
  }`

  const helperClass = `text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`
  const sectionClass = `rounded-2xl border p-4 ${
    isDark ? 'border-white/10 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
  }`

  const handleSave = async () => {
    const maxFileSizeMb = Number(formState.maxFileSizeMb)
    const maxTotalStorageGb = Number(formState.maxTotalStorageGb)
    const retentionDays = Number(formState.retentionDays)
    const password = formState.password.trim()
    const confirmPassword = formState.confirmPassword.trim()

    if (
      !Number.isInteger(maxFileSizeMb) ||
      !Number.isInteger(maxTotalStorageGb) ||
      !Number.isInteger(retentionDays) ||
      maxFileSizeMb < 1 ||
      maxTotalStorageGb < 1 ||
      retentionDays < 1
    ) {
      setError(t.validationPositiveNumber)
      return
    }

    if (password && password.length < 8) {
      setError(t.validationPasswordLength)
      return
    }

    if (password !== confirmPassword) {
      setError(t.validationPasswordConfirm)
      return
    }

    if (formState.enabled && !password && !status?.passwordLoaded) {
      setError(t.validationPasswordLength)
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await onSave(
        {
          enabled: formState.enabled,
          mode: formState.mode,
          maxFileSizeMb,
          maxTotalStorageGb,
          retentionDays,
        },
        password || undefined,
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t.saveFailed
      setError(message)
      setIsSaving(false)
      return
    }
  }

  return (
    <Modal
      description={t.sessionRecordingDescription}
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
            disabled={isSaving}
            onClick={() => {
              void handleSave()
            }}
          >
            {isSaving ? t.saving : t.save}
          </button>
        </>
      }
      open={open}
      theme={theme}
      title={t.sessionRecordingTitle}
      widthClass="max-w-3xl"
    >
      <div className={sectionClass}>
        <label className="flex items-start gap-3">
          <input
            checked={formState.enabled}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
            onChange={(event) => {
              setFormState((current) => ({ ...current, enabled: event.target.checked }))
            }}
            type="checkbox"
          />
          <div>
            <div className="font-medium">{t.enableSessionRecording}</div>
            <p className={helperClass}>{t.sessionRecordingPasswordHint}</p>
          </div>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={sectionClass}>
          <p className="mb-3 text-sm font-medium">{t.sessionRecordingMode}</p>
          <label className="flex items-start gap-3 text-sm">
            <input
              checked={formState.mode === 'input_only'}
              className="mt-1"
              name="recording-mode"
              onChange={() => {
                setFormState((current) => ({ ...current, mode: 'input_only' }))
              }}
              type="radio"
            />
            <span>{t.inputOnlyRecording}</span>
          </label>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input
              checked={formState.mode === 'full'}
              className="mt-1"
              name="recording-mode"
              onChange={() => {
                setFormState((current) => ({ ...current, mode: 'full' }))
              }}
              type="radio"
            />
            <span>{t.fullSessionRecording}</span>
          </label>

          {formState.mode === 'full' ? (
            <p
              className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                isDark
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {t.sessionRecordingWarning}
            </p>
          ) : null}
        </div>

        <div className={sectionClass}>
          <p className="mb-3 text-sm font-medium">{t.sessionRecordingPassword}</p>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t.sessionRecordingPassword}
              </span>
              <input
                className={inputClass}
                onChange={(event) => {
                  setFormState((current) => ({ ...current, password: event.target.value }))
                }}
                type="password"
                value={formState.password}
              />
            </label>

            <label className="block text-sm">
              <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t.confirmSessionRecordingPassword}
              </span>
              <input
                className={inputClass}
                onChange={(event) => {
                  setFormState((current) => ({ ...current, confirmPassword: event.target.value }))
                }}
                type="password"
                value={formState.confirmPassword}
              />
            </label>

            <p className={helperClass}>
              {status?.passwordLoaded
                ? t.sessionRecordingPasswordLoaded
                : t.sessionRecordingPasswordMissing}
            </p>
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <p className="mb-3 text-sm font-medium">{t.sessionRecordingStorage}</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block text-sm">
            <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {t.sessionRecordingMaxFileSize}
            </span>
            <input
              className={inputClass}
              inputMode="numeric"
              onChange={(event) => {
                setFormState((current) => ({ ...current, maxFileSizeMb: event.target.value }))
              }}
              value={formState.maxFileSizeMb}
            />
          </label>

          <label className="block text-sm">
            <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {t.sessionRecordingMaxTotalStorage}
            </span>
            <input
              className={inputClass}
              inputMode="numeric"
              onChange={(event) => {
                setFormState((current) => ({ ...current, maxTotalStorageGb: event.target.value }))
              }}
              value={formState.maxTotalStorageGb}
            />
          </label>

          <label className="block text-sm">
            <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {t.sessionRecordingRetentionDays}
            </span>
            <input
              className={inputClass}
              inputMode="numeric"
              onChange={(event) => {
                setFormState((current) => ({ ...current, retentionDays: event.target.value }))
              }}
              value={formState.retentionDays}
            />
          </label>
        </div>
      </div>

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

          <button
            type="button"
            className={`rounded-lg border px-4 py-2 text-sm transition ${
              isDark
                ? 'border-white/10 text-slate-200 hover:bg-white/5'
                : 'border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            onClick={onOpenFolder}
          >
            {t.openFolder}
          </button>
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
