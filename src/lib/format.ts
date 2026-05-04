import type { ConnectionRecord, SessionStatus } from './types'

export const formatConnectionSubtitle = (connection: ConnectionRecord) =>
  `${connection.username}@${connection.host}${connection.port === 22 ? '' : `:${connection.port}`}`

export const formatStatusLabel = (
  status: SessionStatus,
  getLabel: (status: SessionStatus) => string,
) => getLabel(status)
