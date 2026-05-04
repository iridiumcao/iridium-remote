import type { getTranslations } from '../lib/i18n'
import type { AppTheme } from '../lib/types'
import { Modal } from './Modal'

type AboutDialogProps = {
  open: boolean
  onClose: () => void
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

export const AboutDialog = ({ open, onClose, theme, t }: AboutDialogProps) => {
  const isDark = theme === 'dark'

  return (
    <Modal
      description={t.aboutDescription}
      footer={
        <button
          type="button"
          className={`rounded-lg border px-4 py-2 text-sm transition ${
            isDark
              ? 'border-white/10 text-slate-300 hover:bg-white/5'
              : 'border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
          onClick={onClose}
        >
          {t.close}
        </button>
      }
      open={open}
      theme={theme}
      title={t.aboutTitle}
    >
      <div className="space-y-3">
        <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {t.multiSessionDescription}
        </p>
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            isDark
              ? 'border-white/10 bg-slate-950/70 text-slate-200'
              : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          <strong>{t.versionLabel}:</strong> 0.1.0
        </div>
      </div>
    </Modal>
  )
}
