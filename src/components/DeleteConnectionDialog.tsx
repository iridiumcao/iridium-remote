import type { ConnectionRecord, AppTheme } from '../lib/types'
import { Modal } from './Modal'
import type { getTranslations } from '../lib/i18n'

type DeleteConnectionDialogProps = {
  connection: ConnectionRecord | null
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

export const DeleteConnectionDialog = ({
  connection,
  onCancel,
  onConfirm,
  open,
  theme,
  t,
}: DeleteConnectionDialogProps) => {
  const isDark = theme === 'dark'

  return (
    <Modal
      description={
        connection ? t.deleteConnectionDescription(connection.name) : undefined
      }
      footer={
        <>
          <button
            type="button"
            className={`rounded-sm border px-4 py-2 text-sm transition ${
              isDark
                ? 'border-white/10 text-slate-300 hover:bg-white/5'
                : 'border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            onClick={onCancel}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            className="rounded-sm bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
            onClick={onConfirm}
          >
            {t.delete}
          </button>
        </>
      }
      open={open}
      theme={theme}
      title={t.deleteConnectionTitle}
    >
      <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
        {connection
          ? t.deleteConnectionPrompt(connection.name)
          : t.deleteConnectionTitle}
      </p>
    </Modal>
  )
}
