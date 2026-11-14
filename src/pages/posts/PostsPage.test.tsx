import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PostsPage } from './PostsPage'
import { apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><PostsPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('PostsPage', () => {
  it('显示岗位并按状态筛选', async () => {
    vi.spyOn(apiClient, 'listPosts').mockResolvedValue([
      { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'operator', name: '运营专员', sortOrder: 1, enabled: true },
      { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'old', name: '停用岗位', sortOrder: 2, enabled: false },
    ])
    renderPage()
    expect(await screen.findByText('运营专员')).toBeInTheDocument()
    expect(screen.getByText('停用岗位')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('岗位状态'), { target: { value: 'enabled' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))
    await waitFor(() => expect(screen.queryByText('停用岗位')).not.toBeInTheDocument())
  })

  it('通过模态框提交新增岗位', async () => {
    vi.spyOn(apiClient, 'listPosts').mockResolvedValue([])
    const createPost = vi.spyOn(apiClient, 'createPost').mockResolvedValue({ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'operator', name: '运营专员', sortOrder: 1, enabled: true })
    renderPage()
    await screen.findByText('没有匹配的岗位')
    fireEvent.click(screen.getByRole('button', { name: /新增岗位/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('岗位编码 *'), { target: { value: 'operator' } })
    fireEvent.change(within(dialog).getByLabelText('岗位名称 *'), { target: { value: '运营专员' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存岗位' }))
    await waitFor(() => expect(createPost).toHaveBeenCalledWith({ code: 'operator', name: '运营专员', sortOrder: 0, enabled: true }))
  })

  it('提供岗位 XLSX 导出操作', async () => {
    vi.spyOn(apiClient, 'listPosts').mockResolvedValue([])
    const exportPosts = vi.spyOn(apiClient, 'exportPosts').mockResolvedValue({ blob: new Blob(['xlsx']), filename: 'posts.xlsx' })
    renderPage()
    await screen.findByText('没有匹配的岗位')
    fireEvent.click(screen.getByRole('button', { name: '导出 Excel' }))
    await waitFor(() => expect(exportPosts).toHaveBeenCalledOnce())
  })
})
