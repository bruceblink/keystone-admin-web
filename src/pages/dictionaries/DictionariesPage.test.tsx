import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DictionariesPage } from './DictionariesPage'
import { apiClient } from '../../shared/api/client'

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
})
