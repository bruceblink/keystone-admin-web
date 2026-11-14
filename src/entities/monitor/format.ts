import type { MonitorStatus } from './types'

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
  if (status === 'OFFLINE') return '暂时无法连接 Native API'
  return '部分节点数据缺失'
}
