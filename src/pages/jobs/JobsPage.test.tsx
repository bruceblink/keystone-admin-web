import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobsPage } from './JobsPage'
import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><JobsPage /></QueryClientProvider>)
}

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('JobsPage', () => {
  it('从 URL 恢复任务筛选、分页和日志任务', async () => {
    const job = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: null }
    window.history.replaceState({}, '', `/jobs?jobs_keyword=heart&jobs_jobPage=2&jobs_selectedJobId=${job.id}&jobs_logPage=2`)
    vi.spyOn(apiClient, 'listJobs').mockResolvedValue({ items: [job], page: 2, size: 20, total: 21 })
    const listJobLogs = vi.spyOn(apiClient, 'listJobLogs').mockResolvedValue({ items: [], page: 2, size: 20, total: 21 })
    renderPage()

    expect(screen.getByLabelText('任务名称、编码或分组')).toHaveValue('heart')
    expect(await screen.findByText('系统心跳')).toBeInTheDocument()
    await waitFor(() => expect(listJobLogs).toHaveBeenLastCalledWith({ jobId: job.id, page: 2, size: 20 }))
  })

  it('任务列表按 20 条分页并显示当前页状态', async () => {
    const jobs = Array.from({ length: 21 }, (_, index) => ({
      id: `8d30e3aa-0c16-4d66-bf42-9b2f84f5a5${String(index + 10).padStart(2, '0')}`,
      code: `job-${index + 1}`,
      name: `任务 ${index + 1}`,
      group: 'SYSTEM',
      invokeTarget: 'keystoneJob.heartbeat()',
      jobParams: '{}',
      cron: '0/30 * * * * ?',
      concurrent: false,
      enabled: true,
      remark: null,
      lastStatus: 'SUCCESS',
      lastRunAt: null,
    }))
    vi.spyOn(apiClient, 'listJobs').mockImplementation(async ({ page = 1 } = {}) => ({ items: page === 1 ? jobs.slice(0, 20) : jobs.slice(20), page, size: 20, total: jobs.length }))
    renderPage()

    expect(await screen.findByText('任务 1')).toBeInTheDocument()
    expect(screen.queryByText('任务 21')).not.toBeInTheDocument()
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() => expect(apiClient.listJobs).toHaveBeenLastCalledWith({ keyword: '', page: 2, size: 20 }))
    expect(await screen.findByText('任务 21')).toBeInTheDocument()
    expect(screen.queryByText('任务 1')).not.toBeInTheDocument()
    expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument()
  })

  it('刷新任务失败时显示安全错误并保留旧列表', async () => {
    const job = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: null }
    vi.spyOn(apiClient, 'listJobs').mockResolvedValueOnce({ items: [job], page: 1, size: 20, total: 1 }).mockRejectedValueOnce(new ApiError('internal detail', 503, 'service_unavailable'))
    renderPage()

    await screen.findByText('系统心跳')
    fireEvent.click(screen.getByRole('button', { name: /刷新任务/ }))

    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(screen.getByText('系统服务暂时不可用，请稍后重试')).toBeInTheDocument()
    expect(screen.getByText('系统心跳')).toBeInTheDocument()
  })

  it('显示任务并按选择读取执行日志', async () => {
    vi.spyOn(apiClient, 'listJobs').mockResolvedValue({ items: [{ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: '2026-11-14T02:00:00Z' }], page: 1, size: 20, total: 1 })
    vi.spyOn(apiClient, 'listJobLogs').mockResolvedValue({ items: [{ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', jobId: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', jobCode: 'heartbeat', jobName: '系统心跳', jobGroup: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', triggerType: 1, status: 1, jobMessage: '任务执行成功', exceptionInfo: null, startedAt: '2026-11-14T02:00:00Z', finishedAt: '2026-11-14T02:00:00Z', durationMs: 12, createdAt: '2026-11-14T02:00:00Z' }], page: 1, size: 20, total: 1 })
    renderPage()
    expect(await screen.findByText('系统心跳')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /日志/ }))
    expect(await screen.findByText('任务执行成功')).toBeInTheDocument()
  })

  it('通过模态框新增任务并提供启停和手动执行入口', async () => {
    const job = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: '2026-11-14T02:00:00Z' }
    vi.spyOn(apiClient, 'listJobs').mockResolvedValue({ items: [job], page: 1, size: 20, total: 1 })
    vi.spyOn(apiClient, 'createJob').mockResolvedValue({ ...job, id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: 'cache-refresh', name: '缓存刷新' })
    vi.spyOn(apiClient, 'updateJobStatus').mockResolvedValue({ ...job, enabled: false })
    vi.spyOn(apiClient, 'triggerJob').mockResolvedValue({ triggered: true })
    renderPage()

    expect(await screen.findByText('系统心跳')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /新增任务/ }))
    fireEvent.change(screen.getByPlaceholderText('例如 refresh-cache'), { target: { value: 'cache-refresh' } })
    fireEvent.change(screen.getByRole('textbox', { name: '任务名称 *' }), { target: { value: '缓存刷新' } })
    fireEvent.change(screen.getByPlaceholderText('keystoneJob.heartbeat()'), { target: { value: 'keystoneJob.refresh()' } })
    fireEvent.change(screen.getByPlaceholderText('0/30 * * * * ?'), { target: { value: '0 0/5 * * * ?' } })
    fireEvent.click(screen.getByRole('button', { name: '保存任务' }))
    await waitFor(() => expect(apiClient.createJob).toHaveBeenCalledWith(expect.objectContaining({ code: 'cache-refresh', name: '缓存刷新', cron: '0 0/5 * * * ?' })))

    fireEvent.click(screen.getByTitle('停用 系统心跳'))
    await waitFor(() => expect(apiClient.updateJobStatus).toHaveBeenCalledWith(job.id, false))
    fireEvent.click(screen.getByTitle('执行 系统心跳'))
    await waitFor(() => expect(apiClient.triggerJob).toHaveBeenCalledWith(job.id))
  })

  it('确认后批量删除任务', async () => {
    const job = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: '2026-11-14T02:00:00Z' }
    vi.spyOn(apiClient, 'listJobs').mockResolvedValue({ items: [job], page: 1, size: 20, total: 1 })
    const deleteJobs = vi.spyOn(apiClient, 'deleteJobs').mockResolvedValue({ deleted: 1 })
    renderPage()

    await screen.findByText('系统心跳')
    fireEvent.click(screen.getByLabelText('选择任务 系统心跳'))
    fireEvent.click(screen.getByRole('button', { name: '删除任务（1）' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('删除后不可恢复')
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteJobs).toHaveBeenCalledWith([job.id]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('删除当前查看日志的任务后清除详情选择和 URL 状态', async () => {
    const job = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: null }
    const listJobs = vi.spyOn(apiClient, 'listJobs').mockResolvedValueOnce({ items: [job], page: 1, size: 20, total: 1 }).mockResolvedValue({ items: [], page: 1, size: 20, total: 0 })
    vi.spyOn(apiClient, 'listJobLogs').mockResolvedValue({ items: [], page: 1, size: 20, total: 0 })
    vi.spyOn(apiClient, 'deleteJobs').mockResolvedValue({ deleted: 1 })
    renderPage()

    await screen.findByText('系统心跳')
    fireEvent.click(screen.getByRole('button', { name: /日志/ }))
    await waitFor(() => expect(apiClient.listJobLogs).toHaveBeenCalledWith({ jobId: job.id, page: 1, size: 20 }))
    fireEvent.click(screen.getByLabelText('选择任务 系统心跳'))
    fireEvent.click(screen.getByRole('button', { name: '删除任务（1）' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(listJobs).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(window.location.search).not.toContain('jobs_selectedJobId'))
    expect(screen.queryByText(/系统心跳 · 执行日志/)).not.toBeInTheDocument()
    expect(screen.queryByText('无法读取任务详情')).not.toBeInTheDocument()
  })

  it('任务操作失败时显示业务错误诊断', async () => {
    const job = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: null }
    vi.spyOn(apiClient, 'listJobs').mockResolvedValue({ items: [job], page: 1, size: 20, total: 1 })
    vi.spyOn(apiClient, 'updateJobStatus').mockRejectedValue(new ApiError('任务状态冲突', 409, 'resource_conflict', null, { requestId: 'job-1' }))
    renderPage()
    await screen.findByText('系统心跳')
    fireEvent.click(screen.getByTitle('停用 系统心跳'))

    expect(await screen.findByText(/resource_conflict/)).toBeInTheDocument()
    expect(screen.getByText(/requestId=job-1/)).toBeInTheDocument()
  })

  it('深链接选择当前页之外的任务时读取任务详情', async () => {
    const detail = { id: '9d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'detail-job', name: '跨页任务', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: null }
    window.history.replaceState({}, '', '/jobs?jobs_jobPage=2&jobs_selectedJobId=' + detail.id)
    vi.spyOn(apiClient, 'listJobs').mockResolvedValue({ items: [], page: 2, size: 20, total: 21 })
    const getJob = vi.spyOn(apiClient, 'getJob').mockResolvedValue(detail)
    vi.spyOn(apiClient, 'listJobLogs').mockResolvedValue({ items: [], page: 1, size: 20, total: 0 })
    renderPage()

    expect(await screen.findByText(/跨页任务/)).toBeInTheDocument()
    await waitFor(() => expect(getJob).toHaveBeenCalledWith(detail.id))
  })
})
