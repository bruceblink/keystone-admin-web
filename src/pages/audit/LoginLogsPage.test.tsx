import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginLogsPage } from './LoginLogsPage'
import { apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><LoginLogsPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('LoginLogsPage', () => {
  it('显示登录状态和来源信息', async () => {
    vi.spyOn(apiClient, 'listLoginLogs').mockResolvedValue({ items: [{ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', username: 'operator', status: 'SUCCESS', ipAddress: '127.0.0.1', message: '登录成功', userAgent: 'Chrome', loginAt: '2026-11-14T02:00:00Z' }], page: 1, size: 20, total: 1 })
    renderPage()
    expect(await screen.findByText('登录成功')).toBeInTheDocument()
    expect(screen.getByText('SUCCESS')).toBeInTheDocument()
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument()
  })
})
