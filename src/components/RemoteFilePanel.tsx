import { useCallback, useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react'
import { appClient } from '../api/client'
import type { getTranslations } from '../lib/i18n'
import type { AppTheme, FileTransferInput, RemotePathEntry, RemoteSearchInput, RemoteSearchMatch } from '../lib/types'
import { FilePanelToolbar } from './FilePanelToolbar'
import { FileTransferActions } from './FileTransferActions'
import { RemoteFileContextMenu, type FileMenu, type FileMenuAction } from './RemoteFileContextMenu'
import { RemoteFileSearch } from './RemoteFileSearch'
import { parentPath, useRemoteFileNavigation } from './useRemoteFileNavigation'

type Props = {
  sessionId: string
  connectionId: string
  connectionName: string
  visible: boolean
  onClose: () => void
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

export function RemoteFilePanel({ sessionId, connectionId, connectionName, visible, onClose, theme, t }: Props) {
  // Each mounted panel belongs to one terminal session, including in-flight transfers.
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<FileTransferInput | null>(null)
  const [message, setMessage] = useState('')
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { root, currentDirectory, pathInput, setPathInput, directories, expanded, selected, setSelected, showHidden,
    load, navigate: browse, refresh, refreshBranch, toggleHidden, toggle, loading, revealPath } = useRemoteFileNavigation(connectionId, sessionId, setError)
  const [menu, setMenu] = useState<FileMenu | null>(null)
  const [search, setSearch] = useState<Omit<RemoteSearchInput, 'query'> | null>(null)
  const mounted = useRef(false)
  const treeButtons = useRef(new Map<string, HTMLButtonElement>())
  const visibleRef = useRef(visible)
  const dirtyDirectories = useRef(new Set<string>())
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyRequest = useRef(0)
  const dark = theme === 'dark'
  const isPathCopied = !!selected && copiedPath === selected.path
  const button = `rounded border px-2 py-1 text-xs disabled:opacity-40 ${dark ? 'border-white/15 hover:bg-white/10' : 'border-slate-300 hover:bg-slate-100'}`

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current)
      void appClient.closeRemoteBrowser(sessionId).catch(() => {})
    }
  }, [sessionId])

  useEffect(() => {
    visibleRef.current = visible
    if (!visible) void appClient.closeRemoteBrowser(sessionId).catch(() => {})
    else {
      for (const path of dirtyDirectories.current) void load(path)
      dirtyDirectories.current.clear()
    }
  }, [sessionId, visible, load])
  useEffect(() => {
    if (visible && revealPath) treeButtons.current.get(revealPath.path)?.scrollIntoView?.({ block: 'nearest' })
  }, [revealPath, visible])

  const closeMenu = useCallback(() => setMenu(null), [])
  const copyPath = async (path: string) => {
    const request = ++copyRequest.current
    if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current)
    setCopiedPath(null)
    setMessage(current => current === t.remotePathCopied ? '' : current)
    setError('')
    try {
      await navigator.clipboard.writeText(path)
      if (!mounted.current || request !== copyRequest.current) return
      setCopiedPath(path)
      setMessage(t.remotePathCopied)
      copyFeedbackTimer.current = setTimeout(() => {
        if (!mounted.current || request !== copyRequest.current) return
        setCopiedPath(null)
        setMessage(current => current === t.remotePathCopied ? '' : current)
      }, 1500)
    } catch (cause) {
      if (mounted.current && request === copyRequest.current) setError(appClient.normalizeError(cause).message)
    }
  }
  const navigate = (path: string, options?: { resolveFile?: boolean; home?: boolean; resetTree?: boolean }) => {
    setMenu(null)
    setSearch(null)
    void browse(path, options)
  }
  const openMenu = (event: MouseEvent, entry: RemotePathEntry) => {
    event.preventDefault()
    event.stopPropagation()
    setSelected(entry)
    setMenu({ entry, x: event.clientX, y: event.clientY })
  }
  const openKeyboardMenu = (event: KeyboardEvent, entry: RemotePathEntry) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    setSelected(entry)
    setMenu({ entry, x: bounds.left + 12, y: bounds.bottom })
  }
  const menuAction = (action: FileMenuAction, entry: RemotePathEntry) => {
    setMenu(null)
    setError('')
    if (action === 'copy') {
      void copyPath(entry.path)
    } else if (action === 'refresh') {
      const path = entry.isDirectory ? entry.path : parentPath(entry.path)
      refreshBranch(path)
    } else {
      setSearch({ connectionId, path: !entry.isDirectory && action === 'name' ? parentPath(entry.path) : entry.path, mode: action, showHidden })
    }
  }
  const revealMatch = async (match: RemoteSearchMatch) => {
    setSearch(null)
    await browse(match.path, { resolveFile: true, resetTree: true })
  }

  const chooseTransfer = async (direction: 'upload' | 'download', mode: 'file' | 'directory', target: RemotePathEntry) => {
    if (!target || busy || pending) return
    const remotePath = direction === 'upload' && !target.isDirectory ? parentPath(target.path) : target.path
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const localPath = await appClient.pickTransferLocalPath(direction, mode, '', remotePath)
      if (localPath && mounted.current) {
        setPending({ connectionId, direction, localPath, remotePath })
      }
    } catch (cause) {
      if (mounted.current) setError(appClient.normalizeError(cause).message)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const transfer = async () => {
    if (!pending || busy) return
    const input = pending
    setBusy(true)
    setError('')
    try {
      await appClient.transferFile(input)
      if (!mounted.current) return
      setMessage(t.transferSuccess)
      setPending(null)
      if (input.direction === 'upload') {
        if (visibleRef.current) void load(input.remotePath)
        else dirtyDirectories.current.add(input.remotePath)
      }
    } catch (cause) {
      if (mounted.current) setError(appClient.normalizeError(cause).message)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const renderDirectory = (path: string, ancestors: Set<string>) => {
    const directory = directories[path]
    if (!directory) return null
    return <>
      {directory.loading ? <li className="px-2 py-1 text-xs" role="status">{t.loadingRemotePaths}</li> : null}
      {directory.error ? <li className="px-2 py-1 text-xs" role="alert"><p>{directory.error}</p><button className={button} onClick={() => void load(path)}>{t.retryRemotePaths}</button></li> : null}
      {!directory.loading && !directory.error && !directory.entries.length ? <li className="px-2 py-1 text-xs opacity-60">{t.noRemotePaths}</li> : null}
      {directory.entries.map(entry => <li key={entry.path}>
        <div onContextMenu={event => openMenu(event, entry)} onKeyDown={event => openKeyboardMenu(event, entry)} className={`flex min-w-0 items-center rounded ${selected?.path === entry.path ? dark ? 'bg-cyan-400/15' : 'bg-cyan-50' : ''}`}>
          {entry.isDirectory ? <button type="button" aria-label={`${expanded.has(entry.path) ? t.collapseFolder : t.openFolder} ${entry.name}`} aria-expanded={expanded.has(entry.path)} className="w-6 shrink-0 py-1" onClick={() => toggle(entry)}>{expanded.has(entry.path) ? '▾' : '▸'}</button> : <span className="w-6 shrink-0" />}
          <button ref={element => { if (element) treeButtons.current.set(entry.path, element); else treeButtons.current.delete(entry.path) }} type="button" aria-pressed={selected?.path === entry.path} className="min-w-0 flex-1 truncate py-1 text-left text-sm" title={entry.path} onClick={() => setSelected(entry)} onDoubleClick={() => { if (entry.isDirectory) navigate(entry.path) }}>
            <span aria-hidden="true">{entry.isDirectory ? '📁 ' : '📄 '}</span>{entry.name}
          </button>
        </div>
        {entry.isDirectory && expanded.has(entry.path) && !ancestors.has(entry.path) ? <ul className="ml-3 border-l border-current/10 pl-2">{renderDirectory(entry.path, new Set([...ancestors, entry.path]))}</ul> : null}
      </li>)}
    </>
  }

  return <aside aria-label={`${t.fileTransfer}: ${connectionName}`} className={`flex h-full min-h-0 flex-col overflow-hidden border-l ${dark ? 'border-white/10 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}>
    <header className="flex items-center justify-between gap-2 px-3 py-2">
      <strong className="truncate text-sm" title={connectionName}>{t.fileTransfer} · {connectionName}</strong>
      <button type="button" aria-label={t.closeFilePanel} className={button} onClick={onClose}>×</button>
    </header>
    <form className="flex gap-1 px-3" onSubmit={event => { event.preventDefault(); navigate(pathInput.trim(), { resolveFile: true, resetTree: true }) }}>
      <input aria-label={t.remotePath} className={`min-w-0 flex-1 rounded border px-2 py-1 text-xs ${dark ? 'border-white/15 bg-slate-950' : 'border-slate-300 bg-white'}`} value={pathInput} onChange={event => setPathInput(event.target.value)} />
      <button type="submit" className={button}>{t.openFolder}</button>
    </form>
    <FilePanelToolbar currentDirectory={currentDirectory} showHidden={showHidden} dark={dark} t={t}
      onParent={() => navigate(parentPath(currentDirectory))} onHome={() => navigate('', { home: true })}
      onRefresh={() => { setSearch(null); setMenu(null); setError(''); refresh() }}
      onToggleHidden={() => { setSearch(null); setMenu(null); setError(''); toggleHidden() }} />
    {loading ? <p role="status" className="px-3 py-1 text-xs">{t.loadingRemotePaths}</p> : null}
    {search ? <RemoteFileSearch key={`${search.mode}:${search.path}`} scope={search} dark={dark} t={t}
      onClose={() => setSearch(null)} onSelect={match => void revealMatch(match)} /> : <div className="min-h-0 flex-1 overflow-auto px-2">
      {root ? <button ref={element => { if (element) treeButtons.current.set(root, element); else treeButtons.current.delete(root) }} type="button" className={`w-full truncate rounded px-2 py-1 text-left text-sm ${selected?.path === root ? 'bg-cyan-400/15' : ''}`} title={root}
        onContextMenu={event => openMenu(event, { name: root, path: root, isDirectory: true })}
        onKeyDown={event => openKeyboardMenu(event, { name: root, path: root, isDirectory: true })}
        onClick={() => setSelected({ name: root, path: root, isDirectory: true })} onDoubleClick={() => navigate(root)}>{root}</button> : null}
      <ul aria-label={t.remoteBrowserTitle}>{renderDirectory(root, new Set([root]))}</ul>
    </div>}
    {menu && visible ? <RemoteFileContextMenu menu={menu} dark={dark} t={t} onClose={closeMenu} onAction={menuAction} /> : null}
    <footer className={`space-y-2 border-t p-3 ${dark ? 'border-white/10' : 'border-slate-200'}`}>
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs" title={selected?.path}>{t.remotePath}: {selected?.path ?? '—'}</p>
        <button type="button" aria-label={t.copyRemotePath} title={isPathCopied ? t.remotePathCopied : t.copyRemotePath}
          disabled={!selected} className={`${button} flex h-7 w-7 shrink-0 items-center justify-center`}
          onClick={() => { if (selected) void copyPath(selected.path) }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${isPathCopied ? 'text-emerald-500' : ''}`}>
            {isPathCopied ? <path d="m5 12 4 4L19 6" />
              : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></>}
          </svg>
        </button>
      </div>
      <FileTransferActions key={`${selected?.path ?? ''}:${visible}`} selected={selected}
        uploadDirectory={selected ? selected.isDirectory ? selected.path : parentPath(selected.path) : ''}
        disabled={busy || !!pending} dark={dark} t={t}
        onUpload={(mode, target) => void chooseTransfer('upload', mode, target)}
        onDownload={target => void chooseTransfer('download', target.isDirectory ? 'directory' : 'file', target)} />
      {pending ? <div className="space-y-2 text-xs">
        <p className="break-all">{t.localPath}: {pending.localPath}<br />{t.remotePath}: {pending.remotePath}</p>
        <p>{t.transferOverwriteWarning}</p>
        <div className="flex gap-2"><button type="button" className={button} disabled={busy} onClick={() => void transfer()}>{t.startTransfer}</button><button type="button" className={button} disabled={busy} onClick={() => setPending(null)}>{t.cancel}</button></div>
      </div> : null}
      {busy ? <p role="status" className="text-xs">{t.transferInProgress}</p> : null}
      {message ? <p role="status" className="text-xs text-emerald-500">{message}</p> : null}
      {error ? <p role="alert" className="break-words text-xs text-rose-500">{error}</p> : null}
      <p className="text-xs opacity-60">{t.transferDescription}</p>
    </footer>
  </aside>
}
