import {
  apiEnvelopeSchema,
  loginResponseSchema,
  monitorSnapshotSchema,
  nativeCacheInfoSchema,
  nativeOnlineUsersSchema,
  nativeServerInfoSchema,
  nativeTokenSchema,
  userSchema,
  type User,
} from './schemas'
import { createMockLogin, createMockMonitorSnapshot } from './mock'
import type { MonitorSnapshot } from '../../entities/monitor/types'

const API_BASE = '/api/v1'
const CLIENT_ID = 'web'
let accessToken: string | null = null
let refreshToken: string | null = null
let currentUser: User | null = null
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

function unwrap<T>(body: unknown, status: number): T {
  const envelope = apiEnvelopeSchema.safeParse(body)
  if (!envelope.success) return body as T
  if (!envelope.data.success) {
    throw new ApiError(envelope.data.message, status, envelope.data.error?.code)
  }
  return envelope.data.data as T
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
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
    throw new ApiError('无法连接 Native API', 0, 'network_error')
  }

  const body = response.status === 204 ? null : await readJson(response)
  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshed = await refreshAccessToken()
    if (refreshed) return request<T>(path, init, false)
  }

  if (!response.ok) {
    const envelope = apiEnvelopeSchema.safeParse(body)
    const message = envelope.success ? envelope.data.message : `请求失败（${response.status}）`
    const code = envelope.success ? envelope.data.error?.code : undefined
    throw new ApiError(message, response.status, code)
  }

  if (response.status === 204) return undefined as T
  return unwrap<T>(body, response.status)
}

function applyToken(token: ReturnType<typeof nativeTokenSchema.parse>): User {
  accessToken = token.accessToken
  refreshToken = token.refreshToken
  currentUser = userSchema.parse({
    username: token.username,
    displayName: token.displayName,
    role: token.roles[0] ?? '管理员',
  })
  return currentUser
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshToken) return null
  if (refreshPromise) return refreshPromise
  refreshPromise = request<unknown>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken, clientId: CLIENT_ID }),
  }, false)
    .then((result) => {
      const token = nativeTokenSchema.parse(result)
      applyToken(token)
      return token.accessToken
    })
    .catch(() => {
      accessToken = null
      refreshToken = null
      currentUser = null
      return null
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

function mockUserResult() {
  const result = loginResponseSchema.parse(createMockLogin())
  accessToken = result.accessToken
  refreshToken = null
  currentUser = result.user
  return result
}

export const apiClient = {
  async login(username: string, password: string): Promise<{ accessToken: string; user: User }> {
    try {
      const token = nativeTokenSchema.parse(await request<unknown>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, clientId: CLIENT_ID }),
      }))
      const user = applyToken(token)
      return { accessToken: token.accessToken, user }
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return mockUserResult()
    }
  },

  async restoreSession(): Promise<User | null> {
    try {
      const token = await refreshAccessToken()
      if (!token) return null
      return currentUser
    } catch (error) {
      if (!mockFallbackEnabled()) return null
      return mockUserResult().user
    }
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' }, false)
    } catch {
      // 退出时服务端不可用仍然清理内存令牌。
    } finally {
      accessToken = null
      refreshToken = null
      currentUser = null
    }
  },

  async getMonitorSnapshot(): Promise<MonitorSnapshot> {
    try {
      const [server, cache, online] = await Promise.all([
        request<unknown>('/monitor/serverInfo'),
        request<unknown>('/monitor/cacheInfo'),
        request<unknown>('/monitor/onlineUsers?page=1&size=100'),
      ])
      const serverInfo = nativeServerInfoSchema.parse(server)
      const cacheInfo = nativeCacheInfoSchema.parse(cache)
      const onlineUsers = nativeOnlineUsersSchema.parse(online)
      const capturedAt = new Date().toISOString()
      const memory = serverInfo.maxMemory > 0 ? (serverInfo.heapUsed / serverInfo.maxMemory) * 100 : null
      return monitorSnapshotSchema.parse({
        status: 'PARTIAL',
        capturedAt,
        source: 'Native API /monitor',
        node: `${serverInfo.jvmName} · ${serverInfo.osName}`,
        cpu: null,
        memory,
        beam: { processes: serverInfo.processors, reductions: null, runQueue: null },
        disk: { used: null, total: null },
        network: { inbound: null, outbound: null },
        ets: { tables: null, entries: cacheInfo.activeSessions, memory: null },
        sessions: onlineUsers.items.map((session) => ({
          id: session.sessionId,
          user: session.username,
          role: session.displayName,
          ip: session.ipAddress ?? '—',
          lastSeen: session.createdAt,
          currentPage: '—',
        })),
        trend: [{ timestamp: capturedAt, cpu: null, memory: memory ?? 0 }],
      })
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return monitorSnapshotSchema.parse(createMockMonitorSnapshot())
    }
  },

  async revokeOnlineSession(sessionId: string): Promise<void> {
    await request(`/monitor/onlineUser/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
  },
}
