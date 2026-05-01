import type { ConnectionRecord } from '../lib/types'
import { Modal } from './Modal'

type DeleteConnectionDialogProps = {
  connection: ConnectionRecord | null
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

export const DeleteConnectionDialog = ({
  connection,
  onCancel,
  onConfirm,
  open,
}: DeleteConnectionDialogProps) => (
  <Modal
    description={
      connection
        ? `Delete ${connection.name}. This removes the saved connection metadata from the local app.`
        : undefined
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
          className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
          onClick={onConfirm}
        >
          Delete
        </button>
      </>
    }
    open={open}
    title="Delete Connection"
  >
    <p className="text-sm text-slate-300">
      {connection
        ? `You are about to remove ${connection.name}.`
        : 'You are about to remove this connection.'}
    </p>
  </Modal>
)
