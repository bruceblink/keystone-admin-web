import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoticesPage } from './NoticesPage'
import { ApiError, apiClient } from '../../shared/api/client'
import type { NativeNotice } from '../../shared/api/schemas'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<BrowserRouter><QueryClientProvider client={queryClient}><NoticesPage /></QueryClientProvider></BrowserRouter>)
}

afterEach(() => vi.restoreAllMocks())
beforeEach(() => window.history.replaceState({}, '', '/notices'))

const notice: NativeNotice = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', title: '平台维护通知', content: '维护内容', noticeType: 'announcement', published: true, enabled: true, publishAt: '2026-11-14T02:00:00Z', createdBy: 'operator', createdAt: '2026-11-14T02:00:00Z' }
const page = (items = [notice], total = items.length, currentPage = 1) => ({ items, page: currentPage, size: 20, total })

describe('NoticesPage', () => {
  it('确认后批量删除公告', async () => {
    const listNoticesPage = vi.spyOn(apiClient, 'listNoticesPage').mockResolvedValue(page())
    const deleteNotices = vi.spyOn(apiClient, 'deleteNotices').mockResolvedValue({ deleted: 1 })
    renderPage()

    await screen.findByText('平台维护通知')
    fireEvent.click(screen.getByLabelText('选择公告 平台维护通知'))
    fireEvent.click(screen.getByRole('button', { name: '删除公告（1）' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('删除后不可恢复')
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteNotices).toHaveBeenCalledWith([notice.id]))
    expect(listNoticesPage).toHaveBeenCalledWith({ keyword: '', status: 'all', page: 1, size: 20 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('发布状态更新失败时显示可关闭的错误反馈', async () => {
    vi.spyOn(apiClient, 'listNoticesPage').mockResolvedValue(page())
    vi.spyOn(apiClient, 'publishNotice').mockRejectedValue(new ApiError('internal detail', 409, 'resource_conflict', null, { requestId: 'notice-publish-1' }))
    renderPage()

    await screen.findByText('平台维护通知')
    fireEvent.click(screen.getByRole('button', { name: '取消发布' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('公告状态更新失败')
    expect(error).toHaveTextContent('当前资源状态不允许此操作')
    expect(error).toHaveTextContent('resource_conflict')
    expect(error).toHaveTextContent('requestId=notice-publish-1')
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(screen.queryByText('公告状态更新失败')).not.toBeInTheDocument())
  })

  it('发布参数无效时显示专用错误码和提示', async () => {
    vi.spyOn(apiClient, 'listNoticesPage').mockResolvedValue(page())
    vi.spyOn(apiClient, 'publishNotice').mockRejectedValue(new ApiError('published must be boolean', 422, 'notice_published_invalid'))
    renderPage()

    await screen.findByText('平台维护通知')
    fireEvent.click(screen.getByRole('button', { name: '取消发布' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('公告状态更新失败')
    expect(error).toHaveTextContent('公告发布状态无效，请重试。')
    expect(error).toHaveTextContent('notice_published_invalid')
    expect(error).toHaveTextContent('公告发布状态必须是布尔值')
  })

  it('刷新失败时保留旧公告并提供带错误码语义的重试入口', async () => {
    const staleNotice = { ...notice, id: 'notice-2', title: '例行维护', published: false, publishAt: null }
    const listNotices = vi.spyOn(apiClient, 'listNoticesPage')
      .mockResolvedValueOnce(page([staleNotice]))
      .mockRejectedValueOnce(new ApiError('temporary failure', 503, 'service_unavailable'))
      .mockResolvedValueOnce(page([staleNotice]))
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

  it('按服务端 total 翻页并保存筛选条件到 URL', async () => {
    const secondNotice = { ...notice, id: 'notice-3', title: '第二页公告' }
    const listNoticesPage = vi.spyOn(apiClient, 'listNoticesPage').mockImplementation(async ({ page: currentPage }) => currentPage === 1 ? page([notice], 21, currentPage) : page([secondNotice], 21, currentPage))
    renderPage()

    await screen.findByText(notice.title)
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await screen.findByText(secondNotice.title)
    expect(listNoticesPage).toHaveBeenLastCalledWith({ keyword: '', status: 'all', page: 2, size: 20 })
    expect(window.location.search).toContain('notices_page=2')
  })

  it('分页失败、浏览器历史和筛选变化都会清除公告批量选择', async () => {
    const filteredNotice = { ...notice, id: 'notice-filtered', title: '筛选后的公告', published: false }
    const listNoticesPage = vi.spyOn(apiClient, 'listNoticesPage').mockImplementation(async ({ keyword, status, page: currentPage }) => {
      if (currentPage === 2) throw new ApiError('page request failed', 503, 'service_unavailable')
      if (keyword || status === 'unpublished') return page([filteredNotice], 1, currentPage)
      return page([notice], 21, currentPage)
    })
    const deleteNotices = vi.spyOn(apiClient, 'deleteNotices').mockResolvedValue({ deleted: 1 })
    renderPage()

    await screen.findByText(notice.title)
    fireEvent.click(screen.getByLabelText(`选择公告 ${notice.title}`))
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    expect(await screen.findByText('无法读取通知公告')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除公告（0）' })).toBeDisabled()

    window.history.pushState({}, '', '/notices?notices_page=1')
    fireEvent(window, new PopStateEvent('popstate'))
    await screen.findByText(notice.title)
    await waitFor(() => expect(screen.getByLabelText(`选择公告 ${notice.title}`)).not.toBeChecked())

    fireEvent.click(screen.getByLabelText(`选择公告 ${notice.title}`))
    fireEvent.change(screen.getByPlaceholderText('按标题、内容或类型筛选'), { target: { value: '筛选后的公告' } })
    fireEvent.click(screen.getByRole('button', { name: '查询' }))

    expect(await screen.findByText(filteredNotice.title)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除公告（0）' })).toBeDisabled()
    expect(listNoticesPage).toHaveBeenLastCalledWith({ keyword: '筛选后的公告', status: 'all', page: 1, size: 20 })
    expect(deleteNotices).not.toHaveBeenCalled()
  })
})
