import { nativeJobLogsPageSchema, nativeJobsSchema, nativeJobSchema, nativeJobTriggerResultSchema, type NativeJob, type NativeJobLogsPage, type NativeJobTriggerResult, type NativeJobWriteInput } from './schemas'
import { createMockJob, createMockJobs, triggerMockJob, updateMockJob, updateMockJobStatus } from './mock'

export type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>
export type MockFallback = () => boolean

/** 计划任务接口适配器；集中管理任务写操作和开发环境的可重复 Mock 回退。 */
export const jobApi = {
  async listJobs(request: ApiRequest, fallback: MockFallback): Promise<NativeJob[]> {
    try {
      return nativeJobsSchema.parse(await request<unknown>('/jobs'))
    } catch (error) {
      if (!fallback()) throw error
      return createMockJobs()
    }
  },

  async listJobLogs(request: ApiRequest, fallback: MockFallback, filters: { jobId?: string; page?: number; size?: number } = {}): Promise<NativeJobLogsPage> {
    const page = filters.page ?? 1
    const size = filters.size ?? 20
    const params = new URLSearchParams({ page: String(page), size: String(size) })
    if (filters.jobId?.trim()) params.set('jobId', filters.jobId.trim())

    try {
      return nativeJobLogsPageSchema.parse(await request<unknown>(`/jobs/logs?${params.toString()}`))
    } catch (error) {
      if (!fallback()) throw error
      return { items: [], page, size, total: 0 }
    }
  },

  async createJob(request: ApiRequest, fallback: MockFallback, input: NativeJobWriteInput): Promise<NativeJob> {
    try {
      return nativeJobSchema.parse(await request<unknown>('/jobs', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!fallback()) throw error
      return createMockJob(input)
    }
  },

  async updateJob(request: ApiRequest, fallback: MockFallback, id: string, input: NativeJobWriteInput): Promise<NativeJob> {
    try {
      return nativeJobSchema.parse(await request<unknown>(`/jobs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!fallback()) throw error
      return updateMockJob(id, input)
    }
  },

  async updateJobStatus(request: ApiRequest, fallback: MockFallback, id: string, enabled: boolean): Promise<NativeJob> {
    try {
      return nativeJobSchema.parse(await request<unknown>(`/jobs/${encodeURIComponent(id)}/status`, { method: 'PUT', body: JSON.stringify({ enabled }) }))
    } catch (error) {
      if (!fallback()) throw error
      return updateMockJobStatus(id, enabled)
    }
  },

  async triggerJob(request: ApiRequest, fallback: MockFallback, id: string): Promise<NativeJobTriggerResult> {
    try {
      return nativeJobTriggerResultSchema.parse(await request<unknown>(`/jobs/${encodeURIComponent(id)}/run`, { method: 'POST' }))
    } catch (error) {
      if (!fallback()) throw error
      return triggerMockJob(id)
    }
  },
}
