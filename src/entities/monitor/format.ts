import type { MonitorStatus, TrendPoint } from './types'

const MONITOR_TREND_WINDOW_MS = 30 * 60 * 1000
const MAX_MONITOR_TREND_SAMPLES = 120

/** 保留最近 30 分钟且最多 120 个成功采样点，避免长时间开页导致趋势无限增长。 */
export function appendMonitorTrendSample(samples: TrendPoint[], sample: TrendPoint, now = Date.now()): TrendPoint[] {
  const cutoff = now - MONITOR_TREND_WINDOW_MS
  const recentSamples = samples.filter((point) => {
    const timestamp = Date.parse(point.timestamp)
    return timestamp >= cutoff && timestamp <= now && point.timestamp !== sample.timestamp
  })
  const sampleTimestamp = Date.parse(sample.timestamp)
  const bounded = sampleTimestamp >= cutoff && sampleTimestamp <= now
    ? [...recentSamples, sample]
    : recentSamples

  return bounded.slice(-MAX_MONITOR_TREND_SAMPLES)
}

export function formatPercent(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}%`
}

export function formatBytes(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value < 1024) return `${value} MB`
  return `${(value / 1024).toFixed(1)} GB`
}

export function formatRate(value: number | null | undefined): string {
  if (value == null) return '—'
  return value >= 1024 ? `${(value / 1024).toFixed(1)} MB/s` : `${value} KB/s`
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

export function statusTone(status: MonitorStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'LIVE') return 'success'
  if (status === 'STALE') return 'warning'
  if (status === 'OFFLINE') return 'danger'
  return 'info'
}

export function statusMessage(status: MonitorStatus): string {
  if (status === 'LIVE') return '数据实时更新'
  if (status === 'STALE') return '保留最后一次有效快照'
  if (status === 'OFFLINE') return '暂时无法连接系统 API'
  return '部分节点数据缺失'
}
