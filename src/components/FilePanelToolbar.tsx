import type { getTranslations } from '../lib/i18n'

type Props = {
  currentDirectory: string
  showHidden: boolean
  onParent: () => void
  onHome: () => void
  onRefresh: () => void
  onToggleHidden: () => void
  dark: boolean
  t: ReturnType<typeof getTranslations>
}

export function FilePanelToolbar({ currentDirectory, showHidden, onParent, onHome, onRefresh, onToggleHidden, dark, t }: Props) {
  const iconButton = `flex h-8 w-8 items-center justify-center rounded border transition disabled:opacity-35 ${
    dark ? 'border-white/15 hover:bg-white/10' : 'border-slate-300 hover:bg-slate-100'
  }`
  const icon = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'h-4 w-4', 'aria-hidden': true as const }
  return <div role="toolbar" aria-label={t.remoteBrowserTitle} className="flex items-center gap-2 px-3 py-2">
    <span title={t.parentFolder}>
      <button type="button" aria-label={t.parentFolder} disabled={!currentDirectory || currentDirectory === '/'} className={iconButton} onClick={onParent}>
        <svg {...icon}><path d="m6 11 6-6 6 6M12 5v14" /></svg>
      </button>
    </span>
    <button type="button" title={t.remoteHome} aria-label={t.remoteHome} className={iconButton} onClick={onHome}>
      <svg {...icon}><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></svg>
    </button>
    <button type="button" title={t.refreshRemotePaths} aria-label={t.refreshRemotePaths} className={iconButton} onClick={onRefresh}>
      <svg {...icon}><path d="M20 7a9 9 0 1 0 1 7M20 3v5h-5" /></svg>
    </button>
    <button type="button" title={t.showHiddenFiles} aria-label={t.showHiddenFiles} aria-pressed={showHidden}
      className={`${iconButton} ${showHidden ? dark ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200' : 'border-cyan-500 bg-cyan-50 text-cyan-700' : ''}`}
      onClick={onToggleHidden}>
      <svg {...icon}>
        {showHidden ? <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>
          : <><path d="M3 3l18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 4M6.3 6.3A21 21 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.7-1.7M10 10a3 3 0 0 0 4 4" /></>}
      </svg>
    </button>
  </div>
}
