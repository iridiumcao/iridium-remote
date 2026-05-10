import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { appClient } from './api/client'
import { AboutDialog } from './components/AboutDialog'
import { ConnectionFormDialog } from './components/ConnectionFormDialog'
import { ConnectionList } from './components/ConnectionList'
import { DeleteConnectionDialog } from './components/DeleteConnectionDialog'
import { TerminalWorkspace } from './components/TerminalWorkspace'
import { ToolbarSelect } from './components/ToolbarSelect'
import { TransferDialog } from './components/TransferDialog'
import { PROJECT_URL, REPORT_ISSUE_URL } from './lib/appInfo'
import { collectGroupNames } from './lib/groups'
import { getLocaleDisplayName, getTranslations } from './lib/i18n'
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

type NoticeState = {
  isVisible: boolean
  message: string
  link?: {
    href: string
    label: string
  }
  autoDismissMs?: number
}

const NOTICE_AUTO_DISMISS_MS = 5_000
const NOTICE_EXIT_TRANSITION_MS = 300
const formatMenuSelectionLabel = (label: string, selected: boolean) =>
  selected ? `✓ ${label}` : label

const upsertSession = (sessions: SessionState[], nextState: SessionState) => {
  const existing = sessions.find((session) => session.sessionId === nextState.sessionId)
  if (!existing) {
    return [...sessions, nextState]
  }

  return sessions.map((session) =>
    session.sessionId === nextState.sessionId ? nextState : session,
  )
}

const findSessionById = (sessions: SessionState[], sessionId: string | null) =>
  sessionId ? sessions.find((session) => session.sessionId === sessionId) ?? null : null

const findOpenSessionForConnection = (
  sessions: SessionState[],
  connectionId: string,
  preferredSessionId: string | null,
) => {
  const preferredSession = findSessionById(sessions, preferredSessionId)
  if (preferredSession?.connectionId === connectionId) {
    return preferredSession
  }

  return sessions.find((session) => session.connectionId === connectionId) ?? null
}

function App() {
  const isTauriRuntime = appClient.isTauriRuntime()
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings)
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [sessions, setSessions] = useState<SessionState[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [editingConnection, setEditingConnection] = useState<ConnectionRecord | null>(null)
  const [connectionSeed, setConnectionSeed] = useState<ConnectionFormSeed | null>(null)
  const [isConnectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [connectionPendingDelete, setConnectionPendingDelete] = useState<ConnectionRecord | null>(
    null,
  )
  const [isAboutDialogOpen, setAboutDialogOpen] = useState(false)
  const [isTransferDialogOpen, setTransferDialogOpen] = useState(false)

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const settingsRef = useRef(settings)
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
    () => collectGroupNames(connections.map((connection) => connection.groupName)),
    [connections],
  )

  const noticeLink = notice?.link ?? null
  const languageOptions = useMemo(
    () => [
      { value: 'en', label: getLocaleDisplayName('en') },
      { value: 'zh-CN', label: getLocaleDisplayName('zh-CN') },
      { value: 'zh-TW', label: getLocaleDisplayName('zh-TW') },
    ],
    [],
  )
  const themeOptions = useMemo(
    () => [
      { value: 'dark', label: t.darkTheme },
      { value: 'light', label: t.lightTheme },
    ],
    [t.darkTheme, t.lightTheme],
  )

  const showNotice = useCallback((nextNotice: Omit<NoticeState, 'isVisible'>) => {
    setNotice({
      ...nextNotice,
      isVisible: true,
    })
  }, [])

  const hideNotice = useCallback(() => {
    setNotice((current) =>
      current
        ? {
            ...current,
            isVisible: false,
          }
        : null,
    )
  }, [])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  useEffect(() => {
    if (!notice?.autoDismissMs || !notice.isVisible) {
      return
    }

    const dismissTimer = window.setTimeout(() => {
      hideNotice()
    }, notice.autoDismissMs)

    return () => {
      window.clearTimeout(dismissTimer)
    }
  }, [hideNotice, notice])

  useEffect(() => {
    if (!notice || notice.isVisible) {
      return
    }

    const removeTimer = window.setTimeout(() => {
      setNotice((current) => (current === notice ? null : current))
    }, NOTICE_EXIT_TRANSITION_MS)

    return () => {
      window.clearTimeout(removeTimer)
    }
  }, [notice])

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
            setActiveSessionId((currentActive) => {
              if (currentActive !== sessionId) {
                return currentActive
              }

              const nextSessionId = next[0]?.sessionId ?? null
              const nextSession = findSessionById(next, nextSessionId)
              setSelectedConnectionId(nextSession?.connectionId ?? null)
              return nextSessionId
            })
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

  const handleCheckForUpdates = useCallback(async () => {
    try {
      setError(null)
      showNotice({ message: t.checkingForUpdates })

      const result = await appClient.checkForUpdates()
      if (result.updateAvailable && result.downloadUrl) {
        showNotice({
          message: t.updateAvailable(result.latestVersion, result.currentVersion),
          link: {
            href: result.downloadUrl,
            label: t.downloadUpdate(result.latestVersion),
          },
          autoDismissMs: NOTICE_AUTO_DISMISS_MS,
        })
        return
      }

      showNotice({
        message: t.updateUpToDate(result.currentVersion),
        autoDismissMs: NOTICE_AUTO_DISMISS_MS,
      })
    } catch (cause) {
      const normalized = appClient.normalizeError(cause)
      setNotice(null)
      setError({
        code: 'UPDATE_CHECK_FAILED',
        message: t.updateCheckFailed,
        details: normalized.message,
      })
    }
  }, [showNotice, t])

  const saveSettings = useCallback(async (nextSettings: AppSettings) => {
    try {
      setError(null)
      const savedSettings = await appClient.updateAppSettings(nextSettings)
      setSettings(savedSettings)
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }, [])

  const updateSettings = useCallback(
    (producer: (current: AppSettings) => AppSettings) => {
      const nextSettings = producer(settingsRef.current)
      void saveSettings(nextSettings)
    },
    [saveSettings],
  )

  const refreshConnections = async () => {
    const loadedConnections = await appClient.listConnections()
    setConnections(loadedConnections)

    if (!loadedConnections.some((connection) => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(loadedConnections[0]?.id ?? null)
    }
  }

  const selectSession = useCallback(
    (sessionId: string | null, availableSessions: SessionState[] = sessions) => {
      setActiveSessionId(sessionId)

      const nextSession = findSessionById(availableSessions, sessionId)
      if (nextSession) {
        setSelectedConnectionId(nextSession.connectionId)
      } else if (sessionId === null && availableSessions.length === 0) {
        setSelectedConnectionId(null)
      }
    },
    [sessions],
  )

  const selectConnection = useCallback(
    (connectionId: string) => {
      setSelectedConnectionId(connectionId)

      const matchingSession = findOpenSessionForConnection(sessions, connectionId, activeSessionId)
      if (matchingSession) {
        setActiveSessionId(matchingSession.sessionId)
      }
    },
    [activeSessionId, sessions],
  )

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

  const connectToConnection = useCallback(async (connection: ConnectionRecord) => {
    try {
      setError(null)
      setNotice(null)
      setSelectedConnectionId(connection.id)
      const nextState = await appClient.connectSession(connection.id)
      setSessions((current) => {
        const nextSessions = upsertSession(current, nextState)
        selectSession(nextState.sessionId, nextSessions)
        return nextSessions
      })
    } catch (cause) {
      setError(appClient.normalizeError(cause))
    }
  }, [selectSession])

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
        setActiveSessionId((currentActive) => {
          if (currentActive !== sessionId) {
            return currentActive
          }

          const nextSessionId = next[0]?.sessionId ?? null
          const nextSession = findSessionById(next, nextSessionId)
          setSelectedConnectionId(nextSession?.connectionId ?? null)
          return nextSessionId
        })
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
      showNotice({ message: result.message })
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
      showNotice({ message: t.exportConnectionsSuccess })
    } catch (cause) {
      setError(appClient.normalizeError(cause))
      showNotice({ message: t.exportConnectionsFailed })
    }
  }, [showNotice, t.exportConnectionsFailed, t.exportConnectionsSuccess])

  const handleImportConnections = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const handleSelectLocale = useCallback(
    (locale: AppSettings['locale']) => {
      updateSettings((current) => ({ ...current, locale }))
    },
    [updateSettings],
  )

  const handleSelectTheme = useCallback(
    (theme: AppSettings['theme']) => {
      updateSettings((current) => ({ ...current, theme }))
    },
    [updateSettings],
  )

  useEffect(() => {
    if (!isTauriRuntime) {
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
            text: t.menuSettings,
            items: [
              {
                text: t.language,
                items: languageOptions.map((option) => ({
                  id: `settings-locale-${option.value}`,
                  text: formatMenuSelectionLabel(option.label, settings.locale === option.value),
                  action: () => {
                    if (!disposed) {
                      handleSelectLocale(option.value as AppSettings['locale'])
                    }
                  },
                })),
              },
              {
                text: t.theme,
                items: themeOptions.map((option) => ({
                  id: `settings-theme-${option.value}`,
                  text: formatMenuSelectionLabel(option.label, settings.theme === option.value),
                  action: () => {
                    if (!disposed) {
                      handleSelectTheme(option.value as AppSettings['theme'])
                    }
                  },
                })),
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
                id: 'check-for-update',
                text: t.menuCheckForUpdate,
                action: () => {
                  if (!disposed) {
                    void handleCheckForUpdates()
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
  }, [
    handleCheckForUpdates,
    handleExitApp,
    handleExportConnections,
    handleImportConnections,
    handleSelectLocale,
    handleSelectTheme,
    isTauriRuntime,
    languageOptions,
    openCreateDialog,
    openExternalUrl,
    settings.locale,
    settings.theme,
    t,
    themeOptions,
  ])

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
      showNotice(
        {
          message: getTranslations(nextSettings.locale).importConnectionsSuccess(
            result.imported,
            result.skipped,
            result.settingsApplied,
          ),
        },
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

  const sidebarTopContent = (
    <div className="space-y-4">
      <div>
        <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${isDark ? 'text-cyan-300' : 'text-cyan-600'}`}>
          {t.appTagline}
        </p>
        <h1 className={`mt-2 text-2xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {t.appTitle}
        </h1>
      </div>

      {!isTauriRuntime ? (
        <div className="flex flex-wrap items-center gap-3">
          <ToolbarSelect
            isDark={isDark}
            label={t.language}
            onChange={(value) => {
              handleSelectLocale(value as AppSettings['locale'])
            }}
            options={languageOptions}
            value={settings.locale}
          />

          <ToolbarSelect
            isDark={isDark}
            label={t.theme}
            onChange={(value) => {
              handleSelectTheme(value as AppSettings['theme'])
            }}
            options={themeOptions}
            value={settings.theme}
          />
        </div>
      ) : null}
    </div>
  )

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
            aria-live="polite"
            className={`overflow-hidden transition-all duration-300 ease-out ${
              notice.isVisible ? 'max-h-24 translate-y-0 opacity-100' : 'max-h-0 -translate-y-2 opacity-0'
            }`}
            data-testid="app-notice"
          >
            <div
              className={`border-b px-5 py-3 text-sm sm:px-6 ${
                isDark
                  ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100'
                  : 'border-cyan-200 bg-cyan-50 text-cyan-700'
              }`}
            >
              <span>{notice.message}</span>
              {noticeLink ? (
                <button
                  type="button"
                  className={`ml-3 font-semibold underline underline-offset-2 ${
                    isDark ? 'text-cyan-200 hover:text-cyan-100' : 'text-cyan-700 hover:text-cyan-900'
                  }`}
                  onClick={() => {
                    void openExternalUrl(noticeLink.href)
                  }}
                >
                  {noticeLink.label}
                </button>
              ) : null}
            </div>
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
            onSelect={selectConnection}
            onToggleGroup={handleToggleGroup}
            searchQuery={searchQuery}
            selectedConnectionId={selectedConnectionId}
            topContent={sidebarTopContent}
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
            onSelectSession={selectSession}
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
