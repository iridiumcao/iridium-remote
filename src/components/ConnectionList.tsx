import { formatConnectionSubtitle } from '../lib/format'
import type { ConnectionRecord } from '../lib/types'

type ConnectionListProps = {
  connections: ConnectionRecord[]
  isLoading: boolean
  selectedConnectionId: string | null
  activeConnectionId: string | null
  onConnect: (connection: ConnectionRecord) => void
  onCreate: () => void
  onDelete: (connection: ConnectionRecord) => void
  onEdit: (connection: ConnectionRecord) => void
  onSelect: (connectionId: string) => void
}

export const ConnectionList = ({
  activeConnectionId,
  connections,
  isLoading,
  onConnect,
  onCreate,
  onDelete,
  onEdit,
  onSelect,
  selectedConnectionId,
}: ConnectionListProps) => (
  <aside className="flex w-full flex-col border-b border-white/10 bg-slate-900/60 lg:w-[320px] lg:border-r lg:border-b-0">
    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Connections</h2>
        <p className="text-sm text-slate-400">Saved SSH endpoints</p>
      </div>
      <button
        type="button"
        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5"
        onClick={onCreate}
      >
        Add
      </button>
    </div>

    <div className="flex-1 overflow-y-auto px-3 py-3">
      {isLoading ? (
        <div className="space-y-3" aria-label="Loading connections">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-2xl border border-white/5 bg-white/5"
            />
          ))}
        </div>
      ) : null}

      {!isLoading && connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 px-4 py-6 text-center">
          <p className="text-base font-medium text-white">No saved connections yet</p>
          <p className="mt-2 text-sm text-slate-400">
            Create your first server profile to open a terminal session.
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            onClick={onCreate}
          >
            Create Connection
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        {connections.map((connection) => {
          const isSelected = selectedConnectionId === connection.id
          const isActive = activeConnectionId === connection.id

          return (
            <button
              key={connection.id}
              type="button"
              className={`w-full rounded-2xl border p-4 text-left transition ${
                isSelected || isActive
                  ? 'border-cyan-400/60 bg-cyan-400/10 shadow-lg shadow-cyan-950/30'
                  : 'border-white/10 bg-slate-950/50 hover:border-white/20 hover:bg-white/5'
              }`}
              onClick={() => {
                onSelect(connection.id)
                onConnect(connection)
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-semibold text-white">
                      {connection.name}
                    </p>
                    {isActive ? (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-400">
                    {formatConnectionSubtitle(connection)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/5"
                    onClick={(event) => {
                      event.stopPropagation()
                      onEdit(connection)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-rose-200 transition hover:bg-rose-500/10"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDelete(connection)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  </aside>
)
