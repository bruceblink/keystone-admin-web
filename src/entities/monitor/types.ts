export const monitorStatuses = ['LIVE', 'STALE', 'OFFLINE', 'PARTIAL'] as const

export type MonitorStatus = (typeof monitorStatuses)[number]

export type TrendPoint = {
  timestamp: string
  cpu: number
  memory: number
}

export type MonitorSnapshot = {
  status: MonitorStatus
  capturedAt: string
  source: string
  node: string
  cpu: number
  memory: number
  beam: {
    processes: number
    reductions: number
    runQueue: number
  }
  disk: {
    used: number
    total: number
  }
  network: {
    inbound: number
    outbound: number
  }
  ets: {
    tables: number
    entries: number
    memory: number
  }
  sessions: SessionSummary[]
  trend: TrendPoint[]
}

export type SessionSummary = {
  id: string
  user: string
  role: string
  ip: string
  lastSeen: string
  currentPage: string
}
