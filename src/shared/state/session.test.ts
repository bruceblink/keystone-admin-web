import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { useSessionStore } from './session'

/** 验证认证和静默刷新改变权限查询使用的认证代次。 */
const token = {
  accessToken: 'access-a', refreshToken: 'refresh-a', tokenType: 'Bearer', expiresIn: 300,
  refreshExpiresIn: 1_209_600, username: 'account-a', displayName: '账号 A', roles: ['管理员'],
  sessionId: 'session-a', clientId: 'web',
}

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data, message: 'OK', error: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, message: null, authRevision: 0 })
})

describe('session capability lifecycle', () => {
  it('认证和静默刷新都更新会话代次，促使能力查询更换缓存键', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'false')
    let serverReads = 0
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return response(token)
      if (url.endsWith('/auth/refresh')) return response({ ...token, accessToken: 'access-b', refreshToken: 'refresh-b' })
      if (url.endsWith('/auth/logout')) return response({ loggedOut: true })
      if (url.endsWith('/monitor/serverInfo')) {
        serverReads += 1
        if (serverReads === 1) return new Response(JSON.stringify({ success: false, data: null, message: 'expired', error: { code: 'authentication_required' } }), { status: 401 })
        return response({ javaVersion: '21', jvmName: 'OpenJDK', osName: 'Linux', osVersion: '6', processors: 4, maxMemory: 1000, totalMemory: 800, freeMemory: 300, heapUsed: 500, uptimeMs: 1000 })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await useSessionStore.getState().login('account-a', 'password')
    expect(useSessionStore.getState().authRevision).toBe(1)
    await apiClient.getMonitorServerInfo()
    expect(useSessionStore.getState().authRevision).toBe(2)
    expect(serverReads).toBe(2)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/refresh', expect.anything())

    await useSessionStore.getState().logout()
    expect(useSessionStore.getState().user).toBeNull()
  })
})
