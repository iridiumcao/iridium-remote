import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { appClient } from '../api/client'
import type { getTranslations } from '../lib/i18n'
import { formatConnectionSubtitle, formatStatusLabel } from '../lib/format'
import type { AppTheme, ConnectionRecord, SessionState } from '../lib/types'

type TerminalWorkspaceProps = {
  activeSession: SessionState | null
  activeConnection: ConnectionRecord | null
  sessions: SessionState[]
  isVisible?: boolean
  selectedConnection: ConnectionRecord | null
  onCloseSession: (sessionId: string) => void
  onConnect?: () => void
  onDisconnect?: (sessionId: string) => void
  onOpenTransfer?: () => void
  onSelectSession: (sessionId: string) => void
  t: ReturnType<typeof getTranslations>
  theme: AppTheme
}

const statusClasses = {
  dark: {
    idle: 'bg-slate-700/60 text-slate-200',
    connecting: 'bg-amber-500/20 text-amber-200',
    connected: 'bg-emerald-500/20 text-emerald-200',
    disconnected: 'bg-slate-600/60 text-slate-200',
    error: 'bg-rose-500/20 text-rose-200',
  },
  light: {
    idle: 'bg-slate-200 text-slate-700',
    connecting: 'bg-amber-100 text-amber-700',
    connected: 'bg-emerald-100 text-emerald-700',
    disconnected: 'bg-slate-200 text-slate-700',
    error: 'bg-rose-100 text-rose-700',
  },
} as const

type TerminalContextMenuState = {
  x: number
  y: number
  open: boolean
}

const closedContextMenu: TerminalContextMenuState = {
  x: 0,
  y: 0,
  open: false,
}

const terminalThemes = {
  dark: {
    background: '#020617',
    foreground: '#e2e8f0',
    cursor: '#22d3ee',
    black: '#0f172a',
    red: '#fb7185',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e2e8f0',
    brightBlack: '#475569',
    brightRed: '#fda4af',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#93c5fd',
    brightMagenta: '#e9d5ff',
    brightCyan: '#67e8f9',
    brightWhite: '#f8fafc',
  },
  light: {
    background: '#f8fafc',
    foreground: '#0f172a',
    cursor: '#0891b2',
    black: '#0f172a',
    red: '#be123c',
    green: '#15803d',
    yellow: '#a16207',
    blue: '#1d4ed8',
    magenta: '#7e22ce',
    cyan: '#0f766e',
    white: '#cbd5e1',
    brightBlack: '#64748b',
    brightRed: '#e11d48',
    brightGreen: '#16a34a',
    brightYellow: '#ca8a04',
    brightBlue: '#2563eb',
    brightMagenta: '#9333ea',
    brightCyan: '#0d9488',
    brightWhite: '#f8fafc',
  },
} as const

const escapeCharacter = String.fromCharCode(0x1b)
const terminalStatusResponseReady = `${escapeCharacter}[0n`
const terminalCursorPositionResponse = `${escapeCharacter}[1;1R`
const terminalDeviceAttributesResponse = `${escapeCharacter}[?1;2c`

const isReplayQueryParameterCharacter = (character: string) =>
  (character >= '0' && character <= '9') || character === ';' || character === '?'

const MAX_TERMINAL_BUFFER_SIZE = 500000
const MIN_SYNCHRONIZED_TERMINAL_COLS = 2
const MIN_SYNCHRONIZED_TERMINAL_ROWS = 2
const TERMINAL_QUERY_TAIL_LIMIT = 32

const sanitizeReplayBuffer = (data: string) => {
  let sanitized = ''

  for (let index = 0; index < data.length; index += 1) {
    if (data[index] !== escapeCharacter || data[index + 1] !== '[') {
    sanitized += data[index]
      continue
    }

    let parameterEnd = index + 2
    while (parameterEnd < data.length && isReplayQueryParameterCharacter(data[parameterEnd])) {
      parameterEnd += 1
    }

    if (data[parameterEnd] === 'n') {
      index = parameterEnd
      continue
    }

    sanitized += data[index]
  }

  return sanitized
}

const truncateTerminalBuffer = (data: string) =>
  data.length > MAX_TERMINAL_BUFFER_SIZE ? data.slice(data.length - MAX_TERMINAL_BUFFER_SIZE) : data

const extractInactiveTerminalResponses = (data: string) => {
  const responses: string[] = []
  let index = 0
  let tailStart = data.length

  while (index < data.length) {
    if (data[index] !== escapeCharacter || data[index + 1] !== '[') {
      index += 1
      continue
    }

    tailStart = index
    const finalCharacter = data[index + 2]
    if (!finalCharacter) {
      break
    }

    if (finalCharacter === '5' || finalCharacter === '6') {
      const terminator = data[index + 3]
      if (!terminator) {
        break
      }

      if (terminator === 'n') {
        responses.push(
          finalCharacter === '5' ? terminalStatusResponseReady : terminalCursorPositionResponse,
        )
        index += 4
        tailStart = index
        continue
      }
    }

    if (finalCharacter === 'c') {
      responses.push(terminalDeviceAttributesResponse)
      index += 3
      tailStart = index
      continue
    }

    index += 1
  }

  const trailingData = data.slice(tailStart)
  const tail =
    trailingData.length > TERMINAL_QUERY_TAIL_LIMIT
      ? trailingData.slice(trailingData.length - TERMINAL_QUERY_TAIL_LIMIT)
      : trailingData

  return { responses, tail }
}

const mergeTerminalSnapshot = (current: string, snapshot: string) => {
  const sanitizedSnapshot = truncateTerminalBuffer(sanitizeReplayBuffer(snapshot))

  if (!sanitizedSnapshot) {
    return current
  }

  if (current.endsWith(sanitizedSnapshot)) {
    return current
  }

  if (sanitizedSnapshot.startsWith(current)) {
    return sanitizedSnapshot
  }

  if (sanitizedSnapshot.length >= current.length) {
    return sanitizedSnapshot
  }

  return current
}

export const TerminalWorkspace = ({
  activeConnection,
  activeSession,
  isVisible = true,
  onCloseSession,
  onConnect,
  onDisconnect,
  onOpenTransfer,
  onSelectSession,
  selectedConnection,
  sessions,
  t,
  theme,
}: TerminalWorkspaceProps) => {
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalShellRef = useRef<HTMLDivElement | null>(null)
  const terminalMenuRef = useRef<HTMLDivElement | null>(null)
  const renderedSessionIdRef = useRef<string | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const sessionBuffersRef = useRef<Map<string, string>>(new Map())
  const sessionQueryTailsRef = useRef<Map<string, string>>(new Map())
  const lastSyncedTerminalSizesRef = useRef<Map<string, string>>(new Map())
  const [terminalContextMenu, setTerminalContextMenu] = useState<TerminalContextMenuState>(closedContextMenu)
  const isDark = theme === 'dark'

  const xtermTheme = useMemo(() => terminalThemes[theme], [theme])

  const sessionHasVisibleTerminalContent = useCallback(
    (sessionId: string) => (sessionBuffersRef.current.get(sessionId) ?? '').length > 0,
    [],
  )

  const fitTerminalViewport = useCallback(() => {
    const fitAddon = fitAddonRef.current

    if (!fitAddon) {
      return
    }

    fitAddon.fit()
  }, [])

  const syncTerminalSize = useCallback((sessionId: string) => {
    const terminal = terminalInstance.current

    if (!terminal || !sessionHasVisibleTerminalContent(sessionId)) {
      return false
    }

    fitTerminalViewport()

    if (
      terminal.cols < MIN_SYNCHRONIZED_TERMINAL_COLS ||
      terminal.rows < MIN_SYNCHRONIZED_TERMINAL_ROWS
    ) {
      return false
    }

    const nextSize = `${terminal.cols}x${terminal.rows}`
    if (lastSyncedTerminalSizesRef.current.get(sessionId) === nextSize) {
      return true
    }

    lastSyncedTerminalSizesRef.current.set(sessionId, nextSize)
    void appClient.resizeSession(sessionId, terminal.cols, terminal.rows)
    return true
  }, [fitTerminalViewport, sessionHasVisibleTerminalContent])

  useEffect(() => {
    activeSessionIdRef.current = activeSession?.sessionId ?? null
  }, [activeSession?.sessionId])

  useEffect(() => {
    if (!terminalRef.current || terminalInstance.current) {
      return
    }

    const fitAddon = new FitAddon()
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'Consolas, "Cascadia Code", Menlo, monospace',
      fontSize: 14,
      theme: xtermTheme,
    })

    terminal.loadAddon(fitAddon)
    terminal.open(terminalRef.current)
    fitAddon.fit()

    terminal.onData((data) => {
      if (activeSessionIdRef.current) {
        void appClient.writeSessionInput(activeSessionIdRef.current, data)
      }
    })

    terminalInstance.current = terminal
    fitAddonRef.current = fitAddon
    renderedSessionIdRef.current = null // Force re-render of content on next effect run

    const resizeObserver = new ResizeObserver(() => {
      if (!activeSessionIdRef.current) {
        return
      }

      fitTerminalViewport()
      void syncTerminalSize(activeSessionIdRef.current)
    })

    resizeObserver.observe(terminalRef.current)

    return () => {
      resizeObserver.disconnect()
      terminal.dispose()
      terminalInstance.current = null
      fitAddonRef.current = null
    }
  }, [syncTerminalSize, fitTerminalViewport, xtermTheme])

  useEffect(() => {
    if (terminalInstance.current) {
      terminalInstance.current.options.theme = xtermTheme
    }
  }, [xtermTheme])

  useEffect(() => {
    if (!terminalContextMenu.open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        terminalMenuRef.current &&
        event.target instanceof Node &&
        !terminalMenuRef.current.contains(event.target)
      ) {
        setTerminalContextMenu(closedContextMenu)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTerminalContextMenu(closedContextMenu)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [terminalContextMenu.open])

  useEffect(() => {
    let active = true

    const subscribe = async () => {
      const unsubscribe = await appClient.onTerminalOutput((payload) => {
        if (!active) {
          return
        }

        const current = sessionBuffersRef.current.get(payload.sessionId) ?? ''
        const truncatedBuffer = truncateTerminalBuffer(sanitizeReplayBuffer(`${current}${payload.data}`))

        sessionBuffersRef.current.set(payload.sessionId, truncatedBuffer)

        if (payload.sessionId === activeSessionIdRef.current) {
          sessionQueryTailsRef.current.delete(payload.sessionId)
          terminalInstance.current?.write(payload.data)
          void syncTerminalSize(payload.sessionId)
        } else {
          const queryTail = sessionQueryTailsRef.current.get(payload.sessionId) ?? ''
          const { responses, tail } = extractInactiveTerminalResponses(`${queryTail}${payload.data}`)

          if (tail) {
            sessionQueryTailsRef.current.set(payload.sessionId, tail)
          } else {
            sessionQueryTailsRef.current.delete(payload.sessionId)
          }

          for (const response of responses) {
            void appClient.writeSessionInput(payload.sessionId, response)
          }
        }
      })

      return unsubscribe
    }

    const unsubscribePromise = subscribe()

    return () => {
      active = false
      void unsubscribePromise.then((unsubscribe) => unsubscribe())
    }
  }, [syncTerminalSize])

  useEffect(() => {
    if (!activeSession?.sessionId) {
      return
    }

    const sessionId = activeSession.sessionId
    const shouldKeepPollingConnectedSession = () => {
      if (activeSession.status !== 'connected') {
        return false
      }

      return (sessionBuffersRef.current.get(sessionId) ?? '').length === 0
    }

    let active = true
    let syncInFlight = false

    const syncTerminalSnapshot = async () => {
      if (!active || syncInFlight) {
        return
      }

      syncInFlight = true
      try {
        const snapshot = await appClient.getSessionTerminalBuffer(sessionId)
        if (!active) {
          return
        }

        const current = sessionBuffersRef.current.get(sessionId) ?? ''
        const merged = mergeTerminalSnapshot(current, snapshot)

        if (merged === current) {
          return
        }

        sessionBuffersRef.current.set(sessionId, merged)

        if (renderedSessionIdRef.current === sessionId) {
          const terminal = terminalInstance.current
          if (terminal) {
            if (merged.startsWith(current)) {
              terminal.write(merged.slice(current.length))
            } else {
              terminal.reset()
              terminal.write(merged)
            }

            void syncTerminalSize(sessionId)
          }
        }
      } finally {
        syncInFlight = false
      }
    }

    void syncTerminalSnapshot()

    let reconnectInterval: number | undefined

    if (activeSession.status === 'connecting' || shouldKeepPollingConnectedSession()) {
      reconnectInterval = window.setInterval(() => {
        if (shouldKeepPollingConnectedSession()) {
          void syncTerminalSnapshot()
          return
        }

        if (activeSession.status === 'connecting') {
          void syncTerminalSnapshot()
          return
        }

        if (reconnectInterval !== undefined) {
          window.clearInterval(reconnectInterval)
          reconnectInterval = undefined
        }
      }, 500)
    }

    return () => {
      active = false
      if (reconnectInterval !== undefined) {
        window.clearInterval(reconnectInterval)
      }
    }
  }, [activeSession?.sessionId, activeSession?.status, syncTerminalSize])

  useEffect(() => {
    const liveSessionIds = new Set(sessions.map((session) => session.sessionId))
    for (const sessionId of Array.from(sessionBuffersRef.current.keys())) {
      if (!liveSessionIds.has(sessionId)) {
        sessionBuffersRef.current.delete(sessionId)
      }
    }
    for (const sessionId of Array.from(sessionQueryTailsRef.current.keys())) {
      if (!liveSessionIds.has(sessionId)) {
        sessionQueryTailsRef.current.delete(sessionId)
      }
    }
    for (const sessionId of Array.from(lastSyncedTerminalSizesRef.current.keys())) {
      if (!liveSessionIds.has(sessionId)) {
        lastSyncedTerminalSizesRef.current.delete(sessionId)
      }
    }
  }, [sessions])

  useEffect(() => {
    const terminal = terminalInstance.current

    if (!terminal || !isVisible) {
      return
    }

    if (activeSession?.sessionId !== renderedSessionIdRef.current) {
      terminal.reset()
      renderedSessionIdRef.current = activeSession?.sessionId ?? null

      if (activeSession) {
        const buffer = sessionBuffersRef.current.get(activeSession.sessionId)
        if (buffer) {
          terminal.write(buffer)
        }
      }
    }

    if (activeSession?.status === 'connected' || activeSession?.status === 'connecting') {
      fitTerminalViewport()
      terminal.focus()
      void syncTerminalSize(activeSession.sessionId)
    }
  }, [activeSession, isVisible, fitTerminalViewport, syncTerminalSize])

  const headerConnection = activeConnection ?? selectedConnection
  const headerTitle = headerConnection
    ? formatConnectionSubtitle(headerConnection)
    : t.terminalWorkspace
  const recordingLabel =
    activeSession?.recordingActive
      ? activeSession.recordingMode === 'full'
        ? t.recordingIndicator
        : t.inputRecordingIndicator
      : null
  const showIdleState = !headerConnection && !activeSession
  const showSelectionState = Boolean(headerConnection) && !activeSession
  const showOverlay = showIdleState || showSelectionState
  const terminalMenuClass = `absolute z-20 min-w-[160px] rounded-xl border p-1 text-[14px] shadow-xl ${
    isDark
      ? 'border-white/10 bg-slate-900 text-slate-100 shadow-black/40'
      : 'border-slate-200 bg-white text-slate-900 shadow-slate-300/60'
  }`

  const closeTerminalContextMenu = () => {
    setTerminalContextMenu(closedContextMenu)
  }

  const handleTerminalContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    const container = terminalShellRef.current
    if (!container) {
      return
    }

    const bounds = container.getBoundingClientRect()
    const menuWidth = 176
    const menuHeight = 132
    const x = Math.max(0, Math.min(event.clientX - bounds.left, bounds.width - menuWidth))
    const y = Math.max(0, Math.min(event.clientY - bounds.top, bounds.height - menuHeight))

    setTerminalContextMenu({
      x,
      y,
      open: true,
    })
  }

  const handleTerminalCopy = async () => {
    if (!navigator.clipboard) {
      closeTerminalContextMenu()
      return
    }

    const selection = terminalInstance.current?.getSelection()?.trim()
    if (!selection) {
      closeTerminalContextMenu()
      return
    }

    await navigator.clipboard.writeText(selection)
    closeTerminalContextMenu()
  }

  const handleTerminalPaste = async () => {
    if (!navigator.clipboard) {
      closeTerminalContextMenu()
      return
    }

    const text = await navigator.clipboard.readText()
    if (!text || !activeSessionIdRef.current) {
      closeTerminalContextMenu()
      return
    }

    terminalInstance.current?.paste(text)
    terminalInstance.current?.focus()
    closeTerminalContextMenu()
  }

  const handleTerminalSelectAll = () => {
    terminalInstance.current?.selectAll()
    terminalInstance.current?.focus()
    closeTerminalContextMenu()
  }

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
        isDark ? 'bg-slate-950' : 'bg-slate-100'
      }`}
    >
      <div
        className={`border-b px-5 py-3 sm:px-6 ${
          isDark ? 'border-white/10 bg-slate-950' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {t.tabs}
            </p>
            <div
              className={`terminal-tab-scroll-region themed-scrollbar mt-2 flex items-end overflow-x-auto px-1 pb-1 pt-2 ${
                isDark ? 'themed-scrollbar-dark' : 'themed-scrollbar-light'
              }`}
            >
              {sessions.map((session, index) => {
                const selected = session.sessionId === activeSession?.sessionId
                const zIndex = selected ? sessions.length + 1 : sessions.length - index

                return (
                  <div
                    key={session.sessionId}
                    className={`relative -ml-2 first:ml-0 flex shrink-0 items-center gap-2 rounded-t-2xl border px-3 py-2 text-sm ${
                      selected
                        ? isDark
                          ? 'translate-y-px border-cyan-400/70 bg-cyan-400/10 text-white shadow-[0_-10px_24px_-18px_rgba(34,211,238,0.95)]'
                          : 'translate-y-px border-cyan-400/60 bg-cyan-50 text-slate-900 shadow-[0_-10px_24px_-18px_rgba(34,211,238,0.7)]'
                        : isDark
                          ? 'border-white/10 bg-slate-900/85 text-slate-300 hover:border-white/20 hover:bg-slate-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                    }`}
                    style={{ zIndex }}
                  >
                    <button
                      type="button"
                      className="max-w-[14rem] truncate text-left"
                      onClick={() => onSelectSession(session.sessionId)}
                    >
                    {session.connectionName}
                    </button>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClasses[theme][session.status]}`}>
                      {formatStatusLabel(session.status, t.statusLabel)}
                    </span>
                    <button
                      type="button"
                      className={`rounded-full px-1 text-xs ${isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-200'}`}
                      onClick={() => onCloseSession(session.sessionId)}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {onOpenTransfer && activeConnection ? (
            <button
              type="button"
              className={`shrink-0 rounded-lg border px-4 py-2 text-sm transition ${
                isDark
                  ? 'border-white/10 text-slate-200 hover:bg-white/5'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              onClick={onOpenTransfer}
            >
              {t.fileTransfer}
            </button>
          ) : null}
        </div>
      </div>

      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6 ${
          isDark ? 'border-white/10' : 'border-slate-200'
        }`}
      >
        <div>
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {headerTitle}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {recordingLabel ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isDark ? 'bg-rose-500/15 text-rose-100' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {recordingLabel}
            </span>
          ) : null}

          {onConnect ? (
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                isDark
                  ? 'border-white/10 text-slate-200 hover:bg-white/5'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              onClick={onConnect}
            >
              {activeSession && (activeSession.status === 'disconnected' || activeSession.status === 'error')
                ? t.reconnect
                : t.connect}
            </button>
          ) : null}

          {onDisconnect && activeSession && (activeSession.status === 'connecting' || activeSession.status === 'connected') ? (
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                isDark
                  ? 'border-white/10 text-slate-200 hover:bg-white/5'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => onDisconnect(activeSession.sessionId)}
            >
              {t.disconnect}
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden p-4 sm:p-6">
        <div
          className={`terminal-shell h-full min-h-full overflow-hidden rounded-2xl border shadow-inner ${
            isDark
              ? 'border-white/10 bg-slate-950/70 shadow-cyan-950/20'
              : 'border-slate-200 bg-white shadow-slate-200/80'
          }`}
          onContextMenu={handleTerminalContextMenu}
          ref={(node) => {
            terminalRef.current = node
            terminalShellRef.current = node
          }}
        />

        {terminalContextMenu.open ? (
          <div
            className={terminalMenuClass}
            ref={terminalMenuRef}
            role="menu"
            style={{ left: `${terminalContextMenu.x}px`, top: `${terminalContextMenu.y}px` }}
          >
            <button
              role="menuitem"
              type="button"
              className={`block w-full rounded-lg px-3 py-2 text-left transition ${
                isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
              }`}
              onClick={() => {
                void handleTerminalCopy()
              }}
            >
              {t.terminalCopy}
            </button>
            <button
              role="menuitem"
              type="button"
              className={`block w-full rounded-lg px-3 py-2 text-left transition ${
                isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
              }`}
              onClick={() => {
                void handleTerminalPaste()
              }}
            >
              {t.terminalPaste}
            </button>
            <button
              role="menuitem"
              type="button"
              className={`block w-full rounded-lg px-3 py-2 text-left transition ${
                isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
              }`}
              onClick={handleTerminalSelectAll}
            >
              {t.terminalSelectAll}
            </button>
          </div>
        ) : null}

        {showOverlay ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div
              className={`max-w-md rounded-2xl border px-6 py-5 text-center shadow-2xl backdrop-blur ${
                isDark
                  ? 'border-white/10 bg-slate-900/90 text-white shadow-black/30'
                  : 'border-slate-200 bg-white/95 text-slate-900 shadow-slate-300/60'
              }`}
            >
              {showIdleState ? (
                <>
                  <p className="text-lg font-semibold">{t.selectConnectionToStart}</p>
                  <p className={`mt-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {t.selectConnectionDescription}
                  </p>
                </>
              ) : null}

              {showSelectionState ? (
                <>
                  <p className="text-lg font-semibold">{t.readyToConnect}</p>
                  <p className={`mt-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {t.selectConnectionAndConnect}
                  </p>
                </>
              ) : null}

            </div>
          </div>
        ) : null}

        {(activeSession?.status === 'disconnected' || activeSession?.status === 'error') && activeConnection ? (
          <div
            className={`pointer-events-none absolute inset-x-6 bottom-6 rounded-xl border px-4 py-3 text-sm shadow-xl ${
              isDark
                ? 'border-white/10 bg-slate-900/90 text-slate-200 shadow-black/20'
                : 'border-slate-200 bg-white/90 text-slate-700 shadow-slate-300/50'
            }`}
          >
            {activeSession.message ?? t.sessionClosed}
          </div>
        ) : null}
      </div>
    </section>
  )
}
