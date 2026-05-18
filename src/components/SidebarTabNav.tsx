import type { getTranslations } from '../lib/i18n'
import type { AppTheme } from '../lib/types'

export type WorkspaceTab = 'connections' | 'history' | 'logs'

type SidebarTabNavProps = {
  activeTab: WorkspaceTab
  activeConnectionsCount: number
  onChange: (tab: WorkspaceTab) => void
  t: ReturnType<typeof getTranslations>
  theme: AppTheme
}

export const SidebarTabNav = ({
  activeConnectionsCount,
  activeTab,
  onChange,
  t,
  theme,
}: SidebarTabNavProps) => {
  const isDark = theme === 'dark'
  const tabs: Array<{ id: WorkspaceTab; label: string; badge?: number }> = [
    {
      id: 'connections',
      label: t.workspaceConnectionsTab,
      badge: activeConnectionsCount > 0 ? activeConnectionsCount : undefined,
    },
    { id: 'history', label: t.workspaceHistoryTab },
    { id: 'logs', label: t.workspaceLogsTab },
  ]

  return (
    <div
      className={`grid grid-cols-3 gap-2 rounded-2xl border p-1 ${
        isDark ? 'border-white/10 bg-slate-950/70' : 'border-slate-200 bg-white'
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
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
              selected
                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                : isDark
                  ? 'text-slate-300 hover:bg-white/5'
                  : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.badge ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  selected
                    ? 'bg-slate-950/15 text-slate-950'
                    : isDark
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
