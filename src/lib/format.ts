import type { ConnectionRecord, SessionStatus } from './types'

export const formatConnectionSubtitle = (connection: ConnectionRecord) =>
  `${connection.username}@${connection.host}${connection.port === 22 ? '' : `:${connection.port}`}`

export const formatStatusLabel = (status: SessionStatus) => {
  switch (status) {
    case 'idle':
      return 'Idle'
    case 'connecting':
      return 'Connecting'
    case 'connected':
      return 'Connected'
    case 'disconnected':
      return 'Disconnected'
    case 'error':
      return 'Error'
  }
}
