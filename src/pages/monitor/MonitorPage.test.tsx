import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MonitorPage } from './MonitorPage'
import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'

const snapshot = {
  status: 'LIVE' as const,
  capturedAt: '2026-11-17T02:00:00Z',
  source: '系统 API',
  node: 'phoenix@127.0.0.1',
  cpu: 12,
  memory: 34,
  beam: { processes: 120, reductions: 1000, runQueue: 0 },
  disk: { used: 20, total: 100 },
  network: { inbound: 10, outbound: 8 },
  ets: { tables: 12, entries: 24, memory: 1024 },
  sessions: [{ id: 'session-1', user: 'operator', role: '管理员', ip: '127.0.0.1', lastSeen: '2026-11-17T01:59:00Z', currentPage: '/monitor' }],
  trend: [],
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MonitorPage /></QueryClientProvider>)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MonitorPage', () => {
  it('强制下线失败时显示稳定业务错误诊断', async () => {
    vi.spyOn(apiClient, 'getMonitorSnapshot').mockResolvedValue(snapshot)
    vi.spyOn(apiClient, 'revokeOnlineSession').mockRejectedValue(new ApiError('forbidden', 403, 'permission_denied', null, { requestId: 'monitor-1' }))
    renderPage()

    await screen.findByText('operator')
    fireEvent.click(screen.getByRole('button', { name: /operator/ }))
    fireEvent.click(screen.getByRole('button', { name: '强制下线' }))

    expect(await screen.findByText(/permission_denied/)).toBeInTheDocument()
    expect(screen.getByText(/requestId=monitor-1/)).toBeInTheDocument()
    expect(screen.getByText('没有执行此操作的权限')).toBeInTheDocument()
  })

  it('强制下线成功后保留成功提示并刷新快照', async () => {
    const getSnapshot = vi.spyOn(apiClient, 'getMonitorSnapshot').mockResolvedValue(snapshot)
    vi.spyOn(apiClient, 'revokeOnlineSession').mockResolvedValue({ currentSessionRevoked: false })
    renderPage()

    await screen.findByText('operator')
    fireEvent.click(screen.getByRole('button', { name: /operator/ }))
    fireEvent.click(screen.getByRole('button', { name: '强制下线' }))

    expect(await screen.findByText('已完成下线：operator')).toBeInTheDocument()
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(2))
  })
})
