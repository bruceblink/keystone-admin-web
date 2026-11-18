import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperationsAuditPage } from './OperationsAuditPage'
import { ApiError, apiClient } from '../../shared/api/client'
import type { NativeOperationLogsPage } from '../../shared/api/schemas'

const logPage: NativeOperationLogsPage = {
  items: [{
    id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', actorUsername: 'operator', action: 'UPDATE',
    resource: 'user', resourceId: 'a3a4b5c6-d7e8-4f90-8123-456789abcdef', detail: '更新用户资料',
    createdAt: '2026-11-14T02:00:00Z',
  }],
  page: 1,
  size: 20,
  total: 21,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><OperationsAuditPage /></QueryClientProvider>)
}

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('OperationsAuditPage', () => {
  it('显示操作记录并按筛选条件查询下一页', async () => {
    const listOperationLogs = vi.spyOn(apiClient, 'listOperationLogs').mockResolvedValue(logPage)
    renderPage()

    expect(await screen.findByText('更新用户资料')).toBeInTheDocument()
    expect(screen.getByText('operator')).toBeInTheDocument()
    expect(screen.getByText('a3a4b5c6-d7e8-4f90-8123-456789abcdef')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('操作用户'), { target: { value: 'operator' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))
    await waitFor(() => expect(listOperationLogs).toHaveBeenLastCalledWith({ actor: 'operator', action: '', resource: '', page: 1, size: 20 }))

    await screen.findByRole('button', { name: '下一页' })
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(listOperationLogs).toHaveBeenLastCalledWith({ actor: 'operator', action: '', resource: '', page: 2, size: 20 }))
  })

  it('过期页深链读取失败时保留 URL，重试成功后回到最后有效页', async () => {
    window.history.replaceState({}, '', '/audit/operations?operations_audit_page=4')
    const listOperationLogs = vi.spyOn(apiClient, 'listOperationLogs')
      .mockRejectedValueOnce(new ApiError('暂时不可用', 503, 'service_unavailable'))
      .mockResolvedValueOnce({ ...logPage, items: [], page: 4, total: 21 })
      .mockResolvedValueOnce({ ...logPage, items: [{ ...logPage.items[0], detail: '恢复后的审计记录' }], page: 2, total: 21 })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取操作审计')
    expect(window.location.search).toContain('operations_audit_page=4')
    expect(listOperationLogs).toHaveBeenCalledWith({ actor: '', action: '', resource: '', page: 4, size: 20 })

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('恢复后的审计记录')).toBeInTheDocument()
    await waitFor(() => expect(listOperationLogs).toHaveBeenCalledTimes(3))
    expect(listOperationLogs.mock.calls.map(([filters]) => filters?.page)).toEqual([4, 4, 2])
    expect(window.location.search).toContain('operations_audit_page=2')
    expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument()
  })

  it('显示空结果状态', async () => {
    vi.spyOn(apiClient, 'listOperationLogs').mockResolvedValue({ ...logPage, items: [], total: 0 })
    renderPage()

    expect(await screen.findByText('没有匹配的操作记录')).toBeInTheDocument()
    expect(screen.getByText('调整筛选条件后重试，或清空筛选条件查看全部记录。')).toBeInTheDocument()
  })

  it('显示读取错误并提供重试入口', async () => {
    vi.spyOn(apiClient, 'listOperationLogs').mockRejectedValue(new ApiError('权限不足', 403, 'permission_denied'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取操作审计')
    expect(screen.getByText('没有执行此操作的权限')).toBeInTheDocument()
    expect(screen.getByText(/诊断：permission_denied/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('按当前筛选条件导出操作审计 XLSX', async () => {
    const exportOperationLogs = vi.spyOn(apiClient, 'exportOperationLogs').mockResolvedValue({ blob: new Blob(['xlsx']), filename: 'operation-logs.xlsx' })
    vi.spyOn(apiClient, 'listOperationLogs').mockResolvedValue({ ...logPage, items: [], total: 0 })
    renderPage()
    await screen.findByText('没有匹配的操作记录')
    fireEvent.change(screen.getByLabelText('资源类型'), { target: { value: 'user' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))
    await waitFor(() => expect(apiClient.listOperationLogs).toHaveBeenLastCalledWith({ actor: '', action: '', resource: 'user', page: 1, size: 20 }))
    const exportButton = screen.getByRole('button', { name: '导出 Excel' })
    await waitFor(() => expect(exportButton).not.toBeDisabled())
    fireEvent.click(exportButton)
    await waitFor(() => expect(exportOperationLogs).toHaveBeenCalledWith({ actor: '', action: '', resource: 'user' }))
  })

  it('导出失败时显示业务码诊断', async () => {
    vi.spyOn(apiClient, 'listOperationLogs').mockResolvedValue({ ...logPage, items: [], total: 0 })
    vi.spyOn(apiClient, 'exportOperationLogs').mockRejectedValue(new ApiError('internal detail', 503, 'service_unavailable', null, { requestId: 'operation-export-1' }))
    renderPage()

    await screen.findByText('没有匹配的操作记录')
    fireEvent.click(screen.getByRole('button', { name: '导出 Excel' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('系统服务暂时不可用，请稍后重试')
    expect(alert).toHaveTextContent('service_unavailable')
    expect(alert).toHaveTextContent('requestId=operation-export-1')
  })

  it('刷新失败时显示安全错误并保留旧审计记录', async () => {
    vi.spyOn(apiClient, 'listOperationLogs').mockResolvedValueOnce(logPage).mockRejectedValueOnce(new ApiError('internal detail', 503, 'service_unavailable'))
    renderPage()

    await screen.findByText('更新用户资料')
    fireEvent.click(screen.getByRole('button', { name: '刷新列表' }))

    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(screen.getByText('系统服务暂时不可用，请稍后重试')).toBeInTheDocument()
    expect(screen.getByText('更新用户资料')).toBeInTheDocument()
  })
})
