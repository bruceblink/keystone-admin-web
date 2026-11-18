import { describe, expect, it } from 'vitest'
import { appendMonitorTrendSample, formatBytes, formatPercent, formatRate, statusMessage, statusTone } from './format'

describe('monitor formatting', () => {
  it('formats health values for compact cards', () => {
    expect(formatPercent(61.4)).toBe('61%')
    expect(formatBytes(2048)).toBe('2.0 GB')
    expect(formatRate(2048)).toBe('2.0 MB/s')
  })

  it('maps every health state to a readable status tone', () => {
    expect(statusTone('LIVE')).toBe('success')
    expect(statusTone('STALE')).toBe('warning')
    expect(statusTone('OFFLINE')).toBe('danger')
    expect(statusTone('PARTIAL')).toBe('info')
    expect(statusMessage('STALE')).toContain('最后一次')
  })

  it('只保留最近 30 分钟内且最多 120 个趋势采样点', () => {
    const now = Date.parse('2026-11-18T04:00:00.000Z')
    const samples = Array.from({ length: 120 }, (_, index) => ({
      timestamp: new Date(now - 30 * 60_000 + index * 15_000).toISOString(),
      cpu: null,
      memory: 40 + index / 10,
    }))
    const next = { timestamp: new Date(now).toISOString(), cpu: null, memory: 55 }

    const result = appendMonitorTrendSample(samples, next, now)

    expect(result).toHaveLength(120)
    expect(result[0]?.timestamp).toBe(samples[1]?.timestamp)
    expect(result.at(-1)).toEqual(next)
  })

  it('丢弃窗口外的旧点和晚于当前时间的采样', () => {
    const now = Date.parse('2026-11-18T04:00:00.000Z')
    const old = { timestamp: new Date(now - 30 * 60_000 - 1).toISOString(), cpu: null, memory: 30 }
    const future = { timestamp: new Date(now + 1).toISOString(), cpu: null, memory: 90 }

    expect(appendMonitorTrendSample([old], future, now)).toEqual([])
  })
})
