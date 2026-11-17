import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationPopover } from './NotificationPopover'

const notice = {
  id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
  title: '维护通知',
  content: '今晚进行系统维护。',
  type: 'system.maintenance',
  createdAt: '2026-11-15T01:00:00Z',
  readAt: null,
}

describe('NotificationPopover', () => {
  it('selects a list item and renders its detail', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<NotificationPopover notices={[notice]} loading={false} error={null} refreshError={null} selected={null} readError={null} onSelect={onSelect} onBack={vi.fn()} onRetry={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /维护通知/ }))
    expect(onSelect).toHaveBeenCalledWith(notice)

    rerender(<NotificationPopover notices={[notice]} loading={false} error={null} refreshError={null} selected={notice} readError={null} onSelect={onSelect} onBack={vi.fn()} onRetry={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('通知详情')).toBeInTheDocument()
    expect(screen.getByText('今晚进行系统维护。')).toBeInTheDocument()
  })

  it('标记已读失败时保留详情并支持重试', () => {
    const onSelect = vi.fn()
    render(<NotificationPopover notices={[notice]} loading={false} error={null} refreshError={null} selected={notice} readError="无法标记已读，请重试" onSelect={onSelect} onBack={vi.fn()} onRetry={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('无法标记已读')
    expect(screen.getByText('今晚进行系统维护。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onSelect).toHaveBeenCalledWith(notice)
  })

  it('刷新失败时保留先前通知并允许重试', () => {
    const onRetry = vi.fn()
    render(<NotificationPopover notices={[notice]} loading={false} error={null} refreshError="刷新失败" selected={null} readError={null} onSelect={vi.fn()} onBack={vi.fn()} onRetry={onRetry} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /维护通知/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('上次读取的内容')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
