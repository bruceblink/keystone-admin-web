import { describe, expect, it } from 'vitest'
import { formatBytes, formatPercent, formatRate, statusMessage, statusTone } from './format'

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
})
