import { useState } from 'react'
import type { ConnectionRecord } from '../lib/types'
import { formatConnectionSubtitle } from '../lib/format'
import { Modal } from './Modal'

type PasswordDialogProps = {
  connection: ConnectionRecord | null
  defaultRememberPassword: boolean
  onCancel: () => void
  onSubmit: (password: string, remember: boolean) => Promise<void>
}

export const PasswordDialog = ({
  connection,
  defaultRememberPassword,
  onCancel,
  onSubmit,
}: PasswordDialogProps) => {
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(defaultRememberPassword)
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!password) {
      setError('Password is required.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await onSubmit(password, remember)
      setPassword('')
    } catch {
      setError('Authentication failed. Check your password and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      description={
        connection
          ? `Enter the password for ${formatConnectionSubtitle(connection)}.`
          : 'Enter the password for the active SSH connection.'
      }
      footer={
        <>
          <button
            type="button"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
            disabled={isSubmitting}
            onClick={() => {
              void handleSubmit()
            }}
          >
            {isSubmitting ? 'Connecting...' : 'Connect'}
          </button>
        </>
      }
      open
      title="Password Required"
    >
      <label className="block text-sm text-slate-200">
        <span className="mb-2 block font-medium">Password</span>
        <input
          autoFocus
          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none transition focus:border-cyan-400"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>

      <label className="flex items-center gap-3 text-sm text-slate-300">
        <input
          checked={remember}
          className="h-4 w-4 accent-cyan-400"
          onChange={(event) => setRemember(event.target.checked)}
          type="checkbox"
        />
        Remember password after successful login
      </label>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
    </Modal>
  )
}
