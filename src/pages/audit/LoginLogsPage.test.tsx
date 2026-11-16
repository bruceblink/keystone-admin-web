import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginLogsPage } from './LoginLogsPage'
import { ApiError, apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><LoginLogsPage /></QueryClientProvider>)
}

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('LoginLogsPage', () => {
  it('显示登录状态和来源信息', async () => {
    vi.spyOn(apiClient, 'listLoginLogs').mockResolvedValue({ items: [{ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', username: 'operator', status: 'SUCCESS', ipAddress: '127.0.0.1', message: '登录成功', userAgent: 'Chrome', loginAt: '2026-11-14T02:00:00Z' }], page: 1, size: 20, total: 1 })
    renderPage()
    expect(await screen.findByText('登录成功')).toBeInTheDocument()
    expect(screen.getByText('SUCCESS')).toBeInTheDocument()
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument()
  })

  it('按当前筛选条件导出登录日志 XLSX', async () => {
    const listLoginLogs = vi.spyOn(apiClient, 'listLoginLogs').mockResolvedValue({ items: [], page: 1, size: 20, total: 0 })
    const exportLoginLogs = vi.spyOn(apiClient, 'exportLoginLogs').mockResolvedValue({ blob: new Blob(['xlsx']), filename: 'login-logs.xlsx' })
    renderPage()
    await screen.findByText('没有匹配的登录记录')
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'operator' } })
    fireEvent.change(screen.getByLabelText('登录状态'), { target: { value: 'FAILURE' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))
    await waitFor(() => expect(listLoginLogs).toHaveBeenLastCalledWith({ username: 'operator', status: 'FAILURE', page: 1, size: 20 }))
    const exportButton = screen.getByRole('button', { name: '导出 Excel' })
    await waitFor(() => expect(exportButton).not.toBeDisabled())
    fireEvent.click(exportButton)
    await waitFor(() => expect(exportLoginLogs).toHaveBeenCalledWith({ username: 'operator', status: 'FAILURE' }))
  })

  it('导出失败时显示业务码诊断', async () => {
    vi.spyOn(apiClient, 'listLoginLogs').mockResolvedValue({ items: [], page: 1, size: 20, total: 0 })
    vi.spyOn(apiClient, 'exportLoginLogs').mockRejectedValue(new ApiError('internal detail', 503, 'service_unavailable', null, { requestId: 'login-export-1' }))
    renderPage()

    await screen.findByText('没有匹配的登录记录')
    fireEvent.click(screen.getByRole('button', { name: '导出 Excel' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('系统服务暂时不可用，请稍后重试')
    expect(alert).toHaveTextContent('service_unavailable')
    expect(alert).toHaveTextContent('requestId=login-export-1')
  })
})
