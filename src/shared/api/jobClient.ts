import { nativeBatchDeleteResultSchema, nativeJobLogsPageSchema, nativeJobsPageSchema, nativeJobsSchema, nativeJobSchema, nativeJobTriggerResultSchema, type NativeBatchDeleteResult, type NativeJob, type NativeJobLogsPage, type NativeJobTriggerResult, type NativeJobWriteInput, type NativeJobsPage } from './schemas'
import { createMockJob, createMockJobs, triggerMockJob, updateMockJob, updateMockJobStatus } from './mock'
import { ApiError } from './errors'

export type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>
export type MockFallback = (error: unknown) => boolean

/** 计划任务接口适配器；集中管理任务写操作和开发环境的可重复 Mock 回退。 */
export const jobApi = {
  async listJobs(request: ApiRequest, fallback: MockFallback, filters: { keyword?: string; page?: number; size?: number } = {}): Promise<NativeJobsPage> {
    const page = filters.page ?? 1
    const size = filters.size ?? 20
    const params = new URLSearchParams({ page: String(page), size: String(size) })
    if (filters.keyword?.trim()) params.set('keyword', filters.keyword.trim())

    try {
      const payload = await request<unknown>(`/jobs?${params.toString()}`)
      const paged = nativeJobsPageSchema.safeParse(payload)
      if (paged.success) return paged.data
      const legacy = nativeJobsSchema.parse(payload)
      return { items: legacy, page, size, total: legacy.length }
    } catch (error) {
      if (!fallback(error)) throw error
      const items = createMockJobs()
      return { items, page, size, total: items.length }
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
      if (!fallback(error)) throw error
      return { items: [], page, size, total: 0 }
    }
  },

  async createJob(request: ApiRequest, fallback: MockFallback, input: NativeJobWriteInput): Promise<NativeJob> {
    try {
      return nativeJobSchema.parse(await request<unknown>('/jobs', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!fallback(error)) throw error
      return createMockJob(input)
    }
  },

  async updateJob(request: ApiRequest, fallback: MockFallback, id: string, input: NativeJobWriteInput): Promise<NativeJob> {
    try {
      return nativeJobSchema.parse(await request<unknown>(`/jobs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!fallback(error)) throw error
      return updateMockJob(id, input)
    }
  },

  async updateJobStatus(request: ApiRequest, fallback: MockFallback, id: string, enabled: boolean): Promise<NativeJob> {
    try {
      return nativeJobSchema.parse(await request<unknown>(`/jobs/${encodeURIComponent(id)}/status`, { method: 'PUT', body: JSON.stringify({ enabled }) }))
    } catch (error) {
      if (!fallback(error)) throw error
      return updateMockJobStatus(id, enabled)
    }
  },

  async triggerJob(request: ApiRequest, fallback: MockFallback, id: string): Promise<NativeJobTriggerResult> {
    try {
      return nativeJobTriggerResultSchema.parse(await request<unknown>(`/jobs/${encodeURIComponent(id)}/trigger`, { method: 'POST' }))
    } catch (error) {
      if (!fallback(error)) throw error
      return triggerMockJob(id)
    }
  },

  async deleteJobs(request: ApiRequest, fallback: MockFallback, ids: string[]): Promise<NativeBatchDeleteResult> {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
    if (uniqueIds.length === 0) throw new Error('至少选择一条任务')
    const query = new URLSearchParams({ jobIds: uniqueIds.join(',') }).toString()
    try {
      return nativeBatchDeleteResultSchema.parse(await request<unknown>(`/jobs?${query}`, { method: 'DELETE' }))
    } catch (error) {
      if (!fallback(error)) throw error
      return { deleted: uniqueIds.length }
    }
  },
}
