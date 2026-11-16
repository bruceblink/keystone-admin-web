import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigsPage } from './ConfigsPage'
import { ApiError, apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><ConfigsPage /></QueryClientProvider>)
}

const config = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', key: 'security.session.ttl', value: '300', description: '访问令牌有效期', enabled: true, updatedAt: '2026-11-14T02:00:00Z' }
const page = (items = [config], total = items.length, currentPage = 1) => ({ items, page: currentPage, size: 20, total })

afterEach(() => vi.restoreAllMocks())
beforeEach(() => window.history.replaceState({}, '', '/configs'))

describe('ConfigsPage', () => {
  it('确认后删除系统配置', async () => {
    const listSystemConfigsPage = vi.spyOn(apiClient, 'listSystemConfigsPage').mockResolvedValue(page())
    const deleteSystemConfig = vi.spyOn(apiClient, 'deleteSystemConfig').mockResolvedValue({ deleted: true })
    renderPage()

    await screen.findByText('security.session.ttl')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('删除后不可恢复')
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteSystemConfig).toHaveBeenCalledWith(config.key))
    expect(listSystemConfigsPage).toHaveBeenCalledWith({ keyword: '', page: 1, size: 20 })
  })

  it('删除失败时显示业务码诊断并保留确认上下文', async () => {
    const listSystemConfigsPage = vi.spyOn(apiClient, 'listSystemConfigsPage').mockResolvedValue(page())
    vi.spyOn(apiClient, 'deleteSystemConfig').mockRejectedValue(new ApiError('internal detail', 409, 'resource_conflict', null, { requestId: 'config-delete-1' }))
    renderPage()

    await screen.findByText(config.key)
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    expect((await screen.findAllByText(/resource_conflict/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('dialog')).toHaveTextContent('requestId=config-delete-1')
    expect(screen.getByRole('dialog')).toHaveTextContent('删除后不可恢复')
    expect(listSystemConfigsPage).toHaveBeenCalledWith({ keyword: '', page: 1, size: 20 })
  })

  it('按服务端 total 翻页并将筛选条件写入 URL', async () => {
    const secondConfig = { ...config, id: 'config-2', key: 'feature.audit.enabled' }
    const listSystemConfigsPage = vi.spyOn(apiClient, 'listSystemConfigsPage').mockImplementation(async ({ page: currentPage, keyword }) =>
      currentPage === 1 ? page([config], 21, currentPage) : page([secondConfig], 21, currentPage))
    renderPage()

    await screen.findByText(config.key)
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    await screen.findByText(secondConfig.key)
    expect(listSystemConfigsPage).toHaveBeenLastCalledWith({ keyword: '', page: 2, size: 20 })
    expect(window.location.search).toContain('configs_page=2')
  })

  it('刷新失败时保留当前页并显示重试反馈', async () => {
    const listSystemConfigsPage = vi.spyOn(apiClient, 'listSystemConfigsPage')
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(new ApiError('internal detail', 503, 'service_unavailable', null, { requestId: 'config-refresh-1' }))
    renderPage()

    await screen.findByText(config.key)
    fireEvent.click(screen.getByRole('button', { name: '刷新配置' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('config-refresh-1')
    expect(screen.getByText(config.key)).toBeInTheDocument()
    expect(listSystemConfigsPage).toHaveBeenCalledTimes(2)
  })
})
