import { useEffect, useRef, useState } from 'react'
import { appClient } from '../api/client'
import type { getTranslations } from '../lib/i18n'
import type { RemoteSearchInput, RemoteSearchMatch, RemoteSearchResult } from '../lib/types'

type Props = {
  scope: Omit<RemoteSearchInput, 'query'>
  dark: boolean
  t: ReturnType<typeof getTranslations>
  onClose: () => void
  onSelect: (match: RemoteSearchMatch) => void
}

export function RemoteFileSearch({ scope, dark, t, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<RemoteSearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const request = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const search = async () => {
    if (!query.trim() || busy) return
    const id = ++request.current
    setBusy(true)
    setResult(null)
    setError('')
    try {
      const found = await appClient.searchRemoteFiles({ ...scope, query: query.trim() })
      if (mounted.current && id === request.current) setResult(found)
    } catch (cause) {
      if (mounted.current && id === request.current) setError(appClient.normalizeError(cause).message)
    } finally {
      if (mounted.current && id === request.current) setBusy(false)
    }
  }
  const title = scope.mode === 'name' ? t.findByName : t.findByContent
  const button = `rounded border px-2 py-1 text-xs disabled:opacity-40 ${dark ? 'border-white/15 hover:bg-white/10' : 'border-slate-300 hover:bg-slate-100'}`
  return <section aria-label={title} className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-2">
    <div className="flex items-center justify-between gap-2">
      <strong className="text-sm">{title}</strong>
      <button type="button" className={button} onClick={onClose}>{t.backToFileTree}</button>
    </div>
    <p className="truncate text-xs opacity-70" title={scope.path}>{scope.path}</p>
    <form className="flex gap-1" onSubmit={event => { event.preventDefault(); void search() }}>
      <input autoFocus aria-label={t.remoteSearchQuery} placeholder={t.remoteSearchQuery} value={query} onChange={event => setQuery(event.target.value)}
        className={`min-w-0 flex-1 rounded border px-2 py-1 text-xs ${dark ? 'border-white/15 bg-slate-950' : 'border-slate-300 bg-white'}`} />
      <button type="submit" className={button} disabled={busy || !query.trim()}>{t.findRemoteFiles}</button>
    </form>
    {busy ? <p role="status" className="text-xs">{t.searchingRemoteFiles}</p> : null}
    {error ? <p role="alert" className="break-words text-xs text-rose-500">{error}</p> : null}
    {result ? <>
      <p role="status" className="text-xs">{t.remoteSearchCount(result.matches.length)}</p>
      {result.truncated ? <p className="text-xs text-amber-500">{t.remoteSearchLimited}</p> : null}
      {result.skippedEntries ? <p className="text-xs opacity-70">{t.remoteSearchSkipped(result.skippedEntries)}</p> : null}
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto" aria-label={t.remoteSearchResults}>
        {result.matches.map((match, index) => <li key={`${match.path}:${match.line ?? index}`}>
          <button type="button" className={`w-full rounded px-2 py-1 text-left text-xs ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} title={match.path} onClick={() => onSelect(match)}>
            <span className="block break-all">{match.path}{match.line ? `:${match.line}` : ''}</span>
            {match.preview ? <span className="block truncate opacity-70">{match.preview}</span> : null}
          </button>
        </li>)}
      </ul>
    </> : null}
  </section>
}
