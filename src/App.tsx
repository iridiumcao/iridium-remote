import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  AppSettings,
  ConnectionFormSeed,
  ConnectionRecord,
  ConnectionsExportPayload,
  CreateConnectionInput,
  FileTransferInput,
  SessionState,
  UpdateConnectionInput,
} from './lib/types'
import { defaultAppSettings } from './lib/types'

const PROJECT_URL = 'https://github.com/iridiumcao/iridium-remote'
const REPORT_ISSUE_URL = 'https://github.com/iridiumcao/iridium-remote/issues'

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
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings)
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [sessions, setSessions] = useState<SessionState[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
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

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const t = useMemo(() => getTranslations(settings.locale), [settings.locale])
  const isDark = settings.theme === 'dark'

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

  const existingGroups = useMemo(
    () =>
      Array.from(
        new Set(
          connections
            .map((connection) => connection.groupName?.trim())
            .filter((groupName): groupName is string => Boolean(groupName)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [connections],
  )

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) {
        return
      }

      if (event.target.closest('[data-allow-native-context-menu="true"]')) {
        return
      }

      event.preventDefault()
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const [loadedConnections, loadedSessions, loadedSettings] = await Promise.all([
          appClient.listConnections(),
          appClient.getSessionStates(),
          appClient.getAppSettings(),
        ])

        if (!active) {
          return
        }

        setConnections(loadedConnections)
        setSessions(loadedSessions)
        setSettings(loadedSettings)
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

  const openExternalUrl = useCallback(async (url: string) => {
    try {
      setError(null)
      await appClient.openExternalUrl(url)
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }, [])

  const handleExitApp = useCallback(async () => {
    try {
      setError(null)
      await appClient.closeCurrentWindow()
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }, [])

  const saveSettings = async (nextSettings: AppSettings) => {
    try {
      setError(null)
      const savedSettings = await appClient.updateAppSettings(nextSettings)
      setSettings(savedSettings)
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }

  const updateSettings = (producer: (current: AppSettings) => AppSettings) => {
    const nextSettings = producer(settings)
    void saveSettings(nextSettings)
  }

  const refreshConnections = async () => {
    const loadedConnections = await appClient.listConnections()
    setConnections(loadedConnections)

    if (!loadedConnections.some((connection) => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(loadedConnections[0]?.id ?? null)
    }
  }

  const openCreateDialog = useCallback(() => {
    setEditingConnection(null)
    setConnectionSeed(null)
    setConnectionDialogOpen(true)
  }, [])

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

  const handleExportConnections = useCallback(async () => {
    try {
      setError(null)
      setNotice(null)
      const payload = await appClient.exportConnections()
      const saved = await appClient.saveExportConnections(payload)
      if (!saved) {
        return
      }
      setNotice(t.exportConnectionsSuccess)
    } catch (cause) {
      setError(appClient.normalizeError(cause))
      setNotice(t.exportConnectionsFailed)
    }
  }, [t.exportConnectionsFailed, t.exportConnectionsSuccess])

  const handleImportConnections = useCallback(() => {
    importInputRef.current?.click()
  }, [])

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
              {
                id: 'import-connections',
                text: t.importConnections,
                action: () => {
                  if (!disposed) {
                    handleImportConnections()
                  }
                },
              },
              {
                id: 'export-connections',
                text: t.exportConnections,
                action: () => {
                  if (!disposed) {
                    void handleExportConnections()
                  }
                },
              },
              {
                id: 'exit',
                text: t.exit,
                action: () => {
                  if (!disposed) {
                    void handleExitApp()
                  }
                },
              },
            ],
          },
          {
            text: t.menuHelp,
            items: [
              {
                id: 'star-github',
                text: t.menuStarOnGitHub,
                action: () => {
                  if (!disposed) {
                    void openExternalUrl(PROJECT_URL)
                  }
                },
              },
              {
                id: 'report-issue',
                text: t.menuReportIssue,
                action: () => {
                  if (!disposed) {
                    void openExternalUrl(REPORT_ISSUE_URL)
                  }
                },
              },
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
  }, [handleExitApp, handleExportConnections, handleImportConnections, openCreateDialog, openExternalUrl, t])

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      setError(null)
      const text = await file.text()
      const payload = JSON.parse(text) as ConnectionsExportPayload
      const result = await appClient.importConnections(payload)
      await refreshConnections()
      const nextSettings = await appClient.getAppSettings()
      setSettings(nextSettings)
      setNotice(
        getTranslations(nextSettings.locale).importConnectionsSuccess(
          result.imported,
          result.skipped,
          result.settingsApplied,
        ),
      )
    } catch {
      setError({
        code: 'VALIDATION_ERROR',
        message: t.importConnectionsFailed,
      })
    }
  }

  const handleToggleGroup = (groupKey: string) => {
    updateSettings((current) => {
      const collapsedGroups = current.collapsedGroups.includes(groupKey)
        ? current.collapsedGroups.filter((value) => value !== groupKey)
        : [...current.collapsedGroups, groupKey]

      return {
        ...current,
        collapsedGroups,
      }
    })
  }

  return (
    <main className={`h-screen overflow-hidden ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      <input
        ref={importInputRef}
        accept="application/json"
        className="hidden"
        onChange={(event) => {
          void handleImportFileChange(event)
        }}
        type="file"
      />

      <div className="mx-auto flex h-full max-w-[1800px] min-h-0 flex-col overflow-hidden">
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
            <label className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <span className="mr-2">{t.language}</span>
              <select
                className={`rounded-lg border px-3 py-2 ${
                  isDark
                    ? 'border-white/10 bg-slate-900 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
                onChange={(event) =>
                  updateSettings((current) => ({ ...current, locale: event.target.value as AppSettings['locale'] }))
                }
                value={settings.locale}
              >
                <option value="en">{t.english}</option>
                <option value="zh-CN">{t.simplifiedChinese}</option>
                <option value="zh-TW">{t.traditionalChinese}</option>
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
                onChange={(event) =>
                  updateSettings((current) => ({ ...current, theme: event.target.value as AppSettings['theme'] }))
                }
                value={settings.theme}
              >
                <option value="dark">{t.darkTheme}</option>
                <option value="light">{t.lightTheme}</option>
              </select>
            </label>

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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <ConnectionList
            activeConnectionCounts={activeConnectionCounts}
            collapsedGroups={settings.collapsedGroups}
            connections={connections}
            displayMode={settings.connectionListDisplayMode}
            isLoading={isLoading}
            onConnect={connectToConnection}
            onCreate={openCreateDialog}
            onDelete={setConnectionPendingDelete}
            onDisplayModeChange={(mode) =>
              updateSettings((current) => ({
                ...current,
                connectionListDisplayMode: mode,
              }))
            }
            onDuplicate={openDuplicateDialog}
            onEdit={openEditDialog}
            onSearchChange={setSearchQuery}
            onSelect={setSelectedConnectionId}
            onToggleGroup={handleToggleGroup}
            searchQuery={searchQuery}
            selectedConnectionId={selectedConnectionId}
            t={t}
            theme={settings.theme}
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
            theme={settings.theme}
          />
        </div>
      </div>

      {isConnectionDialogOpen ? (
        <ConnectionFormDialog
          connection={editingConnection}
          existingGroups={existingGroups}
          initialValues={connectionSeed}
          onClose={closeConnectionDialog}
          onSave={saveConnection}
          t={t}
          theme={settings.theme}
        />
      ) : null}

      {connectionPendingDelete ? (
        <DeleteConnectionDialog
          connection={connectionPendingDelete}
          onCancel={() => setConnectionPendingDelete(null)}
          onConfirm={confirmDeleteConnection}
          open
          t={t}
          theme={settings.theme}
        />
      ) : null}

      <AboutDialog
        onClose={() => setAboutDialogOpen(false)}
        onOpenProjectUrl={() => {
          void openExternalUrl(PROJECT_URL)
        }}
        open={isAboutDialogOpen}
        projectUrl={PROJECT_URL}
        t={t}
        theme={settings.theme}
      />

      {isTransferDialogOpen && activeConnection ? (
        <TransferDialog
          connectionId={activeConnection.id}
          connectionName={activeConnection.name}
          onClose={() => setTransferDialogOpen(false)}
          onTransfer={handleTransfer}
          open
          t={t}
          theme={settings.theme}
        />
      ) : null}
    </main>
  )
}

export default App
