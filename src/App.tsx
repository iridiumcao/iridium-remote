import { useEffect, useMemo, useState } from 'react'
import { appClient } from './api/client'
import { AboutDialog } from './components/AboutDialog'
import { ConnectionFormDialog } from './components/ConnectionFormDialog'
import { ConnectionList } from './components/ConnectionList'
import { DeleteConnectionDialog } from './components/DeleteConnectionDialog'
import { TerminalWorkspace } from './components/TerminalWorkspace'
import { TransferDialog } from './components/TransferDialog'
import { getTranslations } from './lib/i18n'
import type {
  AppError,
  AppTheme,
  ConnectionFormSeed,
  ConnectionRecord,
  CreateConnectionInput,
  FileTransferInput,
  Locale,
  SessionState,
  UpdateConnectionInput,
} from './lib/types'

const LOCALE_STORAGE_KEY = 'iridium-remote.locale'
const THEME_STORAGE_KEY = 'iridium-remote.theme'

const loadLocale = (): Locale => {
  if (typeof window === 'undefined') {
    return 'en'
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  return stored === 'zh-CN' ? 'zh-CN' : 'en'
}

const loadTheme = (): AppTheme => {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

const upsertSession = (sessions: SessionState[], nextState: SessionState) => {
  const existing = sessions.find((session) => session.sessionId === nextState.sessionId)
  if (!existing) {
    return [...sessions, nextState]
  }

  return sessions.map((session) =>
    session.sessionId === nextState.sessionId ? nextState : session,
  )
}

function App() {
  const [locale, setLocale] = useState<Locale>(loadLocale)
  const [theme, setTheme] = useState<AppTheme>(loadTheme)
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [sessions, setSessions] = useState<SessionState[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingConnection, setEditingConnection] = useState<ConnectionRecord | null>(null)
  const [connectionSeed, setConnectionSeed] = useState<ConnectionFormSeed | null>(null)
  const [isConnectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [connectionPendingDelete, setConnectionPendingDelete] = useState<ConnectionRecord | null>(
    null,
  )
  const [isAboutDialogOpen, setAboutDialogOpen] = useState(false)
  const [isTransferDialogOpen, setTransferDialogOpen] = useState(false)

  const t = useMemo(() => getTranslations(locale), [locale])

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === activeSessionId) ?? null,
    [activeSessionId, sessions],
  )

  const activeConnection = useMemo(
    () =>
      activeSession
        ? connections.find((connection) => connection.id === activeSession.connectionId) ?? null
        : null,
    [activeSession, connections],
  )

  const selectedConnection = useMemo(
    () =>
      connections.find((connection) => connection.id === selectedConnectionId) ??
      activeConnection ??
      null,
    [activeConnection, connections, selectedConnectionId],
  )

  const activeConnectionCounts = useMemo(() => {
    return sessions.reduce<Record<string, number>>((counts, session) => {
      counts[session.connectionId] = (counts[session.connectionId] ?? 0) + 1
      return counts
    }, {})
  }, [sessions])

  const headerStatus = activeSession?.message ?? notice ?? t.ready
  const isDark = theme === 'dark'

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const [loadedConnections, loadedSessions] = await Promise.all([
          appClient.listConnections(),
          appClient.getSessionStates(),
        ])

        if (!active) {
          return
        }

        setConnections(loadedConnections)
        setSessions(loadedSessions)
        setActiveSessionId(loadedSessions[0]?.sessionId ?? null)
        setSelectedConnectionId(loadedSessions[0]?.connectionId ?? loadedConnections[0]?.id ?? null)
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
      const [unlistenSession, unlistenRemoved] = await Promise.all([
        appClient.onSessionState((nextState) => {
          setSessions((current) => upsertSession(current, nextState))
          setActiveSessionId(nextState.sessionId)
          setSelectedConnectionId(nextState.connectionId)
        }),
        appClient.onSessionRemoved(({ sessionId }) => {
          setSessions((current) => {
            const next = current.filter((session) => session.sessionId !== sessionId)
            setActiveSessionId((currentActive) =>
              currentActive === sessionId ? next[0]?.sessionId ?? null : currentActive,
            )
            return next
          })
        }),
      ])

      return () => {
        void unlistenSession()
        void unlistenRemoved()
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

  function openCreateDialog() {
    setEditingConnection(null)
    setConnectionSeed(null)
    setConnectionDialogOpen(true)
  }

  const openDuplicateDialog = (connection: ConnectionRecord) => {
    setEditingConnection(null)
    setConnectionSeed({
      name: t.copyOf(connection.name),
      groupName: connection.groupName,
      host: connection.host,
      port: connection.port,
      username: connection.username,
    })
    setConnectionDialogOpen(true)
  }

  const openEditDialog = (connection: ConnectionRecord) => {
    setEditingConnection(connection)
    setConnectionSeed(null)
    setConnectionDialogOpen(true)
  }

  const closeConnectionDialog = () => {
    setConnectionDialogOpen(false)
    setEditingConnection(null)
    setConnectionSeed(null)
  }

  const saveConnection = async (input: CreateConnectionInput | UpdateConnectionInput) => {
    try {
      setError(null)
      setNotice(null)

      const saved =
        'id' in input
          ? await appClient.updateConnection(input)
          : await appClient.createConnection(input)

      await refreshConnections()
      setSelectedConnectionId(saved.id)
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
      setNotice(null)
      await appClient.deleteConnection(connectionPendingDelete.id)
      await refreshConnections()
      setSessions((current) =>
        current.filter((session) => session.connectionId !== connectionPendingDelete.id),
      )

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
      setNotice(null)
      setSelectedConnectionId(connection.id)
      const nextState = await appClient.connectSession(connection.id)
      setSessions((current) => upsertSession(current, nextState))
      setActiveSessionId(nextState.sessionId)
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }

  const disconnectSession = async (sessionId: string) => {
    try {
      setError(null)
      setNotice(null)
      const nextState = await appClient.disconnectSession(sessionId)
      setSessions((current) => upsertSession(current, nextState))
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }

  const closeSession = async (sessionId: string) => {
    try {
      setError(null)
      await appClient.closeSession(sessionId)
      setSessions((current) => {
        const next = current.filter((session) => session.sessionId !== sessionId)
        setActiveSessionId((currentActive) =>
          currentActive === sessionId ? next[0]?.sessionId ?? null : currentActive,
        )
        return next
      })
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }

  useEffect(() => {
    if (!appClient.isTauriRuntime()) {
      return
    }

    let disposed = false

    const setupMenu = async () => {
      const { Menu } = await import('@tauri-apps/api/menu')

      const menu = await Menu.new({
        items: [
          {
            text: t.menuFile,
            items: [
              {
                id: 'new-connection',
                text: t.menuNewConnection,
                action: () => {
                  if (!disposed) {
                    openCreateDialog()
                  }
                },
              },
            ],
          },
          {
            text: t.menuHelp,
            items: [
              {
                id: 'about',
                text: t.menuAbout,
                action: () => {
                  if (!disposed) {
                    setAboutDialogOpen(true)
                  }
                },
              },
            ],
          },
        ],
      })

      await menu.setAsAppMenu()
    }

    void setupMenu()

    return () => {
      disposed = true
    }
  }, [t])

  const handleTransfer = async (input: Omit<FileTransferInput, 'connectionId'>) => {
    if (!activeConnection) {
      return
    }

    try {
      setError(null)
      const result = await appClient.transferFile({
        connectionId: activeConnection.id,
        ...input,
      })
      setNotice(result.message)
    } catch (cause) {
      const normalized = appClient.normalizeError(cause)
      throw new Error(normalized.message, { cause })
    }
  }

  return (
    <main className={`min-h-screen ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col">
        <header
          className={`flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 sm:px-6 ${
            isDark ? 'border-white/10 bg-slate-950' : 'border-slate-200 bg-white'
          }`}
        >
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${isDark ? 'text-cyan-300' : 'text-cyan-600'}`}>
              {t.appTagline}
            </p>
            <h1 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {t.appTitle}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`hidden rounded-full border px-3 py-1 text-sm sm:block ${
                isDark
                  ? 'border-white/10 bg-white/5 text-slate-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              {headerStatus}
            </div>

            <label className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <span className="mr-2">{t.language}</span>
              <select
                className={`rounded-lg border px-3 py-2 ${
                  isDark
                    ? 'border-white/10 bg-slate-900 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
                onChange={(event) => setLocale(event.target.value as Locale)}
                value={locale}
              >
                <option value="en">{t.english}</option>
                <option value="zh-CN">{t.simplifiedChinese}</option>
              </select>
            </label>

            <label className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <span className="mr-2">{t.theme}</span>
              <select
                className={`rounded-lg border px-3 py-2 ${
                  isDark
                    ? 'border-white/10 bg-slate-900 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
                onChange={(event) => setTheme(event.target.value as AppTheme)}
                value={theme}
              >
                <option value="dark">{t.darkTheme}</option>
                <option value="light">{t.lightTheme}</option>
              </select>
            </label>

            <button
              type="button"
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                isDark
                  ? 'border-white/10 text-slate-200 hover:bg-white/5'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => setAboutDialogOpen(true)}
            >
              {t.menuAbout}
            </button>
            <button
              type="button"
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              onClick={openCreateDialog}
            >
              {t.newConnection}
            </button>
          </div>
        </header>

        {error ? (
          <div
            className={`border-b px-5 py-3 text-sm sm:px-6 ${
              isDark
                ? 'border-rose-500/20 bg-rose-500/10 text-rose-100'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {error.message}
            {error.details ? (
              <span className={`ml-2 ${isDark ? 'text-rose-200/80' : 'text-rose-600'}`}>
                {error.details}
              </span>
            ) : null}
          </div>
        ) : null}

        {!error && notice ? (
          <div
            className={`border-b px-5 py-3 text-sm sm:px-6 ${
              isDark
                ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100'
                : 'border-cyan-200 bg-cyan-50 text-cyan-700'
            }`}
          >
            {notice}
          </div>
        ) : null}

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          <ConnectionList
            activeConnectionCounts={activeConnectionCounts}
            connections={connections}
            isLoading={isLoading}
            onConnect={connectToConnection}
            onCreate={openCreateDialog}
            onDelete={setConnectionPendingDelete}
            onDuplicate={openDuplicateDialog}
            onEdit={openEditDialog}
            onSelect={setSelectedConnectionId}
            selectedConnectionId={selectedConnectionId}
            t={t}
            theme={theme}
          />

          <TerminalWorkspace
            activeConnection={activeConnection}
            activeSession={activeSession}
            onCloseSession={closeSession}
            onConnect={selectedConnection ? () => connectToConnection(selectedConnection) : undefined}
            onDisconnect={disconnectSession}
            onOpenTransfer={activeConnection ? () => setTransferDialogOpen(true) : undefined}
            onSelectSession={setActiveSessionId}
            selectedConnection={selectedConnection}
            sessions={sessions}
            t={t}
            theme={theme}
          />
        </div>
      </div>

      {isConnectionDialogOpen ? (
        <ConnectionFormDialog
          connection={editingConnection}
          initialValues={connectionSeed}
          onClose={closeConnectionDialog}
          onSave={saveConnection}
          t={t}
          theme={theme}
        />
      ) : null}

      {connectionPendingDelete ? (
        <DeleteConnectionDialog
          connection={connectionPendingDelete}
          onCancel={() => setConnectionPendingDelete(null)}
          onConfirm={confirmDeleteConnection}
          open
          t={t}
          theme={theme}
        />
      ) : null}

      <AboutDialog open={isAboutDialogOpen} onClose={() => setAboutDialogOpen(false)} t={t} theme={theme} />

      {isTransferDialogOpen && activeConnection ? (
        <TransferDialog
          connectionName={activeConnection.name}
          onClose={() => setTransferDialogOpen(false)}
          onTransfer={handleTransfer}
          open
          t={t}
          theme={theme}
        />
      ) : null}
    </main>
  )
}

export default App
