import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { appClient } from '../api/client'
import { formatConnectionSubtitle, formatStatusLabel } from '../lib/format'
import type { ConnectionRecord, SessionState } from '../lib/types'

type TerminalWorkspaceProps = {
  connection: ConnectionRecord | null
  sessionState: SessionState
  onConnect?: () => void
  onDisconnect?: () => void
}

const statusClasses: Record<SessionState['status'], string> = {
  idle: 'bg-slate-700/60 text-slate-200',
  connecting: 'bg-amber-500/20 text-amber-200',
  password_required: 'bg-fuchsia-500/20 text-fuchsia-200',
  connected: 'bg-emerald-500/20 text-emerald-200',
  disconnected: 'bg-slate-600/60 text-slate-200',
  error: 'bg-rose-500/20 text-rose-200',
}

export const TerminalWorkspace = ({
  connection,
  onConnect,
  onDisconnect,
  sessionState,
}: TerminalWorkspaceProps) => {
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastSessionId = useRef<string | null>(null)

  useEffect(() => {
    if (!terminalRef.current || terminalInstance.current) {
      return
    }

    const fitAddon = new FitAddon()
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'Consolas, "Cascadia Code", Menlo, monospace',
      fontSize: 14,
      theme: {
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
    })

    terminal.loadAddon(fitAddon)
    terminal.open(terminalRef.current)
    fitAddon.fit()

    terminal.onData((data) => {
      void appClient.writeSessionInput(data)
    })

    terminalInstance.current = terminal
    fitAddonRef.current = fitAddon

    const resizeObserver = new ResizeObserver(() => {
      const fit = fitAddonRef.current
      const currentTerminal = terminalInstance.current

      if (!fit || !currentTerminal) {
        return
      }

      fit.fit()
      void appClient.resizeSession(currentTerminal.cols, currentTerminal.rows)
    })

    resizeObserver.observe(terminalRef.current)

    return () => {
      resizeObserver.disconnect()
      terminal.dispose()
      terminalInstance.current = null
      fitAddonRef.current = null
    }
  }, [])

  useEffect(() => {
    let active = true

    const subscribe = async () => {
      const unsubscribe = await appClient.onTerminalOutput((payload) => {
        if (!active) {
          return
        }

        terminalInstance.current?.write(payload.data)
      })

      return unsubscribe
    }

    const unsubscribePromise = subscribe()

    return () => {
      active = false
      void unsubscribePromise.then((unsubscribe) => unsubscribe())
    }
  }, [])

  useEffect(() => {
    const terminal = terminalInstance.current
    const fitAddon = fitAddonRef.current

    if (!terminal || !fitAddon) {
      return
    }

    if (sessionState.connectionId !== lastSessionId.current) {
      terminal.reset()
      lastSessionId.current = sessionState.connectionId
    }

    if (sessionState.status === 'connected' || sessionState.status === 'connecting') {
      fitAddon.fit()
      terminal.focus()
      void appClient.resizeSession(terminal.cols, terminal.rows)
    }
  }, [sessionState.connectionId, sessionState.status])

  const showIdleState = !connection && !sessionState.connectionId
  const showOverlay =
    showIdleState || sessionState.status === 'connecting' || sessionState.status === 'password_required'

  return (
    <section className="flex min-h-[520px] flex-1 flex-col bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">
              {connection?.name ?? 'Terminal Workspace'}
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[sessionState.status]}`}
            >
              {formatStatusLabel(sessionState.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {connection ? formatConnectionSubtitle(connection) : 'Select a connection to start'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onConnect ? (
            <button
              type="button"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
              onClick={onConnect}
            >
              {sessionState.status === 'disconnected' || sessionState.status === 'error'
                ? 'Reconnect'
                : 'Connect'}
            </button>
          ) : null}

          {onDisconnect ? (
            <button
              type="button"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex-1 p-4 sm:p-6">
        <div
          className="terminal-shell h-full min-h-[460px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 shadow-inner shadow-cyan-950/20"
          ref={terminalRef}
        />

        {showOverlay ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-white/10 bg-slate-900/90 px-6 py-5 text-center shadow-2xl shadow-black/30 backdrop-blur">
              {showIdleState ? (
                <>
                  <p className="text-lg font-semibold text-white">Select a connection to start</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Choose a saved host from the left panel to open the terminal.
                  </p>
                </>
              ) : null}

              {sessionState.status === 'connecting' ? (
                <>
                  <p className="text-lg font-semibold text-white">Connecting</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Starting the SSH session and waiting for the remote shell.
                  </p>
                </>
              ) : null}

              {sessionState.status === 'password_required' ? (
                <>
                  <p className="text-lg font-semibold text-white">Password Required</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Enter your password in the dialog to continue the SSH login.
                  </p>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {(sessionState.status === 'disconnected' || sessionState.status === 'error') && connection ? (
          <div className="pointer-events-none absolute inset-x-6 bottom-6 rounded-xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-slate-200 shadow-xl shadow-black/20">
            {sessionState.message ??
              (sessionState.status === 'error'
                ? 'The SSH session ended with an error.'
                : 'The SSH session has disconnected.')}
          </div>
        ) : null}
      </div>
    </section>
  )
}
