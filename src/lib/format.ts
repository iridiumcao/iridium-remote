import type { ConnectionRecord, SessionStatus } from './types'

export const formatConnectionSubtitle = (connection: ConnectionRecord) =>
  `${connection.username}@${connection.host}${connection.port === 22 ? '' : `:${connection.port}`}`

export const formatStatusLabel = (
  status: SessionStatus,
  getLabel: (status: SessionStatus) => string,
) => getLabel(status)

export const formatStorageBytes = (bytes: number) => {
  if (bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const decimals = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

export const formatDateTime = (value: string | null | undefined, locale: string) => {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export const formatDurationSeconds = (
  totalSeconds: number,
  units: {
    days: string
    hours: string
    minutes: string
    seconds: string
  },
) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return `0${units.seconds}`
  }

  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const parts = [
    days > 0 ? `${days}${units.days}` : null,
    hours > 0 ? `${hours}${units.hours}` : null,
    minutes > 0 ? `${minutes}${units.minutes}` : null,
    seconds > 0 ? `${seconds}${units.seconds}` : null,
  ].filter((value): value is string => value !== null)

  return parts.slice(0, 2).join(' ')
}
