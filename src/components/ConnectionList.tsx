import { useMemo } from 'react'
import type { getTranslations } from '../lib/i18n'
import { formatConnectionSubtitle } from '../lib/format'
import type { AppTheme, ConnectionRecord } from '../lib/types'

type ConnectionListProps = {
  connections: ConnectionRecord[]
  isLoading: boolean
  selectedConnectionId: string | null
  activeConnectionCounts: Record<string, number>
  onConnect: (connection: ConnectionRecord) => void
  onCreate: () => void
  onDelete: (connection: ConnectionRecord) => void
  onDuplicate: (connection: ConnectionRecord) => void
  onEdit: (connection: ConnectionRecord) => void
  onSelect: (connectionId: string) => void
  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

export const ConnectionList = ({
  activeConnectionCounts,
  connections,
  isLoading,
  onConnect,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  onSelect,
  selectedConnectionId,
  theme,
  t,
}: ConnectionListProps) => {
  const isDark = theme === 'dark'

  const groups = useMemo(() => {
    const grouped = new Map<string, ConnectionRecord[]>()

    for (const connection of connections) {
      const key = connection.groupName ?? t.ungrouped
      const bucket = grouped.get(key)
      if (bucket) {
        bucket.push(connection)
      } else {
        grouped.set(key, [connection])
      }
    }

    return Array.from(grouped.entries())
  }, [connections, t.ungrouped])

  return (
    <aside
      className={`flex w-full flex-col border-b lg:w-[360px] lg:border-r lg:border-b-0 ${
        isDark ? 'border-white/10 bg-slate-900/60' : 'border-slate-200 bg-white/90'
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-5 py-4 ${
          isDark ? 'border-white/10' : 'border-slate-200'
        }`}
      >
        <div>
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {t.connections}
          </h2>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {t.savedSshEndpoints}
          </p>
        </div>
        <button
          type="button"
          className={`rounded-lg border px-3 py-2 text-sm transition ${
            isDark
              ? 'border-white/10 text-slate-200 hover:bg-white/5'
              : 'border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
          onClick={onCreate}
        >
          {t.add}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="space-y-3" aria-label="Loading connections">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className={`h-20 animate-pulse rounded-2xl border ${
                  isDark ? 'border-white/5 bg-white/5' : 'border-slate-200 bg-slate-100'
                }`}
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

        <div className="space-y-4">
          {groups.map(([groupName, groupConnections]) => (
            <section key={groupName}>
              <div className="mb-2 px-2">
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.25em] ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {groupName}
                </p>
              </div>

              <div className="space-y-2">
                {groupConnections.map((connection) => {
                  const isSelected = selectedConnectionId === connection.id
                  const activeCount = activeConnectionCounts[connection.id] ?? 0

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
                            <p className={`mt-1 truncate text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {formatConnectionSubtitle(connection)}
                            </p>
                          </div>
                        </div>
                      </button>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            isDark
                              ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
                              : 'bg-cyan-500 text-white hover:bg-cyan-600'
                          }`}
                          onClick={() => onConnect(connection)}
                        >
                          {t.connect}
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-3 py-1.5 text-xs transition ${
                            isDark
                              ? 'border-white/10 text-slate-200 hover:bg-white/5'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                          onClick={() => onEdit(connection)}
                        >
                          {t.edit}
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-3 py-1.5 text-xs transition ${
                            isDark
                              ? 'border-white/10 text-slate-200 hover:bg-white/5'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                          onClick={() => onDuplicate(connection)}
                        >
                          {t.duplicate}
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-3 py-1.5 text-xs transition ${
                            isDark
                              ? 'border-rose-500/20 text-rose-200 hover:bg-rose-500/10'
                              : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                          }`}
                          onClick={() => onDelete(connection)}
                        >
                          {t.delete}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </aside>
  )
}
