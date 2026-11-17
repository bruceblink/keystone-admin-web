import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DictionariesPage } from './DictionariesPage'
import { ApiError, apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><DictionariesPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())
beforeEach(() => window.history.replaceState({}, '', '/dictionaries'))

const itemPage = (items: Array<{ id: string; typeCode: string; value: string; label: string; sortOrder: number; enabled: boolean }> = [], total = items.length, page = 1) => ({ items, total, page, size: 20 })

describe('DictionariesPage', () => {
  it('确认后删除字典类型', async () => {
    const type = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'user_status', name: '用户状态', enabled: true }
    vi.spyOn(apiClient, 'listDictionaryTypes').mockResolvedValue([type])
    vi.spyOn(apiClient, 'listDictionaryItemsPage').mockResolvedValue(itemPage())
    const deleteDictionaryType = vi.spyOn(apiClient, 'deleteDictionaryType').mockResolvedValue({ deleted: true })
    renderPage()

    await screen.findByText('用户状态')
    fireEvent.click(screen.getByRole('button', { name: '删除用户状态' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('删除后不可恢复')
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteDictionaryType).toHaveBeenCalledWith(type.code))
  })

  it('刷新字典类型失败时保留旧数据并支持重试', async () => {
    const type = { id: 'type-1', code: 'user_status', name: '用户状态', enabled: true }
    const listDictionaryTypes = vi.spyOn(apiClient, 'listDictionaryTypes')
      .mockResolvedValueOnce([type])
      .mockRejectedValueOnce(new ApiError('temporary failure', 503, 'service_unavailable'))
      .mockResolvedValueOnce([type])
    vi.spyOn(apiClient, 'listDictionaryItemsPage').mockResolvedValue(itemPage())
    renderPage()

    await screen.findByText('用户状态')
    fireEvent.click(screen.getByRole('button', { name: '刷新字典' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('数据刷新失败')
    expect(alert).toHaveTextContent('系统服务暂时不可用，请稍后重试')
    expect(screen.getByText('用户状态')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(listDictionaryTypes).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByText('数据刷新失败')).not.toBeInTheDocument())
    expect(screen.getByText('用户状态')).toBeInTheDocument()
  })

  it('刷新字典条目失败时保留旧数据并支持重试', async () => {
    const type = { id: 'type-2', code: 'region', name: '区域', enabled: true }
    const item = { id: 'item-1', typeCode: 'region', value: 'cn', label: '中国', sortOrder: 1, enabled: true }
    const listDictionaryItems = vi.spyOn(apiClient, 'listDictionaryItemsPage')
      .mockResolvedValueOnce(itemPage([item]))
      .mockRejectedValueOnce(new ApiError('temporary failure', 503, 'service_unavailable'))
      .mockResolvedValueOnce(itemPage([item]))
    vi.spyOn(apiClient, 'listDictionaryTypes').mockResolvedValue([type])
    renderPage()

    await screen.findByText('中国')
    fireEvent.click(screen.getByRole('button', { name: '刷新条目' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('数据刷新失败')
    expect(alert).toHaveTextContent('系统服务暂时不可用，请稍后重试')
    expect(screen.getByText('中国')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(listDictionaryItems).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByText('数据刷新失败')).not.toBeInTheDocument())
    expect(screen.getByText('中国')).toBeInTheDocument()
  })

  it('按服务端总数翻页并将字典条目页码写入 URL', async () => {
    const type = { id: 'type-4', code: 'region', name: '区域', enabled: true }
    const first = { id: 'item-4a', typeCode: 'region', value: 'cn', label: '中国', sortOrder: 1, enabled: true }
    const second = { id: 'item-4b', typeCode: 'region', value: 'us', label: '美国', sortOrder: 2, enabled: true }
    const listDictionaryItemsPage = vi.spyOn(apiClient, 'listDictionaryItemsPage').mockImplementation(async (_code, filters) => filters.page === 1 ? itemPage([first], 21, 1) : itemPage([second], 21, 2))
    vi.spyOn(apiClient, 'listDictionaryTypes').mockResolvedValue([type])
    renderPage()

    await screen.findByText('中国')
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    await screen.findByText('美国')
    expect(listDictionaryItemsPage).toHaveBeenLastCalledWith('region', { keyword: '', page: 2, size: 20 })
    expect(window.location.search).toContain('dictionaries_itemPage=2')
  })

  // 验证查询条件可通过链接恢复，不依赖页面内存状态。
  it('提交字典类型筛选后把条件写入 URL 并在重新进入时恢复', async () => {
    const types = [
      { id: 'type-status', code: 'user_status', name: '用户状态', enabled: true },
      { id: 'type-region', code: 'region', name: '区域', enabled: true },
    ]
    vi.spyOn(apiClient, 'listDictionaryTypes').mockResolvedValue(types)
    vi.spyOn(apiClient, 'listDictionaryItemsPage').mockResolvedValue(itemPage())
    const firstPage = renderPage()

    await screen.findByText('用户状态')
    const typeFilter = screen.getByLabelText('类型编码或名称')
    fireEvent.change(typeFilter, { target: { value: 'region' } })
    fireEvent.submit(typeFilter.closest('form')!)

    expect(await screen.findByText('区域')).toBeInTheDocument()
    expect(screen.queryByText('用户状态')).not.toBeInTheDocument()
    expect(window.location.search).toContain('dictionaries_keyword=region')

    firstPage.unmount()
    renderPage()

    expect(await screen.findByLabelText('类型编码或名称')).toHaveValue('region')
    expect(await screen.findByText('区域')).toBeInTheDocument()
    expect(screen.queryByText('用户状态')).not.toBeInTheDocument()
  })

  it('删除字典类型失败时显示业务码诊断并保留确认上下文', async () => {
    const type = { id: 'type-3', code: 'user_status', name: '用户状态', enabled: true }
    vi.spyOn(apiClient, 'listDictionaryTypes').mockResolvedValue([type])
    vi.spyOn(apiClient, 'listDictionaryItemsPage').mockResolvedValue(itemPage())
    vi.spyOn(apiClient, 'deleteDictionaryType').mockRejectedValue(new ApiError('internal detail', 409, 'resource_conflict', null, { requestId: 'dict-delete-1' }))
    renderPage()

    await screen.findByText(type.name)
    fireEvent.click(screen.getByRole('button', { name: `删除${type.name}` }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    expect((await screen.findAllByText(/resource_conflict/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('dialog')).toHaveTextContent('requestId=dict-delete-1')
  })
})
