import { useEffect, useId, useRef, useState } from 'react'
import type { getTranslations } from '../lib/i18n'
import type { AppTheme } from '../lib/types'
import { Modal } from './Modal'

type SessionRecordingUnlockDialogProps = {
  open: boolean
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
  isSubmitting: boolean
  error: string | null
  onClearError: () => void
  onPause: () => Promise<void>
  onVerify: (password: string) => Promise<void>
}

export const SessionRecordingUnlockDialog = ({
  open, theme, t, isSubmitting, error, onClearError, onPause, onVerify,
}: SessionRecordingUnlockDialogProps) => {
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [isSkipTooltipOpen, setSkipTooltipOpen] = useState(false)
  const skipTooltipId = useId()
  const skipTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSkipFocused = useRef(false)
  const isDark = theme === 'dark'
  const message = localError ?? error

  useEffect(() => () => {
    if (skipTooltipTimer.current !== null) clearTimeout(skipTooltipTimer.current)
  }, [])

  const clearSkipTooltipTimer = () => {
    if (skipTooltipTimer.current !== null) {
      clearTimeout(skipTooltipTimer.current)
      skipTooltipTimer.current = null
    }
  }

  const hideSkipTooltip = () => {
    clearSkipTooltipTimer()
    setSkipTooltipOpen(false)
  }

  const handleVerify = async () => {
    if (isSubmitting) return
    if (password.trim().length < 8) {
      setLocalError(t.validationPasswordLength)
      return
    }
    setLocalError(null)
    await onVerify(password)
  }

  return (
    <Modal
      bodyClassName="space-y-4"
      description={t.sessionRecordingUnlockDescription}
      footer={
        <>
          <span
            className="relative inline-flex"
            onMouseEnter={() => {
              if (isSubmitting) return
              clearSkipTooltipTimer()
              skipTooltipTimer.current = setTimeout(() => setSkipTooltipOpen(true), 300)
            }}
            onMouseLeave={() => {
              clearSkipTooltipTimer()
              if (!isSkipFocused.current) setSkipTooltipOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                hideSkipTooltip()
              }
            }}
          >
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                isDark
                  ? 'border-white/10 text-slate-300 hover:bg-white/5'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              disabled={isSubmitting}
              aria-describedby={skipTooltipId}
              onFocus={() => {
                isSkipFocused.current = true
                clearSkipTooltipTimer()
                setSkipTooltipOpen(true)
              }}
              onBlur={() => {
                isSkipFocused.current = false
                hideSkipTooltip()
              }}
              onClick={() => {
                hideSkipTooltip()
                void onPause()
              }}
            >
              {t.sessionRecordingUnlockPause}
            </button>
            <span
              id={skipTooltipId}
              role="tooltip"
              hidden={!isSkipTooltipOpen || isSubmitting}
              className="absolute bottom-full left-1/2 z-10 w-72 max-w-[calc(100vw-6rem)] -translate-x-1/2 pb-2"
            >
              <span className={`block whitespace-pre-line rounded-lg border px-3 py-2.5 text-left text-xs leading-relaxed shadow-lg ${
                isDark
                  ? 'border-white/10 bg-slate-800 text-slate-200 shadow-black/25'
                  : 'border-slate-200 bg-white text-slate-700 shadow-slate-900/10'
              }`}>
                {t.sessionRecordingSkipHint}
              </span>
            </span>
          </span>
          <button
            type="button"
            className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            onClick={() => { void handleVerify() }}
          >
            {t.sessionRecordingUnlockContinue}
          </button>
        </>
      }
      open={open}
      theme={theme}
      title={t.sessionRecordingUnlockTitle}
      widthClass="max-w-lg"
    >
      <label className="block text-sm">
        <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          {t.sessionRecordingPassword}
        </span>
        <input
          autoFocus
          disabled={isSubmitting}
          className={`w-full rounded-xl border px-3 py-2 outline-none transition ${
            isDark
              ? 'border-white/10 bg-slate-950 text-white focus:border-cyan-400'
              : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
          }`}
          onChange={(event) => {
            setPassword(event.target.value)
            setLocalError(null)
            onClearError()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleVerify()
            }
          }}
          type="password"
          value={password}
        />
      </label>
      {message ? (
        <p role="alert" className={`rounded-xl border px-3 py-2 text-sm ${
          isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}>
          {message}
        </p>
      ) : null}
    </Modal>
  )
}
