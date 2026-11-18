import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PostsPage } from './PostsPage'
import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'

const capabilities = vi.hoisted(() => ({ permissions: ['post:read', 'post:create', 'post:export', 'post:update', 'post:delete'], post: true, error: false }))
vi.mock('../../shared/auth/useCapabilities', () => ({
  useCapabilities: () => ({ data: { permissions: capabilities.permissions, resources: { post: capabilities.post } }, isError: capabilities.error }),
}))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<BrowserRouter><QueryClientProvider client={queryClient}><PostsPage /></QueryClientProvider></BrowserRouter>)
}

afterEach(() => {
  vi.restoreAllMocks()
  capabilities.permissions = ['post:read', 'post:create', 'post:export', 'post:update', 'post:delete']
  capabilities.post = true
  capabilities.error = false
})

describe('PostsPage', () => {
  const postsPage = (items: Array<{ id: string; code: string; name: string; sortOrder: number; enabled: boolean }>, total = items.length, page = 1) => ({ items, page, size: 20, total })

  it('仅有读取权限时不显示岗位写入和导出操作', async () => {
    capabilities.permissions = ['post:read']
    vi.spyOn(apiClient, 'listPosts').mockResolvedValue(postsPage([{ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'operator', name: '运营专员', sortOrder: 1, enabled: true }]))
    renderPage()

    expect(await screen.findByText('运营专员')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新岗位' })).toBeInTheDocument()
    for (const name of ['新增岗位', '导出 Excel', '编辑', '删除']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '操作' })).not.toBeInTheDocument()
  })

  it('按独立权限显示岗位操作，权限撤销后隐藏已打开的表单', async () => {
    capabilities.permissions = ['post:read', 'post:update']
    vi.spyOn(apiClient, 'listPosts').mockResolvedValue(postsPage([{ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'operator', name: '运营专员', sortOrder: 1, enabled: true }]))
    const page = renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
    capabilities.permissions = ['post:read']
    page.rerender(<BrowserRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PostsPage /></QueryClientProvider></BrowserRouter>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('显示岗位并按状态筛选', async () => {
    const listPosts = vi.spyOn(apiClient, 'listPosts').mockResolvedValue(postsPage([
      { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'operator', name: '运营专员', sortOrder: 1, enabled: true },
      { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'old', name: '停用岗位', sortOrder: 2, enabled: false },
    ]))
    renderPage()
    expect(await screen.findByText('运营专员')).toBeInTheDocument()
    expect(screen.getByText('停用岗位')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('岗位状态'), { target: { value: 'enabled' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))
    await waitFor(() => expect(listPosts).toHaveBeenLastCalledWith({ keyword: '', status: 'enabled', page: 1, size: 20 }))
  })

  it('首次读取失败时仍显示列表操作工具栏', async () => {
    vi.spyOn(apiClient, 'listPosts').mockRejectedValue(new ApiError('服务暂时不可用', 503, 'service_unavailable'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取岗位列表')
    expect(screen.getByRole('group', { name: '列表操作' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 Excel' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /新增岗位/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: '刷新岗位' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('通过模态框提交新增岗位', async () => {
    vi.spyOn(apiClient, 'listPosts').mockResolvedValue(postsPage([]))
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
    vi.spyOn(apiClient, 'listPosts').mockResolvedValue(postsPage([]))
    const exportPosts = vi.spyOn(apiClient, 'exportPosts').mockResolvedValue({ blob: new Blob(['xlsx']), filename: 'posts.xlsx' })
    renderPage()
    await screen.findByText('没有匹配的岗位')
    fireEvent.click(screen.getByRole('button', { name: '导出 Excel' }))
    await waitFor(() => expect(exportPosts).toHaveBeenCalledOnce())
  })

  it('确认后删除岗位', async () => {
    const post = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'operator', name: '运营专员', sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listPosts').mockResolvedValue(postsPage([post]))
    const deletePost = vi.spyOn(apiClient, 'deletePost').mockResolvedValue({ deleted: true })
    renderPage()

    await screen.findByText('运营专员')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('删除后不可恢复')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deletePost).toHaveBeenCalledWith(post.id))
  })

  it('保存岗位失败时保留表单并显示业务错误诊断', async () => {
    vi.spyOn(apiClient, 'listPosts').mockResolvedValue(postsPage([]))
    vi.spyOn(apiClient, 'createPost').mockRejectedValue(new ApiError('岗位编码冲突', 409, 'resource_conflict', null, { requestId: 'post-1' }))
    renderPage()
    await screen.findByText('没有匹配的岗位')
    fireEvent.click(screen.getByRole('button', { name: /新增岗位/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('岗位编码 *'), { target: { value: 'operator' } })
    fireEvent.change(within(dialog).getByLabelText('岗位名称 *'), { target: { value: '运营专员' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存岗位' }))

    expect(await within(dialog).findByText(/resource_conflict/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('岗位编码 *')).toHaveValue('operator')
    expect(dialog).toHaveTextContent('requestId=post-1')
  })
})
