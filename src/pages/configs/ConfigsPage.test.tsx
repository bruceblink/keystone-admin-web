import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigsPage } from './ConfigsPage'
import { apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><ConfigsPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('ConfigsPage', () => {
  it('确认后删除系统配置', async () => {
    const config = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', key: 'security.session.ttl', value: '300', description: '访问令牌有效期', enabled: true, updatedAt: '2026-11-14T02:00:00Z' }
    vi.spyOn(apiClient, 'listSystemConfigs').mockResolvedValue([config])
    const deleteSystemConfig = vi.spyOn(apiClient, 'deleteSystemConfig').mockResolvedValue({ deleted: true })
    renderPage()

    await screen.findByText('security.session.ttl')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('删除后不可恢复')
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteSystemConfig).toHaveBeenCalledWith(config.key))
  })
})
