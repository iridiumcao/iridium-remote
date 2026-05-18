import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { formatStorageBytes } from '../lib/format'
import type { getTranslations } from '../lib/i18n'
import type {
  AppTheme,
  Locale,
  SessionLogFileInfo,
  SessionLogPreview,
  SessionRecordingStatus,
} from '../lib/types'

type SessionLogsWorkspaceProps = {
  active: boolean
  locale: Locale
  onExport: (paths: string[], password: string) => Promise<boolean>
  onListLogs: () => Promise<SessionLogFileInfo[]>
  onOpenFolder: () => void
  onPreview: (paths: string[], password: string) => Promise<SessionLogPreview>
  status: SessionRecordingStatus | null
  t: ReturnType<typeof getTranslations>
  theme: AppTheme
  topContent?: ReactNode
}

type LogSource = {
  key: string
  label: string
  host: string
  username: string
  files: SessionLogFileInfo[]
  latestCreatedAt: string
}

type UiState = {
  password: string
  preview: SessionLogPreview | null
  error: string | null
  isLoading: boolean
  isWorking: boolean
}

type UiAction =
  | { type: 'clearSensitive' }
  | { type: 'clearPreviewError' }
  | { type: 'setError'; error: string | null }
  | { type: 'setIsLoading'; isLoading: boolean }
  | { type: 'setIsWorking'; isWorking: boolean }
  | { type: 'setPassword'; password: string }
  | { type: 'setPreview'; preview: SessionLogPreview | null }

const initialUiState: UiState = {
  password: '',
  preview: null,
  error: null,
  isLoading: false,
  isWorking: false,
}

const uiReducer = (state: UiState, action: UiAction): UiState => {
  switch (action.type) {
    case 'clearSensitive':
      return {
        ...state,
        password: '',
        preview: null,
        error: null,
        isWorking: false,
      }
    case 'clearPreviewError':
      return {
        ...state,
        preview: null,
        error: null,
      }
    case 'setError':
      return {
        ...state,
        error: action.error,
      }
    case 'setIsLoading':
      return {
        ...state,
        isLoading: action.isLoading,
      }
    case 'setIsWorking':
      return {
        ...state,
        isWorking: action.isWorking,
      }
    case 'setPassword':
      return {
        ...state,
        password: action.password,
      }
    case 'setPreview':
      return {
        ...state,
        preview: action.preview,
        error: null,
      }
    default:
      return state
  }
}

const sourceKeyOf = (file: Pick<SessionLogFileInfo, 'host' | 'username'>) => `${file.username}@${file.host}`

const formatLogTimestamp = (value: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

export const SessionLogsWorkspace = ({
  active,
  locale,
  onExport,
  onListLogs,
  onOpenFolder,
  onPreview,
  status,
  t,
  theme,
  topContent,
}: SessionLogsWorkspaceProps) => {
  const [files, setFiles] = useState<SessionLogFileInfo[]>([])
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [uiState, dispatch] = useReducer(uiReducer, initialUiState)
  const { password, preview, error, isLoading, isWorking } = uiState
  const isDark = theme === 'dark'

  const sources = useMemo<LogSource[]>(() => {
    const grouped = new Map<string, LogSource>()
    for (const file of files) {
      const key = sourceKeyOf(file)
      const existing = grouped.get(key)
      if (existing) {
        existing.files.push(file)
        if (file.createdAt > existing.latestCreatedAt) {
          existing.latestCreatedAt = file.createdAt
        }
      } else {
        grouped.set(key, {
          key,
          label: key,
          host: file.host,
          username: file.username,
          files: [file],
          latestCreatedAt: file.createdAt,
        })
      }
    }

    return Array.from(grouped.values())
      .map((source) => ({
        ...source,
        files: [...source.files].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.part - right.part ||
          left.fileName.localeCompare(right.fileName),
        ),
      }))
      .sort((left, right) => right.latestCreatedAt.localeCompare(left.latestCreatedAt) || left.label.localeCompare(right.label))
  }, [files])

  const selectedSource = useMemo(
    () => sources.find((source) => source.key === selectedSourceKey) ?? null,
    [selectedSourceKey, sources],
  )

  const visibleFiles = selectedSource?.files ?? []

  useEffect(() => {
    if (active) {
      return
    }

    dispatch({ type: 'clearSensitive' })
  }, [active])

  useEffect(() => {
    if (!active) {
      return
    }

    let isMounted = true
    dispatch({ type: 'setIsLoading', isLoading: true })

    void onListLogs()
      .then((nextFiles) => {
        if (!isMounted) {
          return
        }

        setFiles(nextFiles)
        dispatch({ type: 'setError', error: null })
        setSelectedSourceKey((currentSourceKey) => {
          if (currentSourceKey && nextFiles.some((file) => sourceKeyOf(file) === currentSourceKey)) {
            return currentSourceKey
          }
          return nextFiles[0] ? sourceKeyOf(nextFiles[0]) : null
        })
        setSelectedPaths((currentSelectedPaths) => {
          const nextSelected = currentSelectedPaths.filter((path) =>
            nextFiles.some((file) => file.path === path),
          )
          if (nextSelected.length > 0) {
            return nextSelected
          }

          return nextFiles[0] ? [nextFiles[0].path] : []
        })
      })
      .catch((cause) => {
        if (!isMounted) {
          return
        }

        setFiles([])
        setSelectedSourceKey(null)
        setSelectedPaths([])
        dispatch({
          type: 'setError',
          error: cause instanceof Error ? cause.message : t.sessionLogsNoDiscoveredLogs,
        })
      })
      .finally(() => {
        if (isMounted) {
          dispatch({ type: 'setIsLoading', isLoading: false })
        }
      })

    return () => {
      isMounted = false
    }
  }, [active, onListLogs, status?.currentStorageBytes, status?.logDirectory, t.sessionLogsNoDiscoveredLogs])

  const handleSelectSource = (source: LogSource) => {
    setSelectedSourceKey(source.key)
    setSelectedPaths((currentSelectedPaths) => {
      const validSelection = currentSelectedPaths.filter((path) =>
        source.files.some((file) => file.path === path),
      )
      return validSelection.length > 0 ? validSelection : source.files[0] ? [source.files[0].path] : []
    })
  }

  const handleToggleFile = (path: string) => {
    setSelectedPaths((currentSelectedPaths) =>
      currentSelectedPaths.includes(path)
        ? currentSelectedPaths.filter((currentPath) => currentPath !== path)
        : [...currentSelectedPaths, path],
    )
    dispatch({ type: 'clearPreviewError' })
  }

  const validate = () => {
    if (selectedPaths.length === 0) {
      dispatch({ type: 'setError', error: t.noSessionLogsSelected })
      return null
    }

    const normalizedPassword = password.trim()
    if (normalizedPassword.length < 8) {
      dispatch({ type: 'setError', error: t.validationPasswordLength })
      return null
    }

    dispatch({ type: 'setError', error: null })
    return normalizedPassword
  }

  const handlePreview = async () => {
    const normalizedPassword = validate()
    if (!normalizedPassword) {
      return
    }

    dispatch({ type: 'setIsWorking', isWorking: true })
    try {
      const nextPreview = await onPreview(selectedPaths, normalizedPassword)
      dispatch({ type: 'setPreview', preview: nextPreview })
    } catch (cause) {
      dispatch({ type: 'setError', error: cause instanceof Error ? cause.message : t.saveFailed })
    } finally {
      dispatch({ type: 'setIsWorking', isWorking: false })
    }
  }

  const handleExport = async () => {
    const normalizedPassword = validate()
    if (!normalizedPassword) {
      return
    }

    dispatch({ type: 'setIsWorking', isWorking: true })
    try {
      const exported = await onExport(selectedPaths, normalizedPassword)
      if (exported) {
        dispatch({ type: 'setError', error: null })
      }
    } catch (cause) {
      dispatch({ type: 'setError', error: cause instanceof Error ? cause.message : t.saveFailed })
    } finally {
      dispatch({ type: 'setIsWorking', isWorking: false })
    }
  }

  const selectedFileNames = useMemo(() => {
    const infoByPath = new Map(files.map((file) => [file.path, file]))
    return selectedPaths
      .map((path) => infoByPath.get(path))
      .filter((file): file is SessionLogFileInfo => Boolean(file))
      .map((file) => file.fileName)
  }, [files, selectedPaths])

  const actionButtonClass = `rounded-lg border px-4 py-2 text-sm transition ${
    isDark
      ? 'border-white/10 text-slate-200 hover:bg-white/5'
      : 'border-slate-200 text-slate-700 hover:bg-slate-100'
  }`
  const sectionClass = `rounded-2xl border ${
    isDark ? 'border-white/10 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
  }`
  const inputClass = `w-full rounded-xl border px-3 py-2 outline-none transition ${
    isDark
      ? 'border-white/10 bg-slate-950 text-white focus:border-cyan-400'
      : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
  }`

  if (!active) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <aside
        className={`flex min-h-0 w-full flex-col border-b lg:w-[380px] lg:border-r lg:border-b-0 ${
          isDark ? 'border-white/10 bg-slate-900/60' : 'border-slate-200 bg-white/90'
        }`}
      >
        {topContent ? (
          <div
            className={`border-b px-5 py-4 ${
              isDark ? 'border-white/10 bg-slate-950/60' : 'border-slate-200 bg-slate-50/80'
            }`}
          >
            {topContent}
          </div>
        ) : null}

        <div className={`border-b px-5 py-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {t.workspaceLogsTab}
              </h2>
              <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {t.sessionLogViewerDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={actionButtonClass} onClick={onOpenFolder}>
                {t.openFolder}
              </button>
              <button
                type="button"
                className={actionButtonClass}
                onClick={() => {
                  dispatch({ type: 'setIsLoading', isLoading: true })
                  void onListLogs()
                    .then((nextFiles) => {
                      setFiles(nextFiles)
                      dispatch({ type: 'setError', error: null })
                    })
                    .catch((cause) => {
                      dispatch({
                        type: 'setError',
                        error: cause instanceof Error ? cause.message : t.sessionLogsNoDiscoveredLogs,
                      })
                    })
                    .finally(() => {
                      dispatch({ type: 'setIsLoading', isLoading: false })
                    })
                }}
              >
                {t.sessionLogsRefresh}
              </button>
            </div>
          </div>
        </div>

        <div
          className={`connection-list-scroll-region themed-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 ${
            isDark ? 'themed-scrollbar-dark' : 'themed-scrollbar-light'
          }`}
        >
          {isLoading ? (
            <div className="space-y-3" aria-label="Loading session logs">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className={`animate-pulse rounded-2xl border h-14 ${
                    isDark ? 'border-white/5 bg-white/5' : 'border-slate-200 bg-slate-100'
                  }`}
                />
              ))}
            </div>
          ) : null}

          {!isLoading && sources.length === 0 ? (
            <div
              className={`rounded-2xl border border-dashed px-4 py-6 text-center ${
                isDark ? 'border-white/10 bg-slate-950/60' : 'border-slate-300 bg-slate-50'
              }`}
            >
              <p className={`text-base font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {t.sessionLogsNoDiscoveredLogs}
              </p>
              <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {t.sessionLogsNoDiscoveredLogsDescription}
              </p>
            </div>
          ) : null}

          {sources.length > 0 ? (
            <div className="space-y-4">
              <section>
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {t.sessionLogsSources}
                  </p>
                  <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sources.length}</span>
                </div>
                <div className="space-y-2">
                  {sources.map((source) => {
                    const selected = source.key === selectedSourceKey
                    return (
                      <button
                        key={source.key}
                        type="button"
                        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                          selected
                            ? 'border-cyan-400 bg-cyan-400/10'
                            : isDark
                              ? 'border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-white/5'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                        onClick={() => handleSelectSource(source)}
                      >
                        <p className="truncate font-medium">{source.label}</p>
                        <p className={`mt-1 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          {formatLogTimestamp(source.latestCreatedAt, locale)}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {t.sessionLogsFiles}
                  </p>
                  {visibleFiles.length > 0 ? (
                    <button
                      type="button"
                      className={`text-xs font-medium ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}
                      onClick={() => {
                        setSelectedPaths(visibleFiles.map((file) => file.path))
                        dispatch({ type: 'clearPreviewError' })
                      }}
                    >
                      {t.sessionLogsSelectVisible}
                    </button>
                  ) : null}
                </div>
                {visibleFiles.length > 0 ? (
                  <div className="space-y-2">
                    {visibleFiles.map((file) => {
                      const selected = selectedPaths.includes(file.path)
                      const modeLabel =
                        file.recordingMode === 'full'
                          ? t.sessionRecordingModeDetailed
                          : t.sessionRecordingModeCompact
                      return (
                        <button
                          key={file.path}
                          type="button"
                          className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                            selected
                              ? 'border-cyan-400 bg-cyan-400/10'
                              : isDark
                                ? 'border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-white/5'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                          onClick={() => handleToggleFile(file.path)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{file.fileName}</p>
                              <p className={`mt-1 truncate text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {formatLogTimestamp(file.createdAt, locale)}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${
                                isDark ? 'bg-white/10 text-slate-200' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {modeLabel}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className={`${sectionClass} p-4 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {t.sessionLogsNoSourceFiles}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </aside>

      <section className={`min-h-0 flex-1 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
        <div
          className={`themed-scrollbar h-full overflow-y-auto px-5 py-5 sm:px-6 ${
            isDark ? 'themed-scrollbar-dark' : 'themed-scrollbar-light'
          }`}
        >
          <div className="space-y-4">
            <div className={`${sectionClass} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.sessionRecordingLogDirectory}</p>
                  <p className={`mt-1 break-all text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {status?.logDirectory ?? '-'}
                  </p>
                  <p className={`mt-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {t.sessionRecordingCurrentUsage}: {formatStorageBytes(status?.currentStorageBytes ?? 0)}
                  </p>
                </div>
                {selectedPaths.length > 0 ? (
                  <button
                    type="button"
                    className={actionButtonClass}
                    onClick={() => {
                      setSelectedPaths([])
                      dispatch({ type: 'clearPreviewError' })
                    }}
                  >
                    {t.sessionLogsClearSelection}
                  </button>
                ) : null}
              </div>
            </div>

            {error ? (
              <p
                className={`rounded-xl border px-3 py-2 text-sm ${
                  isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {error}
              </p>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className={`${sectionClass} p-4`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{t.selectedSessionLogs}</p>
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {selectedPaths.length}
                  </span>
                </div>

                {selectedFileNames.length > 0 ? (
                  <ul className={`mt-3 space-y-2 text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {selectedFileNames.map((fileName) => (
                      <li key={fileName} className="break-all rounded-xl border px-3 py-2">
                        {fileName}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`mt-3 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {t.noSessionLogsSelected}
                  </p>
                )}

                <label className="mt-4 block text-sm">
                  <span className={`mb-2 block font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {t.sessionRecordingPassword}
                  </span>
                  <input
                    className={inputClass}
                    onChange={(event) => {
                      dispatch({ type: 'setPassword', password: event.target.value })
                    }}
                    type="password"
                    value={password}
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={actionButtonClass}
                    disabled={isWorking}
                    onClick={() => {
                      void handlePreview()
                    }}
                  >
                    {t.decryptSessionLogs}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
                    disabled={isWorking}
                    onClick={() => {
                      void handleExport()
                    }}
                  >
                    {t.exportSessionLogs}
                  </button>
                </div>
              </div>

              <div className={`${sectionClass} p-4`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{t.sessionLogsPreview}</p>
                  {preview?.truncated ? (
                    <span className={`text-xs ${isDark ? 'text-amber-200' : 'text-amber-700'}`}>
                      {t.sessionLogsPreviewTruncated}
                    </span>
                  ) : null}
                </div>
                <textarea
                  className={`themed-scrollbar mt-3 h-[520px] w-full rounded-xl border px-3 py-2 font-mono text-sm outline-none ${
                    isDark
                      ? 'border-white/10 bg-slate-950 text-slate-100 themed-scrollbar-dark'
                      : 'border-slate-200 bg-white text-slate-900 themed-scrollbar-light'
                  }`}
                  readOnly
                  value={preview?.previewText ?? ''}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
