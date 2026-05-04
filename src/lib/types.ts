export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export type Locale = 'en' | 'zh-CN'

export type AppTheme = 'dark' | 'light'

export type ConnectionRecord = {
  id: string
  name: string
  groupName: string | null
  host: string
  port: number
  username: string
  hasPassword: boolean
  createdAt: string
  updatedAt: string
}

export type SessionState = {
  sessionId: string
  connectionId: string
  connectionName: string
  status: SessionStatus
  message?: string
}

export type TerminalOutputEvent = {
  sessionId: string
  stream: 'stdout' | 'stderr'
  data: string
}

export type SessionRemovedEvent = {
  sessionId: string
}

export type CreateConnectionInput = {
  name: string
  groupName?: string | null
  host: string
  port?: number
  username: string
  password?: string
}

export type UpdateConnectionInput = {
  id: string
  name: string
  groupName?: string | null
  host: string
  port: number
  username: string
  password?: string
  clearSavedPassword: boolean
}

export type FileTransferDirection = 'upload' | 'download'

export type FileTransferInput = {
  connectionId: string
  direction: FileTransferDirection
  localPath: string
  remotePath: string
}

export type FileTransferResult = {
  message: string
}

export type ConnectionFormSeed = {
  name: string
  groupName?: string | null
  host: string
  port: number
  username: string
}

export type AppError = {
  code: string
  message: string
  details?: string
}
