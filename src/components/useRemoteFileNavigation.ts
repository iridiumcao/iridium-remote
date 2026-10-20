import { useCallback, useEffect, useRef, useState } from 'react'
import { appClient } from '../api/client'
import type { RemotePathEntry, RemotePathListing } from '../lib/types'

type Directory = { entries: RemotePathEntry[]; loading: boolean; error?: string }
type Browser = {
  root: string
  currentDirectory: string
  directories: Record<string, Directory>
  expanded: Set<string>
  selected: RemotePathEntry | null
  showHidden: boolean
}
export const parentPath = (path: string) => path.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/'
const below = (path: string, ancestor: string) => path.startsWith(ancestor === '/' ? '/' : `${ancestor}/`)
const directoryEntry = (path: string): RemotePathEntry => ({ name: path, path, isDirectory: true })
const navigationError = (cause: unknown) => {
  const error = appClient.normalizeError(cause)
  return error.details ? `${error.message} ${error.details}` : error.message
}

// The tree anchor, committed browsing directory, editable address and selection
// are independent. Only a successful navigation commits a new browsing position.
export function useRemoteFileNavigation(connectionId: string, sessionId: string, onError: (message: string) => void) {
  const [browser, setBrowser] = useState<Browser>({ root: '', currentDirectory: '', directories: {}, expanded: new Set(), selected: null, showHidden: false })
  const [pathInput, setPathInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [revealPath, setRevealPath] = useState<{ path: string } | null>(null)
  const state = useRef(browser)
  useEffect(() => { state.current = browser }, [browser])
  const alive = useRef(false)
  const generation = useRef(0)
  const requests = useRef(new Map<string, number>())
  const home = useRef('')

  const load = useCallback(async (path: string, hidden = state.current.showHidden) => {
    const epoch = generation.current
    const request = (requests.current.get(path) ?? 0) + 1
    requests.current.set(path, request)
    setBrowser(current => ({ ...current, directories: { ...current.directories, [path]: { entries: current.directories[path]?.entries ?? [], loading: true } } }))
    try {
      const listing = await appClient.listRemoteDirectory(connectionId, path, { browserId: sessionId, showHidden: hidden })
      if (!alive.current || epoch !== generation.current || requests.current.get(path) !== request) return false
      const removed = (state.current.directories[path]?.entries ?? []).filter(old => !listing.entries.some(entry => entry.path === old.path))
      const browsing = state.current.currentDirectory
      const retainBrowsing = removed.some(entry => browsing === entry.path || below(browsing, entry.path))
      for (const [key, number] of requests.current) {
        if (retainBrowsing && (key === browsing || below(key, browsing))) continue
        if (removed.some(entry => key === entry.path || below(key, entry.path))) requests.current.set(key, number + 1)
      }
      setBrowser(current => {
        const removed = (current.directories[path]?.entries ?? []).filter(old => !listing.entries.some(entry => entry.path === old.path))
        const removedPath = (key: string) => removed.some(entry => key === entry.path || below(key, entry.path))
        // Hiding an ancestor must not hide the directory the user is browsing.
        // Re-anchor there, retaining its usable contents even if a reload fails.
        const reanchor = removedPath(current.currentDirectory)
        const retained = (key: string) => reanchor
          ? key === current.currentDirectory || below(key, current.currentDirectory)
          : !removedPath(key)
        const directories = Object.fromEntries(Object.entries(current.directories).filter(([key]) => retained(key)))
        directories[path] = { entries: listing.entries, loading: false }
        return { ...current, root: reanchor ? current.currentDirectory : current.root, directories,
          expanded: new Set([...current.expanded].filter(retained)),
          selected: current.selected && !retained(current.selected.path) ? null : current.selected }
      })
      return true
    } catch (cause) {
      if (!alive.current || epoch !== generation.current || requests.current.get(path) !== request) return false
      setBrowser(current => ({ ...current, directories: { ...current.directories, [path]: { entries: current.directories[path]?.entries ?? [], loading: false, error: navigationError(cause) } } }))
      return false
    }
  }, [connectionId, sessionId])

  const navigate = useCallback(async (path: string, options: { resolveFile?: boolean; home?: boolean; resetTree?: boolean; showHidden?: boolean } = {}) => {
    const epoch = ++generation.current
    setLoading(true)
    onError('')
    // Clear obsolete spinners without discarding the last usable tree.
    setBrowser(current => ({ ...current, directories: Object.fromEntries(Object.entries(current.directories).map(([key, value]) => [key, { ...value, loading: false }])) }))
    if (options.home && home.current) setPathInput(home.current)
    try {
      const hidden = options.showHidden ?? state.current.showHidden
      const requested = options.resolveFile && path && !path.startsWith('/')
        ? `${state.current.currentDirectory || home.current || '.'}/${path}` : path
      let listing: RemotePathListing
      let selectedEntry: RemotePathEntry
      if (options.resolveFile) {
        const opened = await appClient.openRemotePath(connectionId, requested, { browserId: sessionId, showHidden: hidden })
        listing = opened.listing
        selectedEntry = opened.selectedEntry
      } else {
        listing = await appClient.listRemoteDirectory(connectionId, path, { browserId: sessionId, showHidden: hidden })
        selectedEntry = directoryEntry(listing.currentPath)
      }
      if (!alive.current || epoch !== generation.current) return false
      if (!path) home.current = listing.currentPath
      setPathInput(listing.currentPath)
      setBrowser(current => {
        const ancestors: string[] = []
        let cursor = listing.currentPath
        while (cursor !== current.root && cursor !== '/') {
          ancestors.push(cursor)
          const parent = parentPath(cursor)
          if (!current.directories[parent]?.entries.some(entry => entry.isDirectory && entry.path === cursor)) break
          cursor = parent
        }
        const preserveTree = !options.home && !options.resetTree && !!current.root && cursor === current.root
        const root = preserveTree ? current.root : listing.currentPath
        const expanded = preserveTree ? new Set([...current.expanded, ...ancestors]) : new Set<string>()
        return { ...current, root, currentDirectory: listing.currentPath, selected: selectedEntry, expanded,
          directories: { ...(preserveTree ? current.directories : {}), [listing.currentPath]: { entries: listing.entries, loading: false } } }
      })
      setRevealPath({ path: selectedEntry.path })
      return true
    } catch (cause) {
      if (alive.current && epoch === generation.current) {
        if (options.home) setPathInput(state.current.currentDirectory)
        onError(navigationError(cause))
      }
      return false
    } finally {
      if (alive.current && epoch === generation.current) setLoading(false)
    }
  }, [connectionId, sessionId, onError])

  useEffect(() => {
    alive.current = true
    void navigate('')
    return () => { alive.current = false }
  }, [navigate])

  const refresh = () => {
    const current = state.current
    if (!current.currentDirectory) { void navigate(''); return }
    setPathInput(current.currentDirectory)
    void load(current.currentDirectory)
    for (const path of current.expanded) {
      if (path !== current.currentDirectory && below(path, current.currentDirectory)) void load(path)
    }
  }
  const refreshBranch = (path: string) => {
    for (const [key, request] of requests.current) if (below(key, path)) requests.current.set(key, request + 1)
    setBrowser(current => ({ ...current,
      directories: Object.fromEntries(Object.entries(current.directories).filter(([key]) => !below(key, path))),
      expanded: new Set([...current.expanded].filter(key => !below(key, path))).add(path) }))
    void load(path)
  }
  const toggleHidden = () => {
    const current = state.current
    const hidden = !current.showHidden
    // Old requests must not restore entries from the previous visibility setting.
    generation.current++
    setLoading(false)
    setPathInput(current.currentDirectory)
    setBrowser(value => ({ ...value, showHidden: hidden }))
    if (!current.currentDirectory) { void navigate('', { showHidden: hidden }); return }
    const paths = new Set([current.root, ...current.expanded, current.currentDirectory])
    // Drop inactive caches; reload visible branches rather than queueing all
    // previously visited directories on the serialized SFTP connection.
    setBrowser(value => ({ ...value, directories: Object.fromEntries(Object.entries(value.directories).filter(([path]) => paths.has(path))) }))
    for (const path of paths) void load(path, hidden)
  }
  const toggle = (entry: RemotePathEntry) => {
    const current = state.current
    setBrowser(value => {
      const expanded = new Set(value.expanded)
      if (expanded.has(entry.path)) expanded.delete(entry.path)
      else expanded.add(entry.path)
      return { ...value, selected: entry, expanded }
    })
    if (!current.expanded.has(entry.path) && !current.directories[entry.path]) void load(entry.path)
  }
  const setSelected = (selected: RemotePathEntry | null) => setBrowser(current => ({ ...current, selected }))
  return { ...browser, pathInput, setPathInput, setSelected, load, navigate, refresh, refreshBranch, toggleHidden, toggle, loading, revealPath }
}
