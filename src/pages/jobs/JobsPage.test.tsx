import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobsPage } from './JobsPage'
import { apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><JobsPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('JobsPage', () => {
  it('显示任务并按选择读取执行日志', async () => {
    vi.spyOn(apiClient, 'listJobs').mockResolvedValue([{ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: '2026-11-14T02:00:00Z' }])
    vi.spyOn(apiClient, 'listJobLogs').mockResolvedValue({ items: [{ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', jobId: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', jobCode: 'heartbeat', jobName: '系统心跳', jobGroup: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', triggerType: 1, status: 1, jobMessage: '任务执行成功', exceptionInfo: null, startedAt: '2026-11-14T02:00:00Z', finishedAt: '2026-11-14T02:00:00Z', durationMs: 12, createdAt: '2026-11-14T02:00:00Z' }], page: 1, size: 20, total: 1 })
    renderPage()
    expect(await screen.findByText('系统心跳')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /日志/ }))
    expect(await screen.findByText('任务执行成功')).toBeInTheDocument()
  })
})
