import type { PropsWithChildren, ReactNode } from 'react'

type ModalProps = PropsWithChildren<{
  title: string
  description?: string
  open: boolean
  footer: ReactNode
}>

export const Modal = ({ children, description, footer, open, title }: ModalProps) => {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {description ? <p className="mt-2 text-sm text-slate-300">{description}</p> : null}
        </div>

        <div className="space-y-4">{children}</div>

        <div className="mt-6 flex justify-end gap-3">{footer}</div>
      </div>
    </div>
  )
}
