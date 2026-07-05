import { useState } from 'react'
import type { getTranslations } from '../lib/i18n'
import type { AppTheme } from '../lib/types'
import { Modal } from './Modal'

type SessionRecordingUnlockDialogProps = {
  open: boolean
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
  isSubmitting: boolean
  error: string | null
  onClose: () => void
  onClearError: () => void
  onPause: () => Promise<void>
  onResetPassword: (password: string) => Promise<void>
  onVerify: (password: string) => Promise<void>
}

type FlowMode = 'verify' | 'reset'

export const SessionRecordingUnlockDialog = ({
  open,
  theme,
  t,
  isSubmitting,
  error,
  onClose,
  onClearError,
  onPause,
  onResetPassword,
  onVerify,
}: SessionRecordingUnlockDialogProps) => {
  const [flow, setFlow] = useState<FlowMode>('verify')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const isDark = theme === 'dark'

  const inputClass = `w-full rounded-xl border px-3 py-2 outline-none transition ${
    isDark
      ? 'border-white/10 bg-slate-950 text-white focus:border-cyan-400'
      : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
  }`

  const sectionClass = `rounded-2xl border p-4 ${
    isDark ? 'border-white/10 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
  }`

  const message = localError ?? error

  const handleVerify = async () => {
    if (password.trim().length < 8) {
      setLocalError(t.validationPasswordLength)
      return
    }

    setLocalError(null)
    await onVerify(password)
  }

  const handleResetPassword = async () => {
    const normalizedPassword = password.trim()
    const normalizedConfirmPassword = confirmPassword.trim()
    if (normalizedPassword.length < 8) {
      setLocalError(t.validationPasswordLength)
      return
    }

    if (normalizedPassword !== normalizedConfirmPassword) {
      setLocalError(t.validationPasswordConfirm)
      return
    }

    setLocalError(null)
    await onResetPassword(normalizedPassword)
  }

  return (
    <Modal
      onClose={onClose}
      bodyClassName="space-y-4"
      description={
        flow === 'verify' ? t.sessionRecordingUnlockDescription : t.sessionRecordingResetDescription
      }
      footer={
        flow === 'verify' ? (
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
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                isDark
                  ? 'border-white/10 text-slate-300 hover:bg-white/5'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              disabled={isSubmitting}
              onClick={() => {
                void onPause()
              }}
            >
              {t.sessionRecordingUnlockPause}
            </button>
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                isDark
                  ? 'border-white/10 text-slate-300 hover:bg-white/5'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              disabled={isSubmitting}
              onClick={() => {
                setFlow('reset')
                setPassword('')
                setConfirmPassword('')
                setLocalError(null)
                onClearError()
              }}
            >
              {t.sessionRecordingUnlockReset}
            </button>
            <button
              type="button"
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
              disabled={isSubmitting}
              onClick={() => {
                void handleVerify()
              }}
            >
              {isSubmitting ? t.saving : t.sessionRecordingUnlockContinue}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                isDark
                  ? 'border-white/10 text-slate-300 hover:bg-white/5'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              disabled={isSubmitting}
              onClick={() => {
                setFlow('verify')
                setPassword('')
                setConfirmPassword('')
                setLocalError(null)
                onClearError()
              }}
            >
              {t.back}
            </button>
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
                void handleResetPassword()
              }}
            >
              {isSubmitting ? t.saving : t.sessionRecordingResetSubmit}
            </button>
          </>
        )
      }
      open={open}
      theme={theme}
      title={flow === 'verify' ? t.sessionRecordingUnlockTitle : t.sessionRecordingResetTitle}
      widthClass="max-w-lg"
    >
      <div className={sectionClass}>
        <label className="block text-sm">
          <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            {t.sessionRecordingPassword}
          </span>
          <input
            autoFocus
            className={inputClass}
            onChange={(event) => {
              setPassword(event.target.value)
              setLocalError(null)
              onClearError()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (flow === 'verify') void handleVerify()
                else if (flow === 'reset') void handleResetPassword()
              }
            }}
            type="password"
            value={password}
          />
        </label>

        {flow === 'reset' ? (
          <>
            <label className="mt-4 block text-sm">
              <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t.confirmSessionRecordingPassword}
              </span>
              <input
                className={inputClass}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  setLocalError(null)
                  onClearError()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleResetPassword()
                  }
                }}
                type="password"
                value={confirmPassword}
              />
            </label>
            <p
              className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                isDark
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {t.sessionRecordingResetWarning}
            </p>
          </>
        ) : null}
      </div>

      {message ? (
        <p
          className={`rounded-xl border px-3 py-2 text-sm ${
            isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {message}
        </p>
      ) : null}
    </Modal>
  )
}
