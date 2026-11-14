import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient } from './client'

const token = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  tokenType: 'Bearer',
  expiresIn: 300,
  refreshExpiresIn: 1_209_600,
  username: 'operator',
  displayName: '平台运维员',
  roles: ['系统管理员'],
  sessionId: 'session-1',
  clientId: 'web',
}

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ok(data: unknown): Response {
  return response({ success: true, data, message: 'OK', error: null })
}

describe('Native API client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('解包 Native 登录响应并使用刷新令牌恢复会话', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/auth/login')) return ok(token)
      if (url.endsWith('/auth/refresh')) return ok({ ...token, accessToken: 'access-2', refreshToken: 'refresh-2' })
      throw new Error(`unexpected request: ${url}`)
    }))

    const loggedIn = await apiClient.login('operator', 'secret')
    expect(loggedIn.user).toMatchObject({ username: 'operator', displayName: '平台运维员', role: '系统管理员' })
    expect(calls[0]?.init?.body).toContain('"clientId":"web"')

    const restored = await apiClient.restoreSession()
    expect(restored).toEqual(loggedIn.user)
    expect(calls[1]?.init?.body).toContain('"refreshToken":"refresh-1"')
  })

  it('使用 Native 监控接口组装真实可用指标并标记缺失指标', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/monitor/serverInfo')) return ok({
        javaVersion: '21', jvmName: 'OpenJDK', osName: 'Mac OS X', osVersion: '15', processors: 8,
        maxMemory: 1_000, totalMemory: 800, freeMemory: 300, heapUsed: 500, uptimeMs: 10_000,
      })
      if (url.endsWith('/monitor/cacheInfo')) return ok({ provider: 'database', activeSessions: 2, loginLogEntries: 10 })
      if (url.includes('/monitor/onlineUsers')) return ok({ items: [{
        sessionId: 'session-1', userId: 'user-1', username: 'operator', displayName: '系统管理员', ipAddress: '127.0.0.1',
        createdAt: '2026-11-14T01:00:00Z', expiresAt: '2026-11-28T01:00:00Z', accessExpiresAt: '2026-11-14T01:05:00Z',
      }], page: 1, size: 100, total: 1 })
      throw new Error(`unexpected request: ${url}`)
    }))

    const snapshot = await apiClient.getMonitorSnapshot()
    expect(snapshot.status).toBe('PARTIAL')
    expect(snapshot.cpu).toBeNull()
    expect(snapshot.memory).toBe(50)
    expect(snapshot.sessions[0]).toMatchObject({ id: 'session-1', user: 'operator', role: '系统管理员' })
    expect(snapshot.disk.total).toBeNull()
  })

  it('调用 Native 在线会话撤销接口并透传错误分类', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ loggedOut: true }))
      .mockResolvedValueOnce(response({ success: false, data: null, message: 'data scope denied', error: { code: 'data_scope_denied' } }, 403))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.revokeOnlineSession('session-2')
    expect(result.currentSessionRevoked).toBe(false)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/monitor/onlineUser/session-2')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')

    await expect(apiClient.revokeOnlineSession('session-3')).rejects.toMatchObject({
      status: 403,
      code: 'data_scope_denied',
    } satisfies Partial<ApiError>)
  })

  it('撤销当前会话后清理内存令牌并要求重新登录', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(token))
      .mockResolvedValueOnce(ok({ loggedOut: true }))
      .mockResolvedValueOnce(response(null, 401))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.login('operator', 'secret')
    const result = await apiClient.revokeOnlineSession('session-1')

    expect(result.currentSessionRevoked).toBe(true)
    expect(await apiClient.restoreSession()).toBeNull()
  })
})
