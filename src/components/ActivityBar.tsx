import type { ReactNode } from 'react'
import type { getTranslations } from '../lib/i18n'
import type { AppTheme } from '../lib/types'

export type WorkspaceTab = 'connections' | 'history' | 'logs'

type ActivityBarProps = {
  activeTab: WorkspaceTab
  activeConnectionsCount: number
  onChange: (tab: WorkspaceTab) => void
  showLogsTab: boolean
  t: ReturnType<typeof getTranslations>
  theme: AppTheme
}

const icons = {
  connections: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  ),
  history: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  logs: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m3 15 2 2 4-4" />
    </svg>
  ),
}

export const ActivityBar = ({
  activeConnectionsCount,
  activeTab,
  onChange,
  showLogsTab,
  t,
  theme,
}: ActivityBarProps) => {
  const isDark = theme === 'dark'
  const tabs: Array<{ id: WorkspaceTab; label: string; icon: ReactNode; badge?: number }> = [
    {
      id: 'connections',
      label: t.workspaceConnectionsTab,
      icon: icons.connections,
      badge: activeConnectionsCount > 0 ? activeConnectionsCount : undefined,
    },
    {
      id: 'history',
      label: t.workspaceHistoryTab,
      icon: icons.history,
    },
  ]

  if (showLogsTab) {
    tabs.push({ id: 'logs', label: t.workspaceLogsTab, icon: icons.logs })
  }

  return (
    <div
      className={`flex w-12 flex-col items-center py-2 shrink-0 ${
        isDark ? 'bg-slate-950 border-r border-white/10 text-slate-400' : 'bg-slate-100 border-r border-slate-300 text-slate-500'
      }`}
      role="tablist"
      aria-label={t.workspaceTabsLabel}
    >
      {tabs.map((tab) => {
        const selected = tab.id === activeTab
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            title={tab.label}
            className={`relative flex h-12 w-full items-center justify-center transition-colors ${
              selected
                ? isDark
                  ? 'text-cyan-400'
                  : 'text-cyan-600'
                : isDark
                  ? 'hover:text-slate-200'
                  : 'hover:text-slate-800'
            }`}
            onClick={() => onChange(tab.id)}
          >
            {selected && (
              <div
                className={`absolute left-0 top-0 h-full w-[2px] ${
                  isDark ? 'bg-cyan-400' : 'bg-cyan-600'
                }`}
              />
            )}
            <div className="relative">
              {tab.icon}
              {tab.badge ? (
                <span
                  className={`absolute -right-2 -bottom-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                    isDark
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-cyan-600 text-white'
                  }`}
                >
                  {tab.badge}
                </span>
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}
