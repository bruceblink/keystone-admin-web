import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoticesPage } from './NoticesPage'
import { ApiError, apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><NoticesPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('NoticesPage', () => {
  it('确认后批量删除公告', async () => {
    const notice = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', title: '平台维护通知', content: '维护内容', noticeType: 'announcement', published: true, enabled: true, publishAt: '2026-11-14T02:00:00Z', createdBy: 'operator', createdAt: '2026-11-14T02:00:00Z' }
    vi.spyOn(apiClient, 'listNotices').mockResolvedValue([notice])
    const deleteNotices = vi.spyOn(apiClient, 'deleteNotices').mockResolvedValue({ deleted: 1 })
    renderPage()

    await screen.findByText('平台维护通知')
    fireEvent.click(screen.getByLabelText('选择公告 平台维护通知'))
    fireEvent.click(screen.getByRole('button', { name: '删除公告（1）' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('删除后不可恢复')
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteNotices).toHaveBeenCalledWith([notice.id]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('发布状态更新失败时显示可关闭的错误反馈', async () => {
    const notice = { id: 'notice-1', title: '平台维护通知', content: '维护内容', noticeType: 'announcement', published: true, enabled: true, publishAt: '2026-11-14T02:00:00Z', createdBy: 'operator', createdAt: '2026-11-14T02:00:00Z' }
    vi.spyOn(apiClient, 'listNotices').mockResolvedValue([notice])
    vi.spyOn(apiClient, 'publishNotice').mockRejectedValue(new Error('发布接口不可用'))
    renderPage()

    await screen.findByText('平台维护通知')
    fireEvent.click(screen.getByRole('button', { name: '取消发布' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('公告状态更新失败')
    expect(error).toHaveTextContent('发布接口不可用')
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(screen.queryByText('公告状态更新失败')).not.toBeInTheDocument())
  })

  it('刷新失败时保留旧公告并提供带错误码语义的重试入口', async () => {
    const notice = { id: 'notice-2', title: '例行维护', content: '维护内容', noticeType: 'announcement', published: false, enabled: true, publishAt: null, createdBy: 'operator', createdAt: '2026-11-14T02:00:00Z' }
    const listNotices = vi.spyOn(apiClient, 'listNotices')
      .mockResolvedValueOnce([notice])
      .mockRejectedValueOnce(new ApiError('temporary failure', 503, 'service_unavailable'))
      .mockResolvedValueOnce([notice])
    renderPage()

    await screen.findByText('例行维护')
    fireEvent.click(screen.getByRole('button', { name: '刷新公告' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('数据刷新失败')
    expect(alert).toHaveTextContent('系统服务暂时不可用，请稍后重试')
    expect(screen.getByText('例行维护')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(listNotices).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByText('数据刷新失败')).not.toBeInTheDocument())
    expect(screen.getByText('例行维护')).toBeInTheDocument()
  })
})
