import { useMemo, useState } from 'react'
import type {
  ConnectionRecord,
  CreateConnectionInput,
  UpdateConnectionInput,
} from '../lib/types'
import { Modal } from './Modal'

type ConnectionFormDialogProps = {
  connection: ConnectionRecord | null
  onClose: () => void
  onSave: (input: CreateConnectionInput | UpdateConnectionInput) => Promise<void>
}

type FormState = {
  name: string
  host: string
  port: string
  username: string
}

const emptyForm: FormState = {
  name: '',
  host: '',
  port: '22',
  username: '',
}

export const ConnectionFormDialog = ({
  connection,
  onClose,
  onSave,
}: ConnectionFormDialogProps) => {
  const [formState, setFormState] = useState<FormState>(
    connection
      ? {
          name: connection.name,
          host: connection.host,
          port: String(connection.port),
          username: connection.username,
        }
      : emptyForm,
  )
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const title = useMemo(
    () => (connection ? `Edit ${connection.name}` : 'Create Connection'),
    [connection],
  )

  const handleChange = (field: keyof FormState, value: string) => {
    setFormState((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async () => {
    const name = formState.name.trim()
    const host = formState.host.trim()
    const username = formState.username.trim()
    const port = Number(formState.port)

    if (!name || !host || !username) {
      setError('Name, host, and username are required.')
      return
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError('Port must be a valid TCP port.')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (connection) {
        await onSave({
          id: connection.id,
          name,
          host,
          port,
          username,
        })
      } else {
        await onSave({
          name,
          host,
          port,
          username,
        })
      }
    } catch {
      setError('Unable to save the connection.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      description="Save a reusable SSH endpoint for one-click access from the sidebar."
      footer={
        <>
          <button
            type="button"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
            disabled={isSaving}
            onClick={() => {
              void handleSubmit()
            }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </>
      }
      open
      title={title}
    >
      <label className="block text-sm text-slate-200">
        <span className="mb-2 block font-medium">Name</span>
        <input
          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none transition focus:border-cyan-400"
          onChange={(event) => handleChange('name', event.target.value)}
          value={formState.name}
        />
      </label>

      <label className="block text-sm text-slate-200">
        <span className="mb-2 block font-medium">Host</span>
        <input
          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none transition focus:border-cyan-400"
          onChange={(event) => handleChange('host', event.target.value)}
          value={formState.host}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-200">
          <span className="mb-2 block font-medium">Port</span>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none transition focus:border-cyan-400"
            onChange={(event) => handleChange('port', event.target.value)}
            value={formState.port}
          />
        </label>

        <label className="block text-sm text-slate-200">
          <span className="mb-2 block font-medium">Username</span>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none transition focus:border-cyan-400"
            onChange={(event) => handleChange('username', event.target.value)}
            value={formState.username}
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
    </Modal>
  )
}
