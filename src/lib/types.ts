export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'password_required'
  | 'connected'
  | 'disconnected'
  | 'error'

export type ConnectionRecord = {
  id: string
  name: string
  host: string
  port: number
  username: string
  createdAt: string
  updatedAt: string
}

export type SessionState = {
  connectionId: string | null
  status: SessionStatus
  message?: string
}

export type TerminalOutputEvent = {
  stream: 'stdout' | 'stderr'
  data: string
}

export type CreateConnectionInput = {
  name: string
  host: string
  port?: number
  username: string
}

export type UpdateConnectionInput = {
  id: string
  name: string
  host: string
  port: number
  username: string
}

export type SubmitSessionPasswordInput = {
  connectionId: string
  password: string
  rememberPassword: boolean
}

export type AppError = {
  code: string
  message: string
  details?: string
}
