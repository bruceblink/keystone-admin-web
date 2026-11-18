export const monitorStatuses = ['LIVE', 'STALE', 'OFFLINE', 'PARTIAL'] as const

export type MonitorStatus = (typeof monitorStatuses)[number]

export type TrendPoint = {
  timestamp: string
  cpu: number | null
  memory: number
}

export type SessionSummary = {
  id: string
  user: string
  role: string
  ip: string
  lastSeen: string
  currentPage: string
}
