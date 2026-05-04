import { useEffect, useMemo, useRef, useState } from 'react'
import type { getTranslations } from '../lib/i18n'
import { formatConnectionSubtitle } from '../lib/format'
import type { AppTheme, ConnectionListDisplayMode, ConnectionRecord } from '../lib/types'

const UNGROUPED_KEY = '__ungrouped__'

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
      const groupLabel = connection.groupName ?? t.ungrouped
      const groupKey = connection.groupName ?? UNGROUPED_KEY

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

  const headerButtonClass = `rounded-lg border px-3 py-2 text-sm transition ${
    isDark
      ? 'border-white/10 text-slate-200 hover:bg-white/5'
      : 'border-slate-200 text-slate-700 hover:bg-slate-100'
  }`

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
            className={`absolute top-full right-0 z-20 mt-2 min-w-[120px] rounded-xl border p-1 shadow-xl ${
              isDark
                ? 'border-white/10 bg-slate-900 text-slate-100 shadow-black/40'
                : 'border-slate-200 bg-white text-slate-900 shadow-slate-300/60'
            }`}
          >
            <button
              role="menuitem"
              type="button"
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
              }`}
              onClick={() => {
                setOpenMenuConnectionId(null)
                onEdit(connection)
              }}
            >
              {t.edit}
            </button>
            <button
              role="menuitem"
              type="button"
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
              }`}
              onClick={() => {
                setOpenMenuConnectionId(null)
                onDuplicate(connection)
              }}
            >
              {t.duplicate}
            </button>
            <button
              role="menuitem"
              type="button"
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                isDark
                  ? 'text-rose-200 hover:bg-rose-500/10'
                  : 'text-rose-600 hover:bg-rose-50'
              }`}
              onClick={() => {
                setOpenMenuConnectionId(null)
                onDelete(connection)
              }}
            >
              {t.delete}
            </button>
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
      <div
        className={`border-b px-5 py-4 ${
          isDark ? 'border-white/10' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {t.connections}
            </h2>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {t.savedSshEndpoints}
            </p>
          </div>
          <button type="button" className={headerButtonClass} onClick={onCreate}>
            {t.add}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <input
            aria-label={t.searchConnections}
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${
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

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="space-y-3" aria-label="Loading connections">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className={`animate-pulse rounded-2xl border ${
                  displayMode === 'compact' ? 'h-12' : 'h-20'
                } ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-200 bg-slate-100'}`}
              />
            ))}
          </div>
        ) : null}

        {!isLoading && connections.length === 0 ? (
          <div
            className={`rounded-2xl border border-dashed px-4 py-6 text-center ${
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
              className="mt-4 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              onClick={onCreate}
            >
              {t.createConnection}
            </button>
          </div>
        ) : null}

        {!isLoading && connections.length > 0 && groups.length === 0 ? (
          <div
            className={`rounded-2xl border px-4 py-6 text-center ${
              isDark ? 'border-white/10 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            {t.noMatchingConnections}
          </div>
        ) : null}

        <div className="space-y-4">
          {groups.map(({ connections: groupConnections, groupKey, groupLabel }) => {
            const isCollapsed = !normalizedSearch && collapsedGroups.includes(groupKey)

            return (
              <section key={groupKey}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  className={`mb-2 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${
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
                            className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
                              isSelected
                                ? isDark
                                  ? 'border-cyan-400/60 bg-cyan-400/10'
                                  : 'border-cyan-400/50 bg-cyan-50'
                                : isDark
                                  ? 'border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-white/5'
                                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => onSelect(connection.id)}
                            >
                              <div className="flex items-center gap-2">
                                <p className={`truncate text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                  {connection.name}
                                </p>
                                {activeCount > 0 ? (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                                      isDark
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    {activeCount === 1 ? t.active : `${activeCount} ${t.tabs}`}
                                  </span>
                                ) : null}
                                {connection.hasPassword ? (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                                      isDark
                                        ? 'bg-slate-700 text-slate-200'
                                        : 'bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {t.keyringBadge}
                                  </span>
                                ) : null}
                              </div>
                              <p className={`truncate text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {formatConnectionSubtitle(connection)}
                              </p>
                            </button>
                             {renderCompactActions(connection)}
                           </div>
                         )
                       }

                      return (
                        <div
                          key={connection.id}
                          className={`rounded-2xl border p-4 transition ${
                            isSelected
                              ? isDark
                                ? 'border-cyan-400/60 bg-cyan-400/10 shadow-lg shadow-cyan-950/30'
                                : 'border-cyan-400/50 bg-cyan-50 shadow-lg shadow-cyan-100'
                              : isDark
                                ? 'border-white/10 bg-slate-950/50 hover:border-white/20 hover:bg-white/5'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => onSelect(connection.id)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p
                                    className={`truncate text-base font-semibold ${
                                      isDark ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {connection.name}
                                  </p>
                                  {activeCount > 0 ? (
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                        isDark
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : 'bg-emerald-100 text-emerald-700'
                                      }`}
                                    >
                                      {activeCount === 1 ? t.active : `${activeCount} ${t.tabs}`}
                                    </span>
                                  ) : null}
                                  {connection.hasPassword ? (
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs ${
                                        isDark
                                          ? 'bg-slate-700 text-slate-200'
                                          : 'bg-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {t.keyringBadge}
                                    </span>
                                  ) : null}
                                </div>
                                <p
                                  className={`mt-1 truncate text-sm ${
                                    isDark ? 'text-slate-400' : 'text-slate-500'
                                  }`}
                                >
                                  {formatConnectionSubtitle(connection)}
                                </p>
                              </div>
                            </div>
                          </button>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {renderDefaultActions(connection)}
                          </div>
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
