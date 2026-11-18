import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MonitorPage } from './MonitorPage'
import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'

vi.mock('../../widgets/monitor/TrendChart', () => ({
  TrendChart: ({ data }: { data: Array<{ timestamp: string; cpu: number | null; memory: number }> }) => (
    <div data-testid="monitor-trend-chart" data-sample-count={data.length}>
      {data.map((point) => <span key={point.timestamp}>{point.memory}</span>)}
    </div>
  ),
}))

const serverInfo = {
  javaVersion: '21',
  jvmName: 'OpenJDK',
  osName: 'Linux',
  osVersion: '6.8',
  processors: 8,
  maxMemory: 1_000,
  totalMemory: 800,
  freeMemory: 300,
  heapUsed: 500,
  uptimeMs: 10_000,
}
const cacheInfo = { provider: 'database', activeSessions: 2, loginLogEntries: 10 }
const onlineUsers = {
  items: [{
    sessionId: 'session-1',
    userId: 'user-1',
    username: 'operator',
    displayName: '管理员',
    ipAddress: '127.0.0.1',
    createdAt: '2026-11-17T01:59:00Z',
    expiresAt: '2026-11-18T01:59:00Z',
    accessExpiresAt: '2026-11-17T02:04:00Z',
  }],
  page: 1,
  size: 100,
  total: 1,
}
const fromApi = <T,>(value: T) => ({ value, source: 'api' as const })

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MonitorPage /></QueryClientProvider>)
}

function mockMonitorReads() {
  vi.spyOn(apiClient, 'getMonitorServerInfo').mockResolvedValue(fromApi(serverInfo))
  vi.spyOn(apiClient, 'getMonitorCacheInfo').mockResolvedValue(fromApi(cacheInfo))
  vi.spyOn(apiClient, 'listMonitorOnlineUsers').mockResolvedValue(fromApi(onlineUsers))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MonitorPage', () => {
  it('一个资源权限拒绝时仍显示其他资源，并标记整体部分可用', async () => {
    vi.spyOn(apiClient, 'getMonitorServerInfo').mockRejectedValue(new ApiError('forbidden', 403, 'permission_denied'))
    vi.spyOn(apiClient, 'getMonitorCacheInfo').mockResolvedValue(fromApi(cacheInfo))
    vi.spyOn(apiClient, 'listMonitorOnlineUsers').mockResolvedValue(fromApi(onlineUsers))
    renderPage()

    expect(await screen.findByText('operator')).toBeInTheDocument()
    expect(screen.getByText('无法读取主机信息')).toBeInTheDocument()
    expect(screen.getByText('PARTIAL')).toBeInTheDocument()
    expect(screen.getByText('部分监控资源读取失败')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('缓存统计权限拒绝时仍显示主机和在线会话', async () => {
    vi.spyOn(apiClient, 'getMonitorServerInfo').mockResolvedValue(fromApi(serverInfo))
    vi.spyOn(apiClient, 'getMonitorCacheInfo').mockRejectedValue(new ApiError('forbidden', 403, 'permission_denied'))
    vi.spyOn(apiClient, 'listMonitorOnlineUsers').mockResolvedValue(fromApi(onlineUsers))
    renderPage()

    expect((await screen.findAllByText('OpenJDK · Linux')).length).toBeGreaterThan(0)
    expect(screen.getByText('operator')).toBeInTheDocument()
    expect(screen.getByText('无法读取缓存统计')).toBeInTheDocument()
  })

  it('在线会话权限拒绝时仍显示主机和缓存统计', async () => {
    vi.spyOn(apiClient, 'getMonitorServerInfo').mockResolvedValue(fromApi(serverInfo))
    vi.spyOn(apiClient, 'getMonitorCacheInfo').mockResolvedValue(fromApi(cacheInfo))
    vi.spyOn(apiClient, 'listMonitorOnlineUsers').mockRejectedValue(new ApiError('forbidden', 403, 'permission_denied'))
    renderPage()

    expect((await screen.findAllByText('OpenJDK · Linux')).length).toBeGreaterThan(0)
    expect(screen.getByText('无法读取在线会话')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('重试主机资源只重新读取该资源', async () => {
    const getServerInfo = vi.spyOn(apiClient, 'getMonitorServerInfo')
      .mockRejectedValueOnce(new ApiError('forbidden', 403, 'permission_denied'))
      .mockResolvedValue(fromApi(serverInfo))
    const getCacheInfo = vi.spyOn(apiClient, 'getMonitorCacheInfo').mockResolvedValue(fromApi(cacheInfo))
    const getOnlineUsers = vi.spyOn(apiClient, 'listMonitorOnlineUsers').mockResolvedValue(fromApi(onlineUsers))
    renderPage()

    expect(await screen.findByText('无法读取主机信息')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect((await screen.findAllByText('OpenJDK · Linux')).length).toBeGreaterThan(0)
    expect(getServerInfo).toHaveBeenCalledTimes(2)
    expect(getCacheInfo).toHaveBeenCalledTimes(1)
    expect(getOnlineUsers).toHaveBeenCalledTimes(1)
  })

  it('全局刷新重新读取三项资源，单项重试保留旧数据并只刷新该项', async () => {
    const getServerInfo = vi.spyOn(apiClient, 'getMonitorServerInfo').mockResolvedValue(fromApi(serverInfo))
    const getCacheInfo = vi.spyOn(apiClient, 'getMonitorCacheInfo').mockResolvedValue(fromApi(cacheInfo))
    const getOnlineUsers = vi.spyOn(apiClient, 'listMonitorOnlineUsers')
      .mockResolvedValueOnce(fromApi(onlineUsers))
      .mockRejectedValueOnce(new ApiError('unavailable', 503, 'service_unavailable'))
      .mockResolvedValue(fromApi(onlineUsers))
    renderPage()

    expect(await screen.findByText('operator')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /刷新快照/ }))
    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(screen.getByText('PARTIAL')).toBeInTheDocument()
    expect(screen.getByText('operator')).toBeInTheDocument()
    expect(getServerInfo).toHaveBeenCalledTimes(2)
    expect(getCacheInfo).toHaveBeenCalledTimes(2)
    expect(getOnlineUsers).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(getOnlineUsers).toHaveBeenCalledTimes(3))
    expect(getServerInfo).toHaveBeenCalledTimes(2)
    expect(getCacheInfo).toHaveBeenCalledTimes(2)
    expect(screen.getByText('operator')).toBeInTheDocument()
  })

  it('只为成功的 API 主机响应记录堆内存，失败刷新不生成趋势点', async () => {
    const getServerInfo = vi.spyOn(apiClient, 'getMonitorServerInfo')
      .mockResolvedValueOnce(fromApi(serverInfo))
      .mockResolvedValueOnce(fromApi({ ...serverInfo, heapUsed: 600 }))
      .mockRejectedValueOnce(new ApiError('unavailable', 503, 'service_unavailable'))
    vi.spyOn(apiClient, 'getMonitorCacheInfo').mockResolvedValue(fromApi(cacheInfo))
    vi.spyOn(apiClient, 'listMonitorOnlineUsers').mockResolvedValue(fromApi(onlineUsers))
    renderPage()

    const chart = await screen.findByTestId('monitor-trend-chart')
    await waitFor(() => expect(chart).toHaveAttribute('data-sample-count', '1'))
    expect(screen.getByText('50')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /刷新快照/ }))
    await waitFor(() => expect(chart).toHaveAttribute('data-sample-count', '2'))
    expect(screen.getByText('60')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /刷新快照/ }))
    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(chart).toHaveAttribute('data-sample-count', '2')
    expect(getServerInfo).toHaveBeenCalledTimes(3)
  })

  it('开发 Mock 主机数据不进入真实趋势采样', async () => {
    vi.spyOn(apiClient, 'getMonitorServerInfo').mockResolvedValue({ value: serverInfo, source: 'mock' })
    vi.spyOn(apiClient, 'getMonitorCacheInfo').mockResolvedValue(fromApi(cacheInfo))
    vi.spyOn(apiClient, 'listMonitorOnlineUsers').mockResolvedValue(fromApi(onlineUsers))
    renderPage()

    expect(await screen.findByTestId('monitor-trend-chart')).toHaveAttribute('data-sample-count', '0')
    expect(screen.getByText((_, element) => element?.classList.contains('status-source') ?? false)).toHaveTextContent('系统 API + 开发 Mock')
  })

  it('强制下线失败时显示稳定业务错误诊断', async () => {
    mockMonitorReads()
    vi.spyOn(apiClient, 'revokeOnlineSession').mockRejectedValue(new ApiError('forbidden', 403, 'permission_denied', null, { requestId: 'monitor-1' }))
    renderPage()

    await screen.findByText('operator')
    fireEvent.click(screen.getByRole('button', { name: /operator/ }))
    fireEvent.click(screen.getByRole('button', { name: '强制下线' }))

    expect(await screen.findByText(/permission_denied/)).toBeInTheDocument()
    expect(screen.getByText(/requestId=monitor-1/)).toBeInTheDocument()
    expect(screen.getByText('没有执行此操作的权限')).toBeInTheDocument()
  })

  it('强制下线成功后只刷新在线会话，并保留成功提示', async () => {
    const getServerInfo = vi.spyOn(apiClient, 'getMonitorServerInfo').mockResolvedValue(fromApi(serverInfo))
    const getCacheInfo = vi.spyOn(apiClient, 'getMonitorCacheInfo').mockResolvedValue(fromApi(cacheInfo))
    const getOnlineUsers = vi.spyOn(apiClient, 'listMonitorOnlineUsers').mockResolvedValue(fromApi(onlineUsers))
    vi.spyOn(apiClient, 'revokeOnlineSession').mockResolvedValue({ currentSessionRevoked: false })
    renderPage()

    await screen.findByText('operator')
    fireEvent.click(screen.getByRole('button', { name: /operator/ }))
    fireEvent.click(screen.getByRole('button', { name: '强制下线' }))

    expect(await screen.findByText('已完成下线：operator')).toBeInTheDocument()
    await waitFor(() => expect(getOnlineUsers).toHaveBeenCalledTimes(2))
    expect(getServerInfo).toHaveBeenCalledTimes(1)
    expect(getCacheInfo).toHaveBeenCalledTimes(1)
  })
})
