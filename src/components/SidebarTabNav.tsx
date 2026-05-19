import type { getTranslations } from '../lib/i18n'
import type { AppTheme } from '../lib/types'

export type WorkspaceTab = 'connections' | 'history' | 'logs'

type SidebarTabNavProps = {
  activeTab: WorkspaceTab
  activeConnectionsCount: number
  onChange: (tab: WorkspaceTab) => void
  showLogsTab: boolean
  t: ReturnType<typeof getTranslations>
  theme: AppTheme
}

export const SidebarTabNav = ({
  activeConnectionsCount,
  activeTab,
  onChange,
  showLogsTab,
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
  ]

  if (showLogsTab) {
    tabs.push({ id: 'logs', label: t.workspaceLogsTab })
  }

  return (
    <div
      className={`flex items-end px-1 pt-2 ${
        isDark ? 'border-white/10 text-slate-200' : 'border-slate-200 text-slate-700'
      }`}
      role="tablist"
      aria-label={t.workspaceTabsLabel}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === activeTab
        const zIndex = selected ? tabs.length + 1 : tabs.length - index
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`relative -ml-2 first:ml-0 flex min-w-0 items-center gap-2 rounded-t-2xl border px-4 py-2.5 text-sm font-medium transition ${
              selected
                ? 'translate-y-px border-cyan-300/80 bg-cyan-400 text-slate-950 shadow-[0_-10px_25px_-18px_rgba(34,211,238,0.95)]'
                : isDark
                  ? 'border-white/10 bg-slate-900/90 text-slate-300 hover:border-white/20 hover:bg-slate-900'
                  : 'border-slate-200 bg-slate-100/95 text-slate-600 hover:border-slate-300 hover:bg-white'
            }`}
            onClick={() => onChange(tab.id)}
            style={{ zIndex }}
          >
            <span className="truncate">{tab.label}</span>
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
