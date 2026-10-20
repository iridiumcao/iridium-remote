import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { getTranslations } from '../lib/i18n'
import type { RemotePathEntry } from '../lib/types'

export type FileMenuAction = 'refresh' | 'copy' | 'name' | 'content'
export type FileMenu = { entry: RemotePathEntry; x: number; y: number }

type Props = {
  menu: FileMenu
  dark: boolean
  t: ReturnType<typeof getTranslations>
  onClose: () => void
  onAction: (action: FileMenuAction, entry: RemotePathEntry) => void
}

export function RemoteFileContextMenu({ menu, dark, t, onClose, onAction }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const outside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    document.addEventListener('scroll', outside, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('scroll', outside, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  const actions: [FileMenuAction, string][] = [
    ['refresh', t.refreshRemotePaths], ['copy', t.copyRemotePath],
    ['name', t.findByName], ['content', t.findByContent],
  ]
  return createPortal(<div ref={ref} role="menu" aria-label={t.moreActions}
    className={`fixed z-50 w-56 rounded-lg border p-1 shadow-xl ${dark ? 'border-white/15 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`}
    style={{ left: Math.max(4, Math.min(menu.x, window.innerWidth - 228)), top: Math.max(4, Math.min(menu.y, window.innerHeight - 172)) }}
    onContextMenu={event => event.preventDefault()}
    onKeyDown={event => {
      const items = Array.from(event.currentTarget.querySelectorAll('button'))
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      let next: number
      switch (event.key) {
        case 'ArrowDown': next = (index + 1) % items.length; break
        case 'ArrowUp': next = (index + items.length - 1) % items.length; break
        case 'Home': next = 0; break
        case 'End': next = items.length - 1; break
        case 'Tab': onClose(); return
        default: return
      }
      event.preventDefault()
      items[next]?.focus()
    }}>
    {actions.map(([action, label]) => <button key={action} role="menuitem" type="button"
      className={`block w-full rounded px-3 py-2 text-left text-sm ${dark ? 'hover:bg-white/10 focus:bg-white/10' : 'hover:bg-slate-100 focus:bg-slate-100'}`}
      onClick={() => onAction(action, menu.entry)}>{label}</button>)}
  </div>, document.body)
}
