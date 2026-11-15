import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DictionariesPage } from './DictionariesPage'
import { ApiError, apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><DictionariesPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('DictionariesPage', () => {
  it('确认后删除字典类型', async () => {
    const type = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'user_status', name: '用户状态', enabled: true }
    vi.spyOn(apiClient, 'listDictionaryTypes').mockResolvedValue([type])
    vi.spyOn(apiClient, 'listDictionaryItems').mockResolvedValue([])
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
    vi.spyOn(apiClient, 'listDictionaryItems').mockResolvedValue([])
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
    const listDictionaryItems = vi.spyOn(apiClient, 'listDictionaryItems')
      .mockResolvedValueOnce([item])
      .mockRejectedValueOnce(new ApiError('temporary failure', 503, 'service_unavailable'))
      .mockResolvedValueOnce([item])
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
})
