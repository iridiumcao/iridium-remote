import type { getTranslations } from '../lib/i18n'
import { APP_VERSION } from '../lib/appInfo'
import type { AppTheme } from '../lib/types'
import { Modal } from './Modal'

type AboutDialogProps = {
  open: boolean
  onClose: () => void
  onOpenProjectUrl: () => void
  projectUrl: string
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

export const AboutDialog = ({
  open,
  onClose,
  onOpenProjectUrl,
  projectUrl,
  theme,
  t,
}: AboutDialogProps) => {
  const isDark = theme === 'dark'

  const infoClass = `rounded-xl border px-4 py-3 text-sm ${
    isDark
      ? 'border-white/10 bg-slate-950/70 text-slate-200'
      : 'border-slate-200 bg-slate-50 text-slate-700'
  }`

  return (
    <Modal
      description={t.aboutDescription}
      footer={
        <div className="flex w-full justify-between gap-3">
          <button
            type="button"
            className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            onClick={onOpenProjectUrl}
          >
            {t.openProjectUrl}
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
            {t.close}
          </button>
        </div>
      }
      open={open}
      theme={theme}
      title={t.aboutTitle}
    >
      <div className="space-y-3">
        <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {t.multiSessionDescription}
        </p>
        <div className={infoClass}>
          <strong>{t.aboutAuthorLabel}:</strong> Cao Yi
        </div>
        <div className={infoClass}>
          <strong>{t.aboutProjectUrlLabel}:</strong>{' '}
          <button
            type="button"
            className="break-all text-left text-cyan-500 underline hover:text-cyan-400"
            onClick={onOpenProjectUrl}
          >
            {projectUrl}
          </button>
        </div>
        <div className={infoClass}>
          <strong>{t.aboutLicenseLabel}:</strong> Apache License 2.0
        </div>
        <div className={infoClass}>
          <strong>{t.versionLabel}:</strong> {APP_VERSION}
        </div>
      </div>
    </Modal>
  )
}
