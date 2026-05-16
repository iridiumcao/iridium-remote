import { useEffect, useMemo, useState } from 'react'
import { formatDateTime, formatDurationSeconds } from '../lib/format'
import type { getTranslations } from '../lib/i18n'
import type {
  AppTheme,
  ConnectionHistoryDateRange,
  ConnectionHistoryDurationBucketKind,
  ConnectionHistoryHostDetails,
  ConnectionHistoryHostSummary,
  ConnectionHistoryOverview,
  Locale,
} from '../lib/types'
import { Modal } from './Modal'

type ConnectionHistoryDialogProps = {
  open: boolean
  onClose: () => void
  onLoadHostDetails: (
    historyKey: string,
    range: ConnectionHistoryDateRange,
  ) => Promise<ConnectionHistoryHostDetails>
  onLoadOverview: (range: ConnectionHistoryDateRange) => Promise<ConnectionHistoryOverview>
  t: ReturnType<typeof getTranslations>
  theme: AppTheme
  locale: Locale
}

type PieSlice = {
  label: string
  secondaryLabel?: string
  value: number
}

const durationRanges: ConnectionHistoryDateRange[] = [
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'all_time',
]

const chartColors = ['#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#f59e0b', '#84cc16', '#34d399', '#fb7185']

const formatHistorySubtitle = (host: ConnectionHistoryHostSummary) =>
  `${host.username}@${host.host}${host.port === 22 ? '' : `:${host.port}`}`

const rangeLabel = (
  range: ConnectionHistoryDateRange,
  t: ReturnType<typeof getTranslations>,
) =>
  ({
    last_7_days: t.connectionHistoryRangeLast7Days,
    last_30_days: t.connectionHistoryRangeLast30Days,
    last_90_days: t.connectionHistoryRangeLast90Days,
    all_time: t.connectionHistoryRangeAllTime,
  })[range]

const durationBucketLabel = (
  bucket: ConnectionHistoryDurationBucketKind,
  t: ReturnType<typeof getTranslations>,
) =>
  ({
    under_5_minutes: t.connectionHistoryBucketUnder5Minutes,
    between_5_and_30_minutes: t.connectionHistoryBucket5To30Minutes,
    between_30_minutes_and_2_hours: t.connectionHistoryBucket30MinutesTo2Hours,
    over_2_hours: t.connectionHistoryBucketOver2Hours,
  })[bucket]

const getConnectionHistoryErrorMessage = (cause: unknown, fallback: string) => {
  if (cause instanceof Error) {
    return cause.message
  }

  if (typeof cause === 'string' && cause.trim()) {
    return cause
  }

  if (
    typeof cause === 'object' &&
    cause !== null &&
    'message' in cause &&
    typeof cause.message === 'string'
  ) {
    return cause.message
  }

  return fallback
}

const PieChartCard = ({
  data,
  emptyText,
  isDark,
  title,
  valueFormatter,
}: {
  data: PieSlice[]
  emptyText: string
  isDark: boolean
  title: string
  valueFormatter: (value: number) => string
}) => {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const segments = useMemo(
    () =>
      data.reduce<Array<{ color: string; dasharray: string; dashoffset: number; key: string }>>(
        (items, item, index) => {
          const consumed = items.reduce((sum, existing) => {
            const [value] = existing.dasharray.split(' ')
            return sum + Number(value)
          }, 0)
          const ratio = total === 0 ? 0 : item.value / total
          const length = ratio * circumference
          return [
            ...items,
            {
              color: chartColors[index % chartColors.length],
              dasharray: `${length} ${circumference - length}`,
              dashoffset: -consumed,
              key: `${item.label}-${index}`,
            },
          ]
        },
        [],
      ),
    [circumference, data, total],
  )

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isDark ? 'border-white/10 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <p className="text-sm font-medium">{title}</p>
      {total > 0 ? (
        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="mx-auto shrink-0">
            <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
              <circle
                cx="50"
                cy="50"
                fill="none"
                r={radius}
                stroke={isDark ? '#1e293b' : '#e2e8f0'}
                strokeWidth="16"
              />
              {segments.map((segment) => (
                <circle
                  key={segment.key}
                  cx="50"
                  cy="50"
                  fill="none"
                  r={radius}
                  stroke={segment.color}
                  strokeDasharray={segment.dasharray}
                  strokeDashoffset={segment.dashoffset}
                  strokeLinecap="butt"
                  strokeWidth="16"
                />
              ))}
            </svg>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            {data.map((item, index) => {
              const share = total === 0 ? 0 : Math.round((item.value / total) * 100)
              return (
                <div key={`${item.label}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: chartColors[index % chartColors.length] }}
                      />
                      <span className="truncate font-medium">{item.label}</span>
                    </div>
                    {item.secondaryLabel ? (
                      <p className={`mt-1 truncate pl-5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {item.secondaryLabel}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium">{valueFormatter(item.value)}</div>
                    <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{share}%</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className={`mt-4 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{emptyText}</p>
      )}
    </div>
  )
}

export const ConnectionHistoryDialog = ({
  locale,
  onClose,
  onLoadHostDetails,
  onLoadOverview,
  open,
  t,
  theme,
}: ConnectionHistoryDialogProps) => {
  const [range, setRange] = useState<ConnectionHistoryDateRange>('last_30_days')
  const [searchQuery, setSearchQuery] = useState('')
  const [overview, setOverview] = useState<ConnectionHistoryOverview | null>(null)
  const [hostListOverview, setHostListOverview] = useState<ConnectionHistoryOverview | null>(null)
  const [details, setDetails] = useState<ConnectionHistoryHostDetails | null>(null)
  const [allTimeDetails, setAllTimeDetails] = useState<ConnectionHistoryHostDetails | null>(null)
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isDark = theme === 'dark'
  const visibleDetails = details && details.host.historyKey === selectedHistoryKey ? details : null
  const visibleAllTimeDetails =
    allTimeDetails && allTimeDetails.host.historyKey === selectedHistoryKey ? allTimeDetails : null

  useEffect(() => {
    if (!open) {
      return
    }

    let active = true

    void onLoadOverview('all_time')
      .then((nextOverview) => {
        if (!active) {
          return
        }

        setError(null)
        setHostListOverview(nextOverview)
        if (range === 'all_time') {
          setOverview(nextOverview)
        }
        setSelectedHistoryKey((current) =>
          current && nextOverview.hosts.some((host) => host.historyKey === current)
            ? current
            : nextOverview.hosts[0]?.historyKey ?? null,
        )
      })
      .catch((cause) => {
        if (active) {
          setHostListOverview(null)
          setDetails(null)
          setAllTimeDetails(null)
          setSelectedHistoryKey(null)
          setError(getConnectionHistoryErrorMessage(cause, t.connectionHistoryNoHosts))
        }
      })

    return () => {
      active = false
    }
  }, [open, onLoadOverview, range, t.connectionHistoryNoHosts])

  useEffect(() => {
    if (!open) {
      return
    }

    let active = true

    void onLoadOverview(range)
      .then((nextOverview) => {
        if (!active) {
          return
        }

        setError(null)
        setOverview(nextOverview)
        if (range === 'all_time') {
          setHostListOverview(nextOverview)
        }
      })
      .catch((cause) => {
        if (active) {
          setOverview(null)
          setError(getConnectionHistoryErrorMessage(cause, t.connectionHistoryNoHosts))
        }
      })

    return () => {
      active = false
    }
  }, [open, onLoadOverview, range, t.connectionHistoryNoHosts])

  useEffect(() => {
    if (!open || !selectedHistoryKey) {
      return
    }

    let active = true

    const loadDetails = async () => {
      const nextDetails = await onLoadHostDetails(selectedHistoryKey, range)
      if (!active) {
        return
      }

      setError(null)
      setDetails(nextDetails)

      if (range === 'all_time') {
        setAllTimeDetails(nextDetails)
        return
      }

      if (nextDetails.host.totalConnectionCount > 0) {
        setAllTimeDetails(null)
        return
      }

      const nextAllTimeDetails = await onLoadHostDetails(selectedHistoryKey, 'all_time')
      if (active) {
        setAllTimeDetails(nextAllTimeDetails)
      }
    }

    void loadDetails().catch((cause) => {
      if (!active) {
        return
      }

      if (range !== 'all_time') {
        void onLoadHostDetails(selectedHistoryKey, 'all_time')
          .then((nextAllTimeDetails) => {
            if (active) {
              setError(null)
              setDetails(null)
              setAllTimeDetails(nextAllTimeDetails)
            }
          })
          .catch((fallbackCause) => {
            if (active) {
              setDetails(null)
              setAllTimeDetails(null)
              setError(getConnectionHistoryErrorMessage(fallbackCause, t.connectionHistoryNoSessions))
            }
          })
        return
      }

      setDetails(null)
      setAllTimeDetails(null)
      setError(getConnectionHistoryErrorMessage(cause, t.connectionHistoryNoSessions))
    })

    return () => {
      active = false
    }
  }, [open, onLoadHostDetails, range, selectedHistoryKey, t.connectionHistoryNoSessions])

  const chartOverview = useMemo(() => {
    if (overview?.hosts.length) {
      return overview
    }

    return hostListOverview
  }, [hostListOverview, overview])

  const selectedHostSummary = useMemo(() => {
    if (!selectedHistoryKey) {
      return null
    }

    return hostListOverview?.hosts.find((host) => host.historyKey === selectedHistoryKey) ?? null
  }, [hostListOverview?.hosts, selectedHistoryKey])

  const displayedDetails = useMemo(() => {
    if (!visibleDetails && !visibleAllTimeDetails) {
      return null
    }

    if (
      visibleDetails &&
      (visibleDetails.host.totalConnectionCount > 0 || range === 'all_time')
    ) {
      return visibleDetails
    }

    if (visibleAllTimeDetails) {
      return visibleAllTimeDetails
    }

    if (!visibleDetails || !selectedHostSummary) {
      return visibleDetails
    }

    return {
      ...visibleDetails,
      host: selectedHostSummary,
    }
  }, [range, selectedHostSummary, visibleAllTimeDetails, visibleDetails])

  const filteredHosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const hosts = hostListOverview?.hosts ?? []
    if (!query) {
      return hosts
    }

    return hosts.filter((host) =>
      [host.connectionName, host.host, host.username].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  }, [hostListOverview?.hosts, searchQuery])

  const durationUnits = useMemo(
    () => ({
      days: t.durationDaysShort,
      hours: t.durationHoursShort,
      minutes: t.durationMinutesShort,
      seconds: t.durationSecondsShort,
    }),
    [t.durationDaysShort, t.durationHoursShort, t.durationMinutesShort, t.durationSecondsShort],
  )

  const durationShareData = useMemo(
    () =>
      (chartOverview?.hosts ?? []).map((host) => ({
        label: host.connectionName,
        secondaryLabel: formatHistorySubtitle(host),
        value: host.totalDurationSeconds,
      })),
    [chartOverview?.hosts],
  )

  const countShareData = useMemo(
    () =>
      (chartOverview?.hosts ?? []).map((host) => ({
        label: host.connectionName,
        secondaryLabel: formatHistorySubtitle(host),
        value: host.totalConnectionCount,
      })),
    [chartOverview?.hosts],
  )

  const selectedHostDistribution = useMemo(
    () =>
      (details?.durationBuckets ?? []).map((bucket) => ({
        label: durationBucketLabel(bucket.bucket, t),
        value: bucket.sessionCount,
      })),
    [details?.durationBuckets, t],
  )

  const summaryCardClass = `rounded-2xl border p-4 ${
    isDark ? 'border-white/10 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
  }`
  const sectionClass = `rounded-2xl border ${
    isDark ? 'border-white/10 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
  }`

  return (
    <Modal
      description={t.connectionHistoryDescription}
      footer={
        <button
          type="button"
          className={`rounded-lg border px-4 py-2 text-sm transition ${
            isDark
              ? 'border-white/10 text-slate-200 hover:bg-white/5'
              : 'border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
          onClick={onClose}
        >
          {t.close}
        </button>
      }
      open={open}
      theme={theme}
      title={t.connectionHistoryTitle}
      widthClass="max-w-7xl"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
    >
      <div className="flex flex-wrap items-center gap-3">
        {durationRanges.map((option) => {
          const selected = range === option
          return (
            <button
              key={option}
              type="button"
              className={`rounded-full px-4 py-2 text-sm transition ${
                selected
                  ? 'bg-cyan-400 font-semibold text-slate-950'
                  : isDark
                    ? 'border border-white/10 text-slate-200 hover:bg-white/5'
                    : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => {
                setError(null)
                setDetails(null)
                setRange(option)
              }}
            >
              {rangeLabel(option, t)}
            </button>
          )
        })}
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

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className={`${sectionClass} flex min-h-0 flex-col p-4`}>
          <p className="text-sm font-medium">{t.connectionHistoryHostList}</p>
          <input
            className={`mt-3 w-full rounded-xl border px-3 py-2 outline-none transition ${
              isDark
                ? 'border-white/10 bg-slate-950 text-white focus:border-cyan-400'
                : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
            }`}
            onChange={(event) => {
              setSearchQuery(event.target.value)
            }}
            placeholder={t.connectionHistorySearchHosts}
            value={searchQuery}
          />

          <div
            className={`themed-scrollbar mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 ${
              isDark ? 'themed-scrollbar-dark' : 'themed-scrollbar-light'
            }`}
          >
            {hostListOverview !== null && filteredHosts.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-6 text-sm">
                <p className="font-medium">{t.connectionHistoryNoHosts}</p>
                <p className={`mt-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {t.connectionHistoryNoHostsDescription}
                </p>
              </div>
            ) : null}

            {filteredHosts.map((host) => {
              const selected = host.historyKey === selectedHistoryKey
              return (
                <button
                  key={host.historyKey}
                  type="button"
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selected
                      ? 'border-cyan-400 bg-cyan-400/10'
                      : isDark
                        ? 'border-white/10 hover:bg-white/5'
                        : 'border-slate-200 hover:bg-slate-100'
                  }`}
                  onClick={() => {
                    setError(null)
                    setDetails(null)
                    setSelectedHistoryKey(host.historyKey)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{host.connectionName}</div>
                      <p className={`mt-1 truncate text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {formatHistorySubtitle(host)}
                      </p>
                    </div>
                    {host.deleted ? (
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          isDark ? 'bg-amber-500/15 text-amber-100' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {t.connectionHistoryDeletedConnection}
                      </span>
                    ) : null}
                  </div>
                  <div className={`mt-3 flex items-center justify-between gap-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>{formatDateTime(host.latestConnectionAt, locale)}</span>
                    <span>{host.totalConnectionCount}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div
          className={`themed-scrollbar min-h-0 overflow-y-auto pr-1 ${
            isDark ? 'themed-scrollbar-dark' : 'themed-scrollbar-light'
          }`}
        >
          <div className="space-y-4">
          {displayedDetails?.host ? (
            <>
              <div className={sectionClass}>
                <div className="border-b px-4 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">{displayedDetails.host.connectionName}</h3>
                    {displayedDetails.host.deleted ? (
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          isDark ? 'bg-amber-500/15 text-amber-100' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {t.connectionHistoryDeletedConnection}
                      </span>
                    ) : null}
                  </div>
                  <p className={`mt-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {formatHistorySubtitle(displayedDetails.host)}
                  </p>
                </div>

                <div className="grid gap-4 p-4 lg:grid-cols-3">
                  <div className={summaryCardClass}>
                    <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {t.connectionHistoryTotalConnections}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{displayedDetails.host.totalConnectionCount}</p>
                  </div>
                  <div className={summaryCardClass}>
                    <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {t.connectionHistoryTotalDuration}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatDurationSeconds(displayedDetails.host.totalDurationSeconds, durationUnits)}
                    </p>
                  </div>
                  <div className={summaryCardClass}>
                    <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {t.connectionHistoryLatestConnection}
                    </p>
                    <p className="mt-2 text-base font-semibold">
                      {formatDateTime(displayedDetails.host.latestConnectionAt, locale)}
                    </p>
                  </div>
                </div>
              </div>

              {displayedDetails.summarizedSessionCount > 0 ? (
                <p
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    isDark ? 'border-white/10 bg-white/5 text-slate-200' : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {t.connectionHistoryOlderSessionsSummarized(displayedDetails.summarizedSessionCount)}
                </p>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                <PieChartCard
                  data={durationShareData}
                  emptyText={t.connectionHistoryChartEmpty}
                  isDark={isDark}
                  title={t.connectionHistoryDurationShareChart}
                  valueFormatter={(value) => formatDurationSeconds(value, durationUnits)}
                />
                <PieChartCard
                  data={countShareData}
                  emptyText={t.connectionHistoryChartEmpty}
                  isDark={isDark}
                  title={t.connectionHistoryCountShareChart}
                  valueFormatter={(value) => `${value}`}
                />
                <PieChartCard
                  data={selectedHostDistribution}
                  emptyText={t.connectionHistoryChartEmpty}
                  isDark={isDark}
                  title={t.connectionHistoryDistributionChart}
                  valueFormatter={(value) => `${value}`}
                />
              </div>

              <div className={`${sectionClass} overflow-hidden`}>
                <div className="border-b px-4 py-4">
                  <p className="text-sm font-medium">{t.connectionHistorySessions}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className={isDark ? 'bg-slate-900/80 text-slate-300' : 'bg-slate-100 text-slate-600'}>
                      <tr>
                        <th className="px-4 py-3 font-medium">{t.connectionHistoryStartTime}</th>
                        <th className="px-4 py-3 font-medium">{t.connectionHistoryEndTime}</th>
                        <th className="px-4 py-3 font-medium">{t.connectionHistoryDuration}</th>
                        <th className="px-4 py-3 font-medium">{t.connectionHistoryCloseStatus}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedDetails.sessions.length > 0 ? (
                        displayedDetails.sessions.map((session) => (
                          <tr
                            key={session.id}
                            className={isDark ? 'border-t border-white/10' : 'border-t border-slate-200'}
                          >
                            <td className="px-4 py-3">{formatDateTime(session.startedAt, locale)}</td>
                            <td className="px-4 py-3">{formatDateTime(session.endedAt, locale)}</td>
                            <td className="px-4 py-3">
                              {formatDurationSeconds(session.durationSeconds, durationUnits)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>
                                  {session.closeStatus === 'in_progress'
                                    ? t.connectionHistoryStatusInProgress
                                    : session.closeStatus === 'normal'
                                      ? t.connectionHistoryStatusNormal
                                      : t.connectionHistoryStatusAbnormal}
                                </span>
                                {session.isEstimated ? (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs ${
                                      isDark ? 'bg-amber-500/15 text-amber-100' : 'bg-amber-100 text-amber-700'
                                    }`}
                                  >
                                    {t.connectionHistoryEstimated}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-4 py-6 text-sm" colSpan={4}>
                            {t.connectionHistoryNoSessions}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className={`${sectionClass} p-6 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {open && (overview === null || hostListOverview === null) ? '…' : t.connectionHistoryNoHostsDescription}
            </div>
          )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
