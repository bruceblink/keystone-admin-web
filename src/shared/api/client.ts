import { loginResponseSchema, monitorSnapshotSchema, userSchema, type User } from './schemas'
import { createMockLogin, createMockMonitorSnapshot } from './mock'
import type { MonitorSnapshot } from '../../entities/monitor/types'

const API_BASE = '/api/v1'
let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function mockFallbackEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK !== 'false'
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' })
  } catch {
    throw new ApiError('无法连接 Native API', 0, 'NETWORK_ERROR')
  }

  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshed = await refreshAccessToken()
    if (refreshed) return request<T>(path, init, false)
  }

  if (!response.ok) {
    let detail = `请求失败（${response.status}）`
    try {
      const body = (await response.json()) as { message?: string; code?: string }
      detail = body.message ?? detail
      throw new ApiError(detail, response.status, body.code)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(detail, response.status)
    }
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = request<{ accessToken: string }>('/auth/refresh', { method: 'POST' }, false)
    .then((result) => {
      accessToken = result.accessToken
      return accessToken
    })
    .catch(() => {
      accessToken = null
      return null
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

export const apiClient = {
  async login(username: string, password: string): Promise<{ accessToken: string; user: User }> {
    try {
      const result = loginResponseSchema.parse(
        await request<unknown>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        }),
      )
      accessToken = result.accessToken
      return result
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      const result = loginResponseSchema.parse(createMockLogin())
      accessToken = result.accessToken
      return result
    }
  },

  async restoreSession(): Promise<User | null> {
    try {
      const token = await refreshAccessToken()
      if (!token) throw new ApiError('会话不存在', 401)
      return userSchema.parse(await request<unknown>('/auth/me'))
    } catch (error) {
      if (!mockFallbackEnabled()) return null
      accessToken = createMockLogin().accessToken
      return (await Promise.resolve(createMockLogin())).user
    }
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' }, false)
    } catch {
      // 退出时服务端不可用仍然清理内存令牌。
    } finally {
      accessToken = null
    }
  },

  async getMonitorSnapshot(): Promise<MonitorSnapshot> {
    try {
      return monitorSnapshotSchema.parse(await request<unknown>('/monitor/snapshot'))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return monitorSnapshotSchema.parse(createMockMonitorSnapshot())
    }
  },
}
