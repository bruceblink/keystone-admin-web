import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, clearLocalAuthentication } from '../api/client'
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
  clearLocalAuthentication()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, message: null, authRevision: 0 })
})

describe('session capability lifecycle', () => {
  it('能力读取触发过期令牌刷新时不发送旧认证头并只推进认证代次一次', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'false')
    clearLocalAuthentication()
    let capabilityReads = 0
    const refreshHeaders: Headers[] = []
    const capabilities = {
      permissions: ['menu:read'],
      resources: {
        user: false, department: false, role: false, post: false, menu: true, config: false,
        dictionary: false, notice: false, job: false, audit: false, session: false,
        'api-key': false, profile: false,
      },
    }
    const loginHeaders: Headers[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) {
        loginHeaders.push(new Headers(init?.headers))
        return response(token)
      }
      if (url.endsWith('/auth/refresh')) {
        refreshHeaders.push(new Headers(init?.headers))
        return response({ ...token, accessToken: 'access-b', refreshToken: 'refresh-b' })
      }
      if (url.endsWith('/auth/me/capabilities')) {
        capabilityReads += 1
        expect(new Headers(init?.headers).get('Authorization')).toBe(capabilityReads === 1 ? 'Bearer access-a' : 'Bearer access-b')
        if (capabilityReads === 1) {
          return new Response(JSON.stringify({ success: false, data: null, message: 'expired', error: { code: 'authentication_required' } }), { status: 401 })
        }
        return response(capabilities)
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await useSessionStore.getState().login('account-a', 'password')
    const revisionAfterLogin = useSessionStore.getState().authRevision
    const revisionChanges: number[] = []
    const unsubscribe = useSessionStore.subscribe((state, previous) => {
      if (state.authRevision !== previous.authRevision) revisionChanges.push(state.authRevision)
    })
    try {
      await expect(apiClient.getCapabilities()).resolves.toEqual(capabilities)

      expect(loginHeaders[0]?.has('Authorization')).toBe(false)
      expect(refreshHeaders[0]?.has('Authorization')).toBe(false)
      expect(capabilityReads).toBe(2)
      expect(useSessionStore.getState().authRevision).toBe(revisionAfterLogin + 1)
      expect(revisionChanges).toEqual([revisionAfterLogin + 1])
    } finally {
      unsubscribe()
    }
  })

  it('能力请求作为并发刷新发起方时共享刷新只通知一次', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'false')
    clearLocalAuthentication()
    let startRefresh!: () => void
    let releaseRefresh!: (value: Response) => void
    let menuUnauthorized!: () => void
    const refreshStarted = new Promise<void>((resolve) => { startRefresh = resolve })
    const menuFirstAttempt = new Promise<void>((resolve) => { menuUnauthorized = resolve })
    const refreshResponse = new Promise<Response>((resolve) => { releaseRefresh = resolve })
    const refreshRequests: RequestInit[] = []
    const menuAuthorizationHeaders: Array<string | null> = []
    const capabilities = {
      permissions: ['menu:read'],
      resources: {
        user: false, department: false, role: false, post: false, menu: true, config: false,
        dictionary: false, notice: false, job: false, audit: false, session: false,
        'api-key': false, profile: false,
      },
    }
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return response(token)
      if (url.endsWith('/auth/refresh')) {
        refreshRequests.push(init ?? {})
        startRefresh()
        return refreshResponse
      }
      if (url.endsWith('/auth/me/capabilities')) {
        if (new Headers(init?.headers).get('Authorization') === 'Bearer access-a') {
          return new Response(JSON.stringify({ success: false, data: null, message: 'expired', error: { code: 'authentication_required' } }), { status: 401 })
        }
        return response(capabilities)
      }
      if (url.endsWith('/menus')) {
        const authorization = new Headers(init?.headers).get('Authorization')
        menuAuthorizationHeaders.push(authorization)
        if (authorization === 'Bearer access-a') {
          menuUnauthorized()
          return new Response(JSON.stringify({ success: false, data: null, message: 'expired', error: { code: 'authentication_required' } }), { status: 401 })
        }
        return response([])
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await useSessionStore.getState().login('account-a', 'password')
    const revisionAfterLogin = useSessionStore.getState().authRevision
    const revisionChanges: number[] = []
    const unsubscribe = useSessionStore.subscribe((state, previous) => {
      if (state.authRevision !== previous.authRevision) revisionChanges.push(state.authRevision)
    })
    try {
      const capabilitiesRead = apiClient.getCapabilities()
      await refreshStarted
      const menusRead = apiClient.listMenus()
      await menuFirstAttempt
      releaseRefresh(response({ ...token, accessToken: 'access-b', refreshToken: 'refresh-b' }))

      await expect(Promise.all([capabilitiesRead, menusRead])).resolves.toEqual([capabilities, []])
      expect(refreshRequests).toHaveLength(1)
      expect(new Headers(refreshRequests[0]?.headers).has('Authorization')).toBe(false)
      expect(menuAuthorizationHeaders).toEqual(['Bearer access-a', 'Bearer access-b'])
      expect(useSessionStore.getState().authRevision).toBe(revisionAfterLogin + 1)
      expect(revisionChanges).toEqual([revisionAfterLogin + 1])
    } finally {
      unsubscribe()
    }
  })

  it('刷新令牌被拒绝时仍清理本地会话并保留认证错误', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'false')
    clearLocalAuthentication()
    const refreshHeaders: Headers[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return response(token)
      if (url.endsWith('/auth/me/capabilities')) {
        return new Response(JSON.stringify({ success: false, data: null, message: 'expired', error: { code: 'authentication_required' } }), { status: 401 })
      }
      if (url.endsWith('/auth/refresh')) {
        refreshHeaders.push(new Headers(init?.headers))
        return new Response(JSON.stringify({ success: false, data: null, message: 'refresh expired', error: { code: 'authentication_required' } }), { status: 401 })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await useSessionStore.getState().login('account-a', 'password')
    await expect(apiClient.getCapabilities()).rejects.toMatchObject({ status: 401, code: 'authentication_required' })

    expect(refreshHeaders[0]?.has('Authorization')).toBe(false)
    expect(useSessionStore.getState().user).toBeNull()
    expect(useSessionStore.getState().message).toBe('会话已失效，请重新登录')
  })

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

  it('退出时先刷新过期的访问令牌，再撤销服务端会话', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'false')
    let logoutAttempts = 0
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return response(token)
      if (url.endsWith('/auth/refresh')) return response({ ...token, accessToken: 'access-b', refreshToken: 'refresh-b' })
      if (url.endsWith('/auth/logout')) {
        logoutAttempts += 1
        expect(new Headers(init?.headers).get('Authorization')).toBe(logoutAttempts === 1 ? 'Bearer access-a' : 'Bearer access-b')
        if (logoutAttempts === 1) return new Response(JSON.stringify({ success: false, data: null, message: 'expired', error: { code: 'authentication_required' } }), { status: 401 })
        return response({ loggedOut: true })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await useSessionStore.getState().login('account-a', 'password')
    await useSessionStore.getState().logout()

    expect(logoutAttempts).toBe(2)
    expect(useSessionStore.getState().user).toBeNull()
    expect(useSessionStore.getState().message).toBe('会话已退出')
    expect(await apiClient.restoreSession()).toBeNull()
  })

  it('服务端退出失败时清除本地会话并明确提示可能仍有活动会话', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'false')
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return response(token)
      if (url.endsWith('/auth/logout')) return new Response(JSON.stringify({ success: false, data: null, message: 'forbidden', error: { code: 'permission_denied' } }), { status: 403 })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await useSessionStore.getState().login('account-a', 'password')
    await useSessionStore.getState().logout()

    expect(useSessionStore.getState().user).toBeNull()
    expect(useSessionStore.getState().message).toContain('无法确认服务端会话已关闭')
    expect(await apiClient.restoreSession()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('服务端撤销会话后清除本地认证信息，不再尝试恢复', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'false')
    const fetchMock = vi.fn(async () => response(token))
    vi.stubGlobal('fetch', fetchMock)

    await useSessionStore.getState().login('account-a', 'password')
    useSessionStore.getState().clearSession('密码已更新，请使用新密码重新登录')

    expect(useSessionStore.getState().user).toBeNull()
    expect(await apiClient.restoreSession()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
