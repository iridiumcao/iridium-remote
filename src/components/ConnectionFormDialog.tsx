import { useMemo, useState } from 'react'
import type { getTranslations } from '../lib/i18n'
import type {
  AppTheme,
  ConnectionFormSeed,
  ConnectionRecord,
  CreateConnectionInput,
  UpdateConnectionInput,
} from '../lib/types'
import { Modal } from './Modal'

type ConnectionFormDialogProps = {
  connection: ConnectionRecord | null
  initialValues?: ConnectionFormSeed | null
  onClose: () => void
  onSave: (input: CreateConnectionInput | UpdateConnectionInput) => Promise<void>
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

type FormState = {
  name: string
  groupName: string
  host: string
  port: string
  username: string
  password: string
  clearSavedPassword: boolean
}

const emptyForm: FormState = {
  name: '',
  groupName: '',
  host: '',
  port: '22',
  username: '',
  password: '',
  clearSavedPassword: false,
}

export const ConnectionFormDialog = ({
  connection,
  initialValues,
  onClose,
  onSave,
  theme,
  t,
}: ConnectionFormDialogProps) => {
  const seed = connection
    ? {
        name: connection.name,
        groupName: connection.groupName ?? '',
        host: connection.host,
        port: connection.port,
        username: connection.username,
      }
    : initialValues

  const [formState, setFormState] = useState<FormState>(
    seed
      ? {
          name: seed.name,
          groupName: seed.groupName ?? '',
          host: seed.host,
          port: String(seed.port),
          username: seed.username,
          password: '',
          clearSavedPassword: false,
        }
      : emptyForm,
  )
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDark = theme === 'dark'

  const title = useMemo(() => {
    if (connection) {
      return t.editConnectionTitle(connection.name)
    }

    if (initialValues) {
      return t.copyConnectionTitle(initialValues.name)
    }

    return t.createConnectionTitle
  }, [connection, initialValues, t])

  const inputClass = `w-full rounded-xl border px-3 py-2 outline-none transition ${
    isDark
      ? 'border-white/10 bg-slate-950 text-white focus:border-cyan-400'
      : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
  }`

  const handleChange = (field: keyof FormState, value: string | boolean) => {
    setFormState((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async () => {
    const name = formState.name.trim()
    const groupName = formState.groupName.trim()
    const host = formState.host.trim()
    const username = formState.username.trim()
    const password = formState.password.trim()
    const port = Number(formState.port)

    if (!name || !host || !username) {
      setError(t.validationRequired)
      return
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError(t.validationPort)
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (connection) {
        await onSave({
          id: connection.id,
          name,
          groupName: groupName || null,
          host,
          port,
          username,
          password: password || undefined,
          clearSavedPassword: !password && formState.clearSavedPassword,
        })
      } else {
        await onSave({
          name,
          groupName: groupName || null,
          host,
          port,
          username,
          password: password || undefined,
        })
      }
    } catch {
      setError(t.saveFailed)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      description={t.passwordOptionalHint}
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
              void handleSubmit()
            }}
          >
            {isSaving ? t.saving : t.save}
          </button>
        </>
      }
      open
      theme={theme}
      title={title}
    >
      <label className="block text-sm">
        <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          {t.name}
        </span>
        <input
          className={inputClass}
          onChange={(event) => handleChange('name', event.target.value)}
          value={formState.name}
        />
      </label>

      <label className="block text-sm">
        <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          {t.group}
        </span>
        <input
          className={inputClass}
          onChange={(event) => handleChange('groupName', event.target.value)}
          value={formState.groupName}
        />
      </label>

      <label className="block text-sm">
        <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          {t.host}
        </span>
        <input
          className={inputClass}
          onChange={(event) => handleChange('host', event.target.value)}
          value={formState.host}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            {t.port}
          </span>
          <input
            className={inputClass}
            onChange={(event) => handleChange('port', event.target.value)}
            value={formState.port}
          />
        </label>

        <label className="block text-sm">
          <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            {t.username}
          </span>
          <input
            className={inputClass}
            onChange={(event) => handleChange('username', event.target.value)}
            value={formState.username}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          {t.passwordOptional}
        </span>
        <input
          className={inputClass}
          onChange={(event) => handleChange('password', event.target.value)}
          type="password"
          value={formState.password}
        />
        <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {connection?.hasPassword ? t.savedPasswordKeepHint : t.passwordOptionalHint}
        </p>
      </label>

      {connection?.hasPassword ? (
        <label
          className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
            isDark
              ? 'border-white/10 bg-slate-950/70 text-slate-300'
              : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          <input
            checked={formState.clearSavedPassword}
            onChange={(event) => handleChange('clearSavedPassword', event.target.checked)}
            type="checkbox"
          />
          <span>{t.removeSavedPassword}</span>
        </label>
      ) : null}

      {connection?.hasPassword ? (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            isDark
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {t.savedPasswordStored}
        </div>
      ) : null}

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
