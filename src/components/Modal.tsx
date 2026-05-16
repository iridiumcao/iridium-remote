import type { PropsWithChildren, ReactNode } from 'react'
import type { AppTheme } from '../lib/types'

type ModalProps = PropsWithChildren<{
  title: string
  description?: string
  open: boolean
  footer: ReactNode
  theme: AppTheme
  widthClass?: string
  bodyClassName?: string
}>

export const Modal = ({
  children,
  description,
  footer,
  open,
  theme,
  title,
  widthClass = 'max-w-lg',
  bodyClassName = 'space-y-4 overflow-y-auto',
}: ModalProps) => {
  if (!open) {
    return null
  }

  const isDark = theme === 'dark'

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm ${
        isDark ? 'bg-slate-950/70' : 'bg-slate-950/20'
      }`}
    >
      <div
      className={`flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-2xl border p-6 shadow-2xl ${
        widthClass
      } ${
        isDark
          ? 'border-white/10 bg-slate-900 text-white shadow-black/40'
          : 'border-slate-200 bg-white text-slate-900 shadow-slate-300/70'
      }`}
    >
        <div className="mb-5">
          <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {title}
          </h2>
          {description ? (
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {description}
            </p>
          ) : null}
        </div>

        <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>

        <div className="mt-6 flex justify-end gap-3">{footer}</div>
      </div>
    </div>
  )
}
