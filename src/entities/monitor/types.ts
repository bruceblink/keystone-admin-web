export const monitorStatuses = ['LIVE', 'STALE', 'OFFLINE', 'PARTIAL'] as const

export type MonitorStatus = (typeof monitorStatuses)[number]

export type TrendPoint = {
  timestamp: string
  cpu: number | null
  memory: number
}

export type MonitorSnapshot = {
  status: MonitorStatus
  capturedAt: string
  source: string
  node: string
  cpu: number | null
  memory: number | null
  beam: {
    processes: number | null
    reductions: number | null
    runQueue: number | null
  }
  disk: {
    used: number | null
    total: number | null
  }
  network: {
    inbound: number | null
    outbound: number | null
  }
  ets: {
    tables: number | null
    entries: number | null
    memory: number | null
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
