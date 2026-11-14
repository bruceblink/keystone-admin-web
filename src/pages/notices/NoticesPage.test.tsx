import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoticesPage } from './NoticesPage'
import { apiClient } from '../../shared/api/client'

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
})
