import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { getGroupKey, normalizeCollapsedGroups, normalizeGroupName } from '../lib/groups'
import type { getTranslations } from '../lib/i18n'
import { formatConnectionSubtitle } from '../lib/format'
import type { AppTheme, ConnectionListDisplayMode, ConnectionRecord } from '../lib/types'

type ConnectionListProps = {
  connections: ConnectionRecord[]
  isLoading: boolean
  selectedConnectionId: string | null
  activeConnectionCounts: Record<string, number>
  collapsedGroups: string[]
  displayMode: ConnectionListDisplayMode
  onConnect: (connection: ConnectionRecord) => void
  onCreate: () => void
  onDelete: (connection: ConnectionRecord) => void
  onDisplayModeChange: (mode: ConnectionListDisplayMode) => void
  onDuplicate: (connection: ConnectionRecord) => void
  onEdit: (connection: ConnectionRecord) => void
  onSearchChange: (value: string) => void
  onSelect: (connectionId: string) => void
  onToggleGroup: (groupKey: string) => void
  searchQuery: string
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

export const ConnectionList = ({
  activeConnectionCounts,
  collapsedGroups,
  connections,
  displayMode,
  isLoading,
  onConnect,
  onCreate,
  onDelete,
  onDisplayModeChange,
  onDuplicate,
  onEdit,
  onSearchChange,
  onSelect,
  onToggleGroup,
  searchQuery,
  selectedConnectionId,
  theme,
  t,
}: ConnectionListProps) => {
  const isDark = theme === 'dark'
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const normalizedCollapsedGroupKeys = useMemo(
    () => normalizeCollapsedGroups(collapsedGroups),
    [collapsedGroups],
  )
  const [openMenuConnectionId, setOpenMenuConnectionId] = useState<string | null>(null)
  const openMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openMenuConnectionId) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        openMenuRef.current &&
        event.target instanceof Node &&
        !openMenuRef.current.contains(event.target)
      ) {
        setOpenMenuConnectionId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [openMenuConnectionId])

  const filteredConnections = useMemo(
    () =>
      connections.filter((connection) => {
        if (!normalizedSearch) {
          return true
        }

        return [connection.name, connection.host, connection.username].some((value) =>
          value.toLowerCase().includes(normalizedSearch),
        )
      }),
    [connections, normalizedSearch],
  )

  const groups = useMemo(() => {
    const grouped = new Map<string, { label: string; connections: ConnectionRecord[] }>()

    for (const connection of filteredConnections) {
      const normalizedGroupName = normalizeGroupName(connection.groupName)
      const groupLabel = normalizedGroupName ?? t.ungrouped
      const groupKey = getGroupKey(connection.groupName)

      const bucket = grouped.get(groupKey)
      if (bucket) {
        bucket.connections.push(connection)
      } else {
        grouped.set(groupKey, { label: groupLabel, connections: [connection] })
      }
    }

    return Array.from(grouped.entries()).map(([groupKey, value]) => ({
      groupKey,
      groupLabel: value.label,
      connections: value.connections,
    }))
  }, [filteredConnections, t.ungrouped])

  const iconButtonClass = `rounded-md border px-2 py-1 text-xs transition ${
    isDark
      ? 'border-white/10 text-slate-200 hover:bg-white/5'
      : 'border-slate-200 text-slate-700 hover:bg-slate-100'
  }`

  const deleteButtonClass = `rounded-md border px-2 py-1 text-xs transition ${
    isDark
      ? 'border-rose-500/20 text-rose-200 hover:bg-rose-500/10'
      : 'border-rose-200 text-rose-600 hover:bg-rose-50'
  }`

  const closeCompactMenu = () => {
    setOpenMenuConnectionId(null)
  }

  const openCompactMenu = (connectionId: string) => {
    setOpenMenuConnectionId(connectionId)
  }

  const handleCompactContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    connection: ConnectionRecord,
  ) => {
    event.preventDefault()
    onSelect(connection.id)
    openCompactMenu(connection.id)
  }

  const renderCompactMenuItems = (connection: ConnectionRecord) => (
    <>
      <button
        role="menuitem"
        type="button"
        className={`block w-full rounded-sm px-3 py-2 text-left text-sm transition ${
          isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
        }`}
        onClick={() => {
          closeCompactMenu()
          onEdit(connection)
        }}
      >
        {t.edit}
      </button>
      <button
        role="menuitem"
        type="button"
        className={`block w-full rounded-sm px-3 py-2 text-left text-sm transition ${
          isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
        }`}
        onClick={() => {
          closeCompactMenu()
          onDuplicate(connection)
        }}
      >
        {t.duplicate}
      </button>
      <button
        role="menuitem"
        type="button"
        className={`block w-full rounded-sm px-3 py-2 text-left text-sm transition ${
          isDark
            ? 'text-rose-200 hover:bg-rose-500/10'
            : 'text-rose-600 hover:bg-rose-50'
        }`}
        onClick={() => {
          closeCompactMenu()
          onDelete(connection)
        }}
      >
        {t.delete}
      </button>
    </>
  )

  const renderDefaultActions = (connection: ConnectionRecord) => (
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" className={iconButtonClass} onClick={() => onConnect(connection)}>
        {t.connect}
      </button>
      <button type="button" className={iconButtonClass} onClick={() => onEdit(connection)}>
        {t.edit}
      </button>
      <button type="button" className={iconButtonClass} onClick={() => onDuplicate(connection)}>
        {t.duplicate}
      </button>
      <button type="button" className={deleteButtonClass} onClick={() => onDelete(connection)}>
        {t.delete}
      </button>
    </div>
  )

  const handleOpenConnection = (connection: ConnectionRecord) => {
    onSelect(connection.id)
    onConnect(connection)
  }

  const renderCompactActions = (connection: ConnectionRecord) => {
    const isMenuOpen = openMenuConnectionId === connection.id

    return (
      <div
        ref={isMenuOpen ? openMenuRef : null}
        className="relative flex shrink-0 items-center gap-2"
      >
        <button type="button" className={iconButtonClass} onClick={() => onConnect(connection)}>
          {t.connect}
        </button>
        <button
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          aria-label={t.moreActions}
          type="button"
          className={`${iconButtonClass} px-2.5 text-base leading-none`}
          onClick={() =>
            setOpenMenuConnectionId((current) => (current === connection.id ? null : connection.id))
          }
        >
          ⋮
        </button>

        {isMenuOpen ? (
          <div
            role="menu"
            className={`absolute top-full right-0 z-20 mt-2 min-w-[120px] rounded-sm border p-1 shadow-xl ${
              isDark
                ? 'border-white/10 bg-slate-900 text-slate-100 shadow-black/40'
                : 'border-slate-200 bg-white text-slate-900 shadow-slate-300/60'
            }`}
          >
            {renderCompactMenuItems(connection)}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <aside
      className={`flex min-h-0 w-full flex-col border-b lg:w-[380px] lg:border-r lg:border-b-0 ${
        isDark ? 'border-white/10 bg-slate-900/60' : 'border-slate-200 bg-white/90'
      }`}
    >
      <div className={`flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        <span>{t.workspaceConnectionsTab ?? 'CONNECTIONS'}</span>
        <div className="flex items-center gap-1">
          <button type="button" className={`hover:text-cyan-400 transition-colors px-1`} onClick={onCreate} title={t.add}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      </div>

      <div className={`px-4 py-2 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        <div className="space-y-3">
          <input
            aria-label={t.searchConnections}
            className={`w-full rounded-sm border px-3 py-2 text-sm outline-none transition ${
              isDark
                ? 'border-white/10 bg-slate-950 text-white focus:border-cyan-400'
                : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
            }`}
            onChange={(event) => {
              setOpenMenuConnectionId(null)
              onSearchChange(event.target.value)
            }}
            placeholder={t.searchConnections}
            value={searchQuery}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {t.displayMode}
              </span>
              {(['normal', 'compact'] as const).map((mode) => {
                const isSelected = displayMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      isSelected
                        ? isDark
                          ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300'
                          : 'border-cyan-400/60 bg-cyan-50 text-cyan-700'
                        : isDark
                          ? 'border-white/10 text-slate-300 hover:bg-white/5'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                    onClick={() => {
                      setOpenMenuConnectionId(null)
                      onDisplayModeChange(mode)
                    }}
                  >
                    {mode === 'normal' ? t.normalMode : t.compactMode}
                  </button>
                )
              })}
            </div>

          </div>
        </div>
      </div>

      <div
        className={`connection-list-scroll-region themed-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 ${
          isDark ? 'themed-scrollbar-dark' : 'themed-scrollbar-light'
        }`}
      >
        {isLoading ? (
          <div className="space-y-3" aria-label="Loading connections">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className={`animate-pulse rounded-sm border ${
                  displayMode === 'compact' ? 'h-12' : 'h-20'
                } ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-200 bg-slate-100'}`}
              />
            ))}
          </div>
        ) : null}

        {!isLoading && connections.length === 0 ? (
          <div
            className={`rounded-sm border border-dashed px-4 py-6 text-center ${
              isDark
                ? 'border-white/10 bg-slate-950/60'
                : 'border-slate-300 bg-slate-50'
            }`}
          >
            <p className={`text-base font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {t.noSavedConnectionsYet}
            </p>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {t.noSavedConnectionsDescription}
            </p>
            <button
              type="button"
              className="mt-4 rounded-sm bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              onClick={onCreate}
            >
              {t.createConnection}
            </button>
          </div>
        ) : null}

        {!isLoading && connections.length > 0 && groups.length === 0 ? (
          <div
            className={`rounded-sm border px-4 py-6 text-center ${
              isDark ? 'border-white/10 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            {t.noMatchingConnections}
          </div>
        ) : null}

        <div className="space-y-4">
          {groups.map(({ connections: groupConnections, groupKey, groupLabel }) => {
            const isCollapsed = !normalizedSearch && normalizedCollapsedGroupKeys.includes(groupKey)

            return (
              <section key={groupKey}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  className={`mb-2 flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left ${
                    isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
                  }`}
                  onClick={() => onToggleGroup(groupKey)}
                  title={t.groupToggle(isCollapsed, groupLabel)}
                >
                  <div className="flex items-center gap-2">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                      {isCollapsed ? '▸' : '▾'}
                    </span>
                    <p
                      className={`text-xs font-semibold uppercase tracking-[0.25em] ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {groupLabel}
                    </p>
                  </div>
                  <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {t.groupCount(groupConnections.length)}
                  </span>
                </button>

                {!isCollapsed ? (
                  <div className="space-y-2">
                    {groupConnections.map((connection) => {
                      const isSelected = selectedConnectionId === connection.id
                      const activeCount = activeConnectionCounts[connection.id] ?? 0

                      if (displayMode === 'compact') {
                        return (
                          <div
                            key={connection.id}
                            onContextMenu={(event) => handleCompactContextMenu(event, connection)}
                            className={`group flex items-center gap-2 px-6 py-1 cursor-pointer transition-colors ${
                              isSelected
                                ? isDark
                                  ? 'bg-cyan-900/30 text-white'
                                  : 'bg-cyan-50 text-slate-900'
                                : isDark
                                  ? 'text-slate-300 hover:bg-white/5'
                                  : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left flex items-center gap-2"
                              onDoubleClick={() => handleOpenConnection(connection)}
                              onClick={() => onSelect(connection.id)}
                            >
                              <p className="truncate text-sm font-medium">
                                {connection.name}
                              </p>
                              {activeCount > 0 ? (
                                <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-cyan-400' : 'bg-cyan-500'}`} title={`${activeCount} active session(s)`} />
                              ) : null}
                              {connection.hasPassword ? (
                                <span className={`text-[10px] font-bold px-1 rounded ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} title="Has saved password">
                                  *
                                </span>
                              ) : null}
                            </button>
                             <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                               {renderCompactActions(connection)}
                             </div>
                           </div>
                         )
                       }

                      return (
                        <div
                          key={connection.id}
                          className={`group flex flex-col gap-2 px-6 py-2 transition-colors border-l-2 ${
                            isSelected
                              ? isDark
                                ? 'border-cyan-400 bg-cyan-900/20 text-white'
                                : 'border-cyan-500 bg-cyan-50 text-slate-900'
                              : isDark
                                ? 'border-transparent text-slate-300 hover:bg-white/5'
                                : 'border-transparent text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onDoubleClick={() => handleOpenConnection(connection)}
                            onClick={() => onSelect(connection.id)}
                          >
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium">
                                {connection.name}
                              </p>
                              {activeCount > 0 ? (
                                <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-cyan-400' : 'bg-cyan-500'}`} title={`${activeCount} active session(s)`} />
                              ) : null}
                              {connection.hasPassword ? (
                                <span className={`text-[10px] font-bold px-1 rounded ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} title="Has saved password">
                                  *
                                </span>
                              ) : null}
                            </div>
                            <p className={`mt-0.5 truncate text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {formatConnectionSubtitle(connection)}
                            </p>
                          </button>

                          {isSelected && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {renderDefaultActions(connection)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
