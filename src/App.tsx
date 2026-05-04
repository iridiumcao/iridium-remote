import { useEffect, useMemo, useState } from 'react'
import { appClient } from './api/client'
import { ConnectionFormDialog } from './components/ConnectionFormDialog'
import { ConnectionList } from './components/ConnectionList'
import { DeleteConnectionDialog } from './components/DeleteConnectionDialog'
import { TerminalWorkspace } from './components/TerminalWorkspace'
import type {
  AppError,
  ConnectionRecord,
  CreateConnectionInput,
  SessionState,
  UpdateConnectionInput,
} from './lib/types'

const idleSessionState: SessionState = {
  connectionId: null,
  status: 'idle',
}

function App() {
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>(idleSessionState)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [editingConnection, setEditingConnection] = useState<ConnectionRecord | null>(null)
  const [isConnectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [connectionPendingDelete, setConnectionPendingDelete] = useState<ConnectionRecord | null>(
    null,
  )

  const selectedConnection = useMemo(() => {
    const id = sessionState.connectionId ?? selectedConnectionId
    return connections.find((connection) => connection.id === id) ?? null
  }, [connections, selectedConnectionId, sessionState.connectionId])

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const [loadedConnections, loadedSession] = await Promise.all([
          appClient.listConnections(),
          appClient.getSessionState(),
        ])

        if (!active) {
          return
        }

        setConnections(loadedConnections)
        setSessionState(loadedSession)

        if (loadedSession.connectionId) {
          setSelectedConnectionId(loadedSession.connectionId)
        } else if (loadedConnections[0]) {
          setSelectedConnectionId(loadedConnections[0].id)
        }
      } catch (cause) {
        if (active) {
          setError(appClient.normalizeError(cause))
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    const subscribe = async () => {
      const unlistenSession = await appClient.onSessionState((nextState) => {
        setSessionState(nextState)

        if (nextState.connectionId) {
          setSelectedConnectionId(nextState.connectionId)
        }
      })

      return () => {
        void unlistenSession()
      }
    }

    const unsubscribePromise = subscribe()
    void load()

    return () => {
      active = false
      void unsubscribePromise.then((unsubscribe) => unsubscribe())
    }
  }, [])

  const refreshConnections = async () => {
    const loadedConnections = await appClient.listConnections()
    setConnections(loadedConnections)

    if (!loadedConnections.some((connection) => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(loadedConnections[0]?.id ?? null)
    }
  }

  const openCreateDialog = () => {
    setEditingConnection(null)
    setConnectionDialogOpen(true)
  }

  const openEditDialog = (connection: ConnectionRecord) => {
    setEditingConnection(connection)
    setConnectionDialogOpen(true)
  }

  const closeConnectionDialog = () => {
    setConnectionDialogOpen(false)
    setEditingConnection(null)
  }

  const saveConnection = async (
    input: CreateConnectionInput | UpdateConnectionInput,
  ) => {
    try {
      setError(null)

      if ('id' in input) {
        await appClient.updateConnection(input)
      } else {
        await appClient.createConnection(input)
      }

      await refreshConnections()
      closeConnectionDialog()
    } catch (cause) {
      setError(appClient.normalizeError(cause))
      throw cause
    }
  }

  const confirmDeleteConnection = async () => {
    if (!connectionPendingDelete) {
      return
    }

    try {
      setError(null)
      await appClient.deleteConnection(connectionPendingDelete.id)
      await refreshConnections()

      if (selectedConnectionId === connectionPendingDelete.id) {
        setSelectedConnectionId(null)
      }

      setConnectionPendingDelete(null)
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }

  const connectToConnection = async (connection: ConnectionRecord) => {
    try {
      setError(null)
      setSelectedConnectionId(connection.id)
      const nextState = await appClient.connectSession(connection.id)
      setSessionState(nextState)
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }

  const disconnectSession = async () => {
    try {
      setError(null)
      const nextState = await appClient.disconnectSession()
      setSessionState(nextState)
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Another Remote Tool
            </p>
            <h1 className="text-2xl font-semibold text-white">Iridium Remote</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300 sm:block">
              {sessionState.message ?? 'Ready'}
            </div>
            <button
              type="button"
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              onClick={openCreateDialog}
            >
              New Connection
            </button>
          </div>
        </header>

        {error ? (
          <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-100 sm:px-6">
            {error.message}
            {error.details ? (
              <span className="ml-2 text-rose-200/80">{error.details}</span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          <ConnectionList
            activeConnectionId={sessionState.connectionId}
            connections={connections}
            isLoading={isLoading}
            onConnect={connectToConnection}
            onCreate={openCreateDialog}
            onDelete={setConnectionPendingDelete}
            onEdit={openEditDialog}
            onSelect={setSelectedConnectionId}
            selectedConnectionId={selectedConnectionId}
          />

          <TerminalWorkspace
            connection={selectedConnection}
            onConnect={selectedConnection ? () => connectToConnection(selectedConnection) : undefined}
            onDisconnect={
              sessionState.status === 'connecting' || sessionState.status === 'connected'
                ? disconnectSession
                : undefined
            }
            sessionState={sessionState}
          />
        </div>
      </div>

      {isConnectionDialogOpen ? (
        <ConnectionFormDialog
          key={editingConnection?.id ?? 'new'}
          connection={editingConnection}
          onClose={closeConnectionDialog}
          onSave={saveConnection}
        />
      ) : null}

      {connectionPendingDelete ? (
        <DeleteConnectionDialog
          connection={connectionPendingDelete}
          onCancel={() => setConnectionPendingDelete(null)}
          onConfirm={confirmDeleteConnection}
          open
        />
      ) : null}
    </main>
  )
}

export default App
