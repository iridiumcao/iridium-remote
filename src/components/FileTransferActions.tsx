import { useEffect, useId, useRef, useState } from 'react'
import type { getTranslations } from '../lib/i18n'
import type { RemotePathEntry } from '../lib/types'

type Props = {
  selected: RemotePathEntry | null
  uploadDirectory: string
  disabled: boolean
  dark: boolean
  t: ReturnType<typeof getTranslations>
  onUpload: (mode: 'file' | 'directory', target: RemotePathEntry) => void
  onDownload: (target: RemotePathEntry) => void
}

export function FileTransferActions({ selected, uploadDirectory, disabled, dark, t, onUpload, onDownload }: Props) {
  const [uploadOpen, setUploadOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const blocked = disabled || !selected
  const iconButton = `flex h-8 w-8 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-35 ${
    dark ? 'border-white/15 hover:bg-white/10' : 'border-slate-300 hover:bg-slate-100'
  }`
  const icon = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'h-4 w-4', 'aria-hidden': true as const }

  useEffect(() => {
    if (!uploadOpen || blocked) return
    menuRef.current?.querySelector('button')?.focus()
    const outside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setUploadOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setUploadOpen(false)
        uploadRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [uploadOpen, blocked])

  return <div ref={containerRef} className="relative flex items-center gap-2">
    <button ref={uploadRef} type="button" aria-label={t.upload} title={selected ? t.uploadToDirectory(uploadDirectory) : t.upload}
      aria-haspopup="menu" aria-expanded={uploadOpen && !blocked} aria-controls={uploadOpen && !blocked ? menuId : undefined}
      className={iconButton} disabled={blocked} onClick={() => setUploadOpen(open => !open)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setUploadOpen(true)
        }
      }}>
      <svg {...icon}><path d="M12 16V3m-4 4 4-4 4 4M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" /></svg>
    </button>
    <button type="button" aria-label={t.download} title={selected ? `${t.download}: ${selected.path}` : t.download}
      className={iconButton} disabled={blocked} onClick={() => { if (selected) onDownload(selected) }}>
      <svg {...icon}><path d="M12 3v13m-4-4 4 4 4-4M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" /></svg>
    </button>
    {uploadOpen && !blocked ? <div ref={menuRef} id={menuId} role="menu" aria-label={t.upload}
      className={`absolute bottom-full left-0 z-30 mb-2 w-48 max-w-full rounded-lg border p-1 shadow-xl ${dark ? 'border-white/15 bg-slate-900' : 'border-slate-200 bg-white'}`}
      onKeyDown={event => {
        const items = Array.from(event.currentTarget.querySelectorAll('button'))
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        let next: number
        switch (event.key) {
          case 'ArrowDown': next = (index + 1) % items.length; break
          case 'ArrowUp': next = (index + items.length - 1) % items.length; break
          case 'Home': next = 0; break
          case 'End': next = items.length - 1; break
          case 'Tab': setUploadOpen(false); return
          default: return
        }
        event.preventDefault()
        items[next]?.focus()
      }}>
      {(['file', 'directory'] as const).map(mode => <button key={mode} type="button" role="menuitem"
        className={`block w-full rounded px-3 py-2 text-left text-sm ${dark ? 'hover:bg-white/10 focus:bg-white/10' : 'hover:bg-slate-100 focus:bg-slate-100'}`}
        onClick={() => {
          setUploadOpen(false)
          uploadRef.current?.focus()
          if (selected) onUpload(mode, selected)
        }}>{mode === 'file' ? t.browseFile : t.browseFolder}</button>)}
    </div> : null}
  </div>
}
