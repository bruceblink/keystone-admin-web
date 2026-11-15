import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationPopover } from './NotificationPopover'

const notice = {
  id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
  title: '维护通知',
  content: '今晚进行系统维护。',
  noticeType: 'notification',
  published: true,
  enabled: true,
  publishAt: '2026-11-15T02:00:00Z',
  createdBy: 'operator',
  createdAt: '2026-11-15T01:00:00Z',
}

describe('NotificationPopover', () => {
  it('selects a list item and renders its detail', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<NotificationPopover notices={[notice]} loading={false} error={null} selected={null} onSelect={onSelect} onBack={vi.fn()} onRetry={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /维护通知/ }))
    expect(onSelect).toHaveBeenCalledWith(notice)

    rerender(<NotificationPopover notices={[notice]} loading={false} error={null} selected={notice} onSelect={onSelect} onBack={vi.fn()} onRetry={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('通知详情')).toBeInTheDocument()
    expect(screen.getByText('今晚进行系统维护。')).toBeInTheDocument()
  })
})
