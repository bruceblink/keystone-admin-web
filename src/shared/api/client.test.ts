import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient, getMfaLoginChallenge, XLSX_MIME_TYPE } from './client'

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

  it('为缺少服务端业务码的失败响应补充协议错误码', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      success: false,
      data: null,
      message: 'malformed error response',
      error: null,
    }, 500)))

    await expect(apiClient.listUsers()).rejects.toMatchObject({
      status: 500,
      code: 'invalid_response',
      source: 'client',
    })
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

  it('读取已登录主体的权限和资源范围，不回退到 Mock', async () => {
    const capabilities = {
      permissions: ['user:read', 'server:read'],
      resources: {
        user: true, department: false, role: false, post: false, menu: false, config: false,
        dictionary: false, notice: false, job: false, audit: false, session: true,
        'api-key': false, profile: true,
      },
    }
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/v1/auth/me/capabilities')
      return ok(capabilities)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.getCapabilities()).resolves.toEqual(capabilities)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('能力接口网络失败或缺少范围字段时不回退到 Mock', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'true')
    vi.stubGlobal('fetch', vi.fn(async () => response({ success: false, data: null, message: 'unavailable', error: { code: 'service_unavailable' } }, 503)))
    await expect(apiClient.getCapabilities()).rejects.toMatchObject({ status: 503, code: 'service_unavailable' })

    vi.stubGlobal('fetch', vi.fn(async () => ok({ permissions: ['user:read'], resources: { user: true } })))
    await expect(apiClient.getCapabilities()).rejects.toThrow()
  })

  // 初始改密不需要已有会话，并且只返回更新状态。
  it('通过公开改密接口提交初始密码并解析更新结果', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('/api/v1/auth/change-initial-password')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        username: 'admin',
        currentPassword: 'initial-password',
        newPassword: 'New-Strong-Password-9!',
      })
      return ok({ updated: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.changeInitialPassword('admin', 'initial-password', 'New-Strong-Password-9!'))
      .resolves.toEqual({ updated: true })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('保留 Native 登录 MFA 挑战并按契约提交一次性验证码', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) {
        return response({
          success: false,
          data: { challengeId: 'challenge-login', clientId: 'web', expiresAt: '2026-11-14T03:00:00Z' },
          message: 'MFA_REQUIRED',
          error: { code: 'invalid_credential' },
        }, 401)
      }
      if (url.endsWith('/auth/refresh')) {
        return response({ success: false, data: null, message: 'refresh rejected', error: { code: 'invalid_credential' } }, 401)
      }
      if (url.endsWith('/auth/mfa/verify')) {
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe(JSON.stringify({ username: 'operator', challengeId: 'challenge-login', clientId: 'web', code: '123456', forceLogin: false }))
        return ok(token)
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    let loginError: unknown
    try {
      await apiClient.login('operator', 'secret')
    } catch (error) {
      loginError = error
    }
    expect(getMfaLoginChallenge(loginError)).toEqual({ challengeId: 'challenge-login', clientId: 'web', expiresAt: '2026-11-14T03:00:00Z' })
    await expect(apiClient.verifyMfaLogin('operator', 'challenge-login', 'web', '123456')).resolves.toMatchObject({ user: { username: 'operator' } })
  })

  it('按 401 和 challenge DTO 识别 Phoenix 的 MFA 登录响应', () => {
    const challenge = getMfaLoginChallenge(new ApiError('需要二次认证', 401, 'invalid_credential', {
      challengeId: 'phoenix-challenge',
      clientId: 'web',
      expiresAt: '2026-11-14T03:00:00Z',
    }))

    expect(challenge).toEqual({
      challengeId: 'phoenix-challenge',
      clientId: 'web',
      expiresAt: '2026-11-14T03:00:00Z',
    })
  })

  it('在强制接管时把 forceLogin 传递给密码和 MFA 接口', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) {
        expect(init?.body).toBe(JSON.stringify({ username: 'operator', password: 'secret', forceLogin: true, clientId: 'web' }))
        return response({
          success: false,
          data: { challengeId: 'challenge-force', clientId: 'web', expiresAt: '2026-11-14T03:00:00Z' },
          message: 'MFA_REQUIRED',
          error: { code: 'invalid_credential' },
        }, 401)
      }
      if (url.endsWith('/auth/mfa/verify')) {
        expect(init?.body).toBe(JSON.stringify({ username: 'operator', challengeId: 'challenge-force', clientId: 'web', code: '123456', forceLogin: true }))
        return ok(token)
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.login('operator', 'secret', true)).rejects.toBeInstanceOf(ApiError)
    await expect(apiClient.verifyMfaLogin('operator', 'challenge-force', 'web', '123456', true)).resolves.toMatchObject({ user: { username: 'operator' } })
  })

  it('按 Native step-up 契约创建挑战并只替换短时 AAL2 access token', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return ok(token)
      if (url.endsWith('/auth/mfa/step-up')) {
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe('{}')
        return response({ success: true, data: {
          challengeId: 'challenge-1', purpose: 'STEP_UP', clientId: 'web', sessionId: 'session-1', expiresAt: '2026-11-14T03:00:00Z',
        }, message: 'OK', error: null }, 201)
      }
      if (url.endsWith('/auth/mfa/step-up/verify')) {
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe(JSON.stringify({ challengeId: 'challenge-1', code: '123456' }))
        expect((init?.headers as Headers).get('Authorization')).toBe('Bearer access-1')
        return ok({ accessToken: 'aal2-access', expiresIn: 300, authenticationLevel: 'AAL2', amr: 'otp' })
      }
      if (url.split('?')[0].endsWith('/api-keys')) {
        expect((init?.headers as Headers).get('Authorization')).toBe('Bearer aal2-access')
        return ok({ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', name: 'deploy', prefix: 'dep', apiKey: 'ks_live_once', scopes: ['api-key:create'], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z' })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.login('operator', 'secret')
    const challenge = await apiClient.beginMfaStepUp()
    expect(challenge).toEqual({ challengeId: 'challenge-1', clientId: 'web', expiresAt: '2026-11-14T03:00:00Z' })
    const result = await apiClient.verifyMfaStepUp(challenge.challengeId, '123456')
    expect(result).toMatchObject({ accessToken: 'aal2-access', authenticationLevel: 'AAL2', amr: 'otp' })
    await expect(apiClient.issueApiKey({ name: 'deploy', scopes: ['api-key:create'] })).resolves.toMatchObject({ apiKey: 'ks_live_once' })
  })

  it('不把 API Key 的 step-up 拒绝错误替换为 Mock 成功', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ success: false, data: null, message: 'recent MFA step-up is required', error: { code: 'permission_denied' } }, 403)))

    await expect(apiClient.issueApiKey({ name: 'deploy', scopes: ['api-key:create'] })).rejects.toMatchObject({ status: 403, code: 'permission_denied' })
  })

  it('分别读取 Native 监控资源并校验各自响应', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/monitor/serverInfo')) return ok({
        javaVersion: '21', jvmName: 'OpenJDK', osName: 'Mac OS X', osVersion: '15', processors: 8,
        maxMemory: 1_000, totalMemory: 800, freeMemory: 300, heapUsed: 500, uptimeMs: 10_000,
      })
      if (url.endsWith('/monitor/cacheInfo')) return ok({ provider: 'database', activeSessions: 2, loginLogEntries: 10 })
      if (url.endsWith('/monitor/onlineUsers?page=1&size=100')) return ok({ items: [{
        sessionId: 'session-1', userId: 'user-1', username: 'operator', displayName: '系统管理员', ipAddress: '127.0.0.1',
        createdAt: '2026-11-14T01:00:00Z', expiresAt: '2026-11-28T01:00:00Z', accessExpiresAt: '2026-11-14T01:05:00Z',
      }], page: 1, size: 100, total: 1 })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const [server, cache, online] = await Promise.all([
      apiClient.getMonitorServerInfo(),
      apiClient.getMonitorCacheInfo(),
      apiClient.listMonitorOnlineUsers(),
    ])
    expect(server).toMatchObject({ source: 'api', value: { jvmName: 'OpenJDK', processors: 8, heapUsed: 500 } })
    expect(cache).toEqual({ source: 'api', value: { provider: 'database', activeSessions: 2, loginLogEntries: 10 } })
    expect(online.value.items[0]).toMatchObject({ sessionId: 'session-1', username: 'operator', displayName: '系统管理员' })
    expect(fetchMock.mock.calls.map(([input]) => String(input)).sort()).toEqual([
      '/api/v1/monitor/cacheInfo',
      '/api/v1/monitor/onlineUsers?page=1&size=100',
      '/api/v1/monitor/serverInfo',
    ])
  })

  it('监控资源的权限拒绝保留业务错误，不回退成 Mock 成功', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      success: false,
      data: null,
      message: 'forbidden',
      error: { code: 'permission_denied' },
    }, 403)))

    await expect(apiClient.getMonitorServerInfo()).rejects.toMatchObject({ status: 403, code: 'permission_denied' })
    await expect(apiClient.getMonitorCacheInfo()).rejects.toMatchObject({ status: 403, code: 'permission_denied' })
    await expect(apiClient.listMonitorOnlineUsers()).rejects.toMatchObject({ status: 403, code: 'permission_denied' })
  })

  it('按 Native 用户列表契约发送筛选和分页参数', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/v1/users?page=2&size=20&username=operator&displayName=%E8%BF%90%E7%BB%B4')
      return ok({
        items: [{
          id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', username: 'operator', displayName: '平台运维员',
          deptId: null, postId: null, enabled: true, email: null, phoneNumber: null, sex: null,
          avatar: null, loginIp: null, loginAt: null, remark: null, roles: ['系统管理员'],
        }],
        page: 2, size: 20, total: 21,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.listUsers({ page: 2, username: ' operator ', displayName: '运维' })

    expect(result).toMatchObject({ page: 2, size: 20, total: 21 })
    expect(result.items[0]).toMatchObject({ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', username: 'operator', enabled: true })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('发送 Native 用户新增和编辑请求体', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body))
      expect(body.displayName).toBe('新用户')
      if (url.endsWith('/users')) {
        expect(init?.method).toBe('POST')
        expect(body.username).toBe('new-user')
      } else {
        expect(url).toBe('/api/v1/users/2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce')
        expect(init?.method).toBe('PUT')
        expect(body.password).toBeUndefined()
        expect(body.roleCodes).toBeNull()
      }
      return ok({
        id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', username: body.username ?? 'operator', displayName: body.displayName,
        deptId: null, postId: null, enabled: true, email: null, phoneNumber: null, sex: null,
        avatar: null, loginIp: null, loginAt: null, remark: null, roles: [],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.createUser({ username: 'new-user', password: 'Strong-password-123!', displayName: '新用户', roleCodes: [] })
    await apiClient.updateUser('2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', { displayName: '新用户', roleCodes: null })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('按 Native 契约提交 XLSX 用户导入并保留逐行失败结果', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('/api/v1/users/import')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)
      expect((init?.body as FormData).get('file')).toBeInstanceOf(File)
      return ok({ total: 2, success: 1, failed: [{ row: 3, username: 'blocked', reason: 'permission_denied' }] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.importUsers(new File(['xlsx'], 'users.xlsx', { type: XLSX_MIME_TYPE }))

    expect(result).toEqual({ total: 2, success: 1, failed: [{ row: 3, username: 'blocked', reason: 'permission_denied' }] })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('拒绝非 XLSX 导入并校验用户导出文件响应', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('/api/v1/users/export?username=operator&displayName=%E8%BF%90%E7%BB%B4')
      expect(init?.method).toBeUndefined()
      return new Response('xlsx', {
        status: 200,
        headers: { 'Content-Type': XLSX_MIME_TYPE, 'Content-Disposition': 'attachment; filename=users.xlsx' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.importUsers(new File(['xls'], 'users.xls'))).rejects.toMatchObject({ status: 422, code: 'validation_failed' })
    const result = await apiClient.exportUsers({ username: ' operator ', displayName: '运维' })

    expect(result.filename).toBe('users.xlsx')
    expect(result.blob.type).toBe(XLSX_MIME_TYPE)
    expect(result.blob.size).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('不把 Native 的 AAL2 或 API Key 拒绝错误替换为 Mock 成功', async () => {
    const fetchMock = vi.fn(async () => response({ success: false, data: null, message: 'AAL2 step-up is required', error: { code: 'invalid_credential' } }, 401))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.importUsers(new File(['xlsx'], 'users.xlsx', { type: XLSX_MIME_TYPE }))).rejects.toMatchObject({ status: 401, code: 'invalid_credential' })
  })

  it('按 Native 操作审计契约发送筛选和分页参数', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/v1/operation-logs?page=2&size=20&actor=operator&action=UPDATE&resource=user')
      return ok({
        items: [{
          id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', actorUsername: 'operator', action: 'UPDATE',
          resource: 'user', resourceId: 'a3a4b5c6-d7e8-4f90-8123-456789abcdef', detail: '更新用户资料',
          createdAt: '2026-11-14T02:00:00Z',
        }],
        page: 2, size: 20, total: 21,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.listOperationLogs({ page: 2, actor: ' operator ', action: 'UPDATE', resource: 'user' })

    expect(result).toMatchObject({ page: 2, size: 20, total: 21 })
    expect(result.items[0]).toMatchObject({ actorUsername: 'operator', resource: 'user', action: 'UPDATE' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('读取 Native 角色和组织结构数组契约', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/roles')) return ok([{
        id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'admin', name: '系统管理员', enabled: true,
        dataScope: 'ALL', deptScope: '全部组织', permissions: ['user:read'],
      }])
      if (url.endsWith('/departments')) return ok([{
        id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: null, code: 'HQ', name: '总部', sortOrder: 1, enabled: true,
      }])
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const roles = await apiClient.listRoles()
    const departments = await apiClient.listDepartments()
    expect(roles[0]).toMatchObject({ code: 'admin', dataScope: 'ALL' })
    expect(departments[0]).toMatchObject({ code: 'HQ', parentId: null })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('读取 Native 角色分页契约并发送筛选参数', async () => {
    const role = {
      id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true,
      dataScope: 'ALL', deptScope: null, permissions: ['audit:read'],
    }
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/roles?page=2&size=20&keyword=auditor&status=enabled')) return ok({ items: [role], page: 2, size: 20, total: 21 })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.listRoles({ page: 2, size: 20, keyword: ' auditor ', status: 'enabled' })

    expect(result).toMatchObject({ page: 2, size: 20, total: 21 })
    expect(Array.isArray(result)).toBe(false)
    if (Array.isArray(result)) throw new Error('expected a paged role response')
    expect(result.items[0]).toMatchObject({ code: 'auditor', permissions: ['audit:read'] })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('兼容分页参数下的旧角色数组响应', async () => {
    const role = {
      id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'operator', name: '运营专员', enabled: true,
      dataScope: 'ALL', deptScope: null, permissions: [],
    }
    vi.stubGlobal('fetch', vi.fn(async () => ok([role])))

    await expect(apiClient.listRoles({ page: 3, size: 20 })).resolves.toEqual({ items: [role], page: 3, size: 20, total: 1 })
  })

  it('读取并维护 Native 岗位，同时严格校验岗位导出文件', async () => {
    const post = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'operator', name: '运营专员', sortOrder: 1, enabled: true }
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/posts/export')) return new Response('xlsx', { status: 200, headers: { 'Content-Type': XLSX_MIME_TYPE, 'Content-Disposition': 'attachment; filename=posts.xlsx' } })
      if (url.endsWith('/posts') && !init?.method) return ok([post])
      if (url.endsWith('/posts') && init?.method === 'POST') return ok({ ...post, code: 'new-post', name: '新岗位' })
      if (url.endsWith('/posts/' + post.id) && init?.method === 'PUT') return ok({ ...post, name: '更新岗位', enabled: false })
      if (url.endsWith('/posts/' + post.id) && init?.method === 'DELETE') return ok({ deleted: true })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await apiClient.listPosts()).toEqual([post])
    expect(await apiClient.createPost({ code: 'new-post', name: '新岗位', sortOrder: 2 })).toMatchObject({ name: '新岗位' })
    expect(await apiClient.updatePost(post.id, { name: '更新岗位', enabled: false })).toMatchObject({ enabled: false })
    expect(await apiClient.deletePost(post.id)).toEqual({ deleted: true })
    const exported = await apiClient.exportPosts()
    expect(exported.filename).toBe('posts.xlsx')
    expect(exported.blob.type).toBe(XLSX_MIME_TYPE)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('读取角色和审计日志 XLSX 导出并透传筛选条件', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/roles/export')) return new Response('roles-xlsx', { status: 200, headers: { 'Content-Type': XLSX_MIME_TYPE, 'Content-Disposition': 'attachment; filename=roles.xlsx' } })
      if (url.includes('/login-logs/export?')) {
        expect(url).toBe('/api/v1/login-logs/export?username=operator&status=FAILURE')
        return new Response('login-xlsx', { status: 200, headers: { 'Content-Type': XLSX_MIME_TYPE, 'Content-Disposition': 'attachment; filename=login-logs.xlsx' } })
      }
      if (url.includes('/operation-logs/export?')) {
        expect(url).toBe('/api/v1/operation-logs/export?actor=operator&action=DELETE&resource=user')
        return new Response('operation-xlsx', { status: 200, headers: { 'Content-Type': XLSX_MIME_TYPE, 'Content-Disposition': 'attachment; filename=operation-logs.xlsx' } })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    expect((await apiClient.exportRoles()).filename).toBe('roles.xlsx')
    expect((await apiClient.exportLoginLogs({ username: ' operator ', status: 'FAILURE' })).filename).toBe('login-logs.xlsx')
    expect((await apiClient.exportOperationLogs({ actor: ' operator ', action: 'DELETE', resource: 'user' })).filename).toBe('operation-logs.xlsx')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('保留岗位接口的权限错误，不使用开发 Mock 替换', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ success: false, data: null, message: 'permission denied', error: { code: 'permission_denied' } }, 403)))

    await expect(apiClient.listPosts()).rejects.toMatchObject({ status: 403, code: 'permission_denied' })
  })

  it('开发环境下只将岗位网络不可达回退到 Mock 快照', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'true')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network unavailable') }))

    await expect(apiClient.listPosts()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'operator' })]))
  })

  it('开发环境下保留岗位接口 5xx 错误', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'true')
    vi.stubGlobal('fetch', vi.fn(async () => response({ success: false, data: null, message: 'proxy unavailable', error: null }, 502)))

    await expect(apiClient.listPosts()).rejects.toMatchObject({ status: 502 })
  })

  it('发送 Native 角色和组织新增/编辑请求体', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body))
      if (url.endsWith('/roles')) return ok({ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: body.code, name: body.name, enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] })
      if (url.endsWith('/roles/2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce')) return ok({ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'admin', name: body.name, enabled: body.enabled, dataScope: 'ALL', deptScope: null, permissions: [] })
      if (url.endsWith('/departments')) return ok({ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: body.parentId, code: body.code, name: body.name, sortOrder: body.sortOrder, enabled: true })
      expect(url).toBe('/api/v1/departments/8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a')
      return ok({ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: body.parentId, code: 'OPS', name: body.name, sortOrder: body.sortOrder, enabled: body.enabled })
    })
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.createRole({ code: 'auditor', name: '审计员', enabled: true })
    await apiClient.updateRole('2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', { name: '管理员', enabled: false })
    await apiClient.createDepartment({ code: 'OPS', name: '运营部', parentId: null, sortOrder: 1, enabled: true })
    await apiClient.updateDepartment('8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', { code: 'OPS', name: '运营中心', parentId: null, sortOrder: 2, enabled: true })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('读取 Native 菜单树和脱敏 API Key 元数据', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/menus')) return ok([{
        menu: {
          id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理',
          path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true,
        }, children: [],
      }])
      if (url.split('?')[0].endsWith('/api-keys')) return ok([{
        id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', name: 'CLI', prefix: 'cli_1234', scopes: ['user:read'],
        expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z',
      }])
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const menus = await apiClient.listMenus()
    const keys = await apiClient.listApiKeys()
    expect(menus[0]?.menu.code).toBe('system')
    expect(keys[0]).toMatchObject({ name: 'CLI', prefix: 'cli_1234', scopes: ['user:read'] })
    expect(keys[0]).not.toHaveProperty('apiKey')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('按 page/size、keyword 和 status 读取分页 API Key 契约', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/v1/api-keys?page=2&size=20&keyword=deploy&status=active')
      return ok({
        items: [{
          id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', name: 'deploy', prefix: 'dep_1234', scopes: ['user:read'],
          expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z',
        }],
        page: 2,
        size: 20,
        total: 21,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.listApiKeysPage({ keyword: 'deploy', status: 'active', page: 2, size: 20 })

    expect(result).toMatchObject({ page: 2, size: 20, total: 21 })
    expect(result.items[0]).toMatchObject({ name: 'deploy' })
  })

  it('读取动态接口权限目录并保留 allowed 标志', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/v1/permissions/catalog')
      return ok({ entries: [{ permission: 'user:read', resource: 'user', action: 'read', description: 'user read', risk: 'low', registered: true, allowed: true }, { permission: 'user:delete', resource: 'user', action: 'delete', description: 'user delete', risk: 'high', registered: true, allowed: false }] })
    }))

    await expect(apiClient.listPermissionCatalog()).resolves.toEqual([
      { permission: 'user:read', resource: 'user', action: 'read', description: 'user read', risk: 'low', registered: true, allowed: true },
      { permission: 'user:delete', resource: 'user', action: 'delete', description: 'user delete', risk: 'high', registered: true, allowed: false },
    ])
  })

  it('规范化并替换角色权限目录', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input: String(input), init })
      return ok({ updated: true })
    }))

    await expect(apiClient.updateRolePermissions('role-1', [' user:read ', 'role:read', 'user:read'])).resolves.toEqual({ updated: true })
    expect(calls[0]?.input).toBe('/api/v1/roles/role-1/permissions')
    expect(calls[0]?.init?.method).toBe('PUT')
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ permissions: ['user:read', 'role:read'] }))
  })

  it('读取并维护角色成员，规范化重复用户 ID', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input: String(input), init })
      if (!init?.method) return ok(['user-1', 'user-2'])
      return ok({ updated: true })
    }))

    await expect(apiClient.listRoleUsers('role-1', false)).resolves.toEqual(['user-1', 'user-2'])
    await expect(apiClient.assignRoleUsers('role-1', [' user-1 ', 'user-1'])).resolves.toEqual({ updated: true })
    await expect(apiClient.revokeRoleUsers('role-1', ['user-2', ' user-2 '])).resolves.toEqual({ updated: true })
    expect(calls[0]?.input).toBe('/api/v1/roles/role-1/users?allocated=false')
    expect(calls[1]?.init?.method).toBe('PUT')
    expect(calls[1]?.init?.body).toBe(JSON.stringify({ userIds: ['user-1'] }))
    expect(calls[2]?.init?.method).toBe('DELETE')
    expect(calls[2]?.init?.body).toBe(JSON.stringify({ userIds: ['user-2'] }))
  })

  it('读取角色成员名称并兼容只返回 ID 的旧后端', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok([{ id: 'user-1', username: 'alice', displayName: '爱丽丝' }]))
      .mockResolvedValueOnce(ok(['user-2']))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.listRoleMembers('role-1')).resolves.toEqual([{ id: 'user-1', username: 'alice', displayName: '爱丽丝' }])
    await expect(apiClient.listRoleMembers('role-1', false)).resolves.toEqual([{ id: 'user-2', username: null, displayName: null }])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/roles/role-1/users?allocated=true&include=identity')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/roles/role-1/users?allocated=false&include=identity')
  })

  it('发送菜单写入并只在 API Key 签发/轮换响应中接收明文', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : null
      const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: body?.parentId ?? null, code: body?.code ?? 'system', name: body?.name ?? '系统', path: body?.path ?? '/system', component: body?.component ?? null, menuType: body?.menuType ?? 'MENU', permission: body?.permission ?? null, sortOrder: body?.sortOrder ?? 1, enabled: body?.enabled ?? true }
      if (url.endsWith('/menus')) return ok(menu)
      if (url.includes('/menus/')) return ok(menu)
      if (url.split('?')[0].endsWith('/api-keys')) return ok({ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', name: body.name, prefix: 'cli_1234', apiKey: 'ks_live_secret_once', scopes: body.scopes, expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z' })
      if (url.includes('/api-keys/') && url.endsWith('/rotate')) return ok({ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', name: 'CLI', prefix: 'cli_5678', apiKey: 'ks_live_rotated_once', scopes: ['user:read'], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z' })
      if (url.includes('/api-keys/') && init?.method === 'DELETE') return ok({ revoked: true })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const created = await apiClient.createMenu({ code: 'audit', name: '审计', menuType: 'MENU' })
    const updated = await apiClient.updateMenu(created.id, { code: 'audit', name: '审计中心', menuType: 'MENU' })
    const issued = await apiClient.issueApiKey({ name: 'CLI', scopes: ['user:read'] })
    const rotated = await apiClient.rotateApiKey(issued.id)
    const revoked = await apiClient.revokeApiKey(issued.id)
    expect(updated.name).toBe('审计中心')
    expect(issued.apiKey).toBe('ks_live_secret_once')
    expect(rotated.apiKey).toBe('ks_live_rotated_once')
    expect(revoked).toEqual({ revoked: true })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('读取并替换菜单角色绑定，规范化重复角色编码', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/menus/menu-1/roles') && !init?.method) return ok({ roleCodes: ['admin'] })
      if (url.endsWith('/menus/menu-1/roles')) {
        expect(init?.method).toBe('PUT')
        expect(init?.body).toBe(JSON.stringify({ roleCodes: ['admin', 'auditor'] }))
        return ok({ updated: true })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.listRolesForMenu('menu-1')).resolves.toEqual({ roleCodes: ['admin'] })
    await expect(apiClient.assignMenuRoles('menu-1', ['admin', ' admin ', 'auditor', ''])).resolves.toEqual({ updated: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('读取 Native 登录日志和任务执行日志分页契约', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/login-logs')) return ok({ items: [{
        id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', username: 'operator', status: 'SUCCESS',
        ipAddress: '127.0.0.1', message: '登录成功', userAgent: 'Chrome', loginAt: '2026-11-14T02:00:00Z',
      }], page: 2, size: 20, total: 21 })
      if (url.includes('/jobs?')) return ok({ items: [{ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: '2026-11-14T02:00:00Z' }], page: 1, size: 20, total: 1 })
      if (url.includes('/jobs/logs')) return ok({ items: [{ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', jobId: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', jobCode: 'heartbeat', jobName: '系统心跳', jobGroup: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', triggerType: 1, status: 1, jobMessage: '任务执行成功', exceptionInfo: null, startedAt: '2026-11-14T02:00:00Z', finishedAt: '2026-11-14T02:00:00Z', durationMs: 12, createdAt: '2026-11-14T02:00:00Z' }], page: 1, size: 20, total: 1 })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const logs = await apiClient.listLoginLogs({ page: 2, username: ' operator ', status: 'SUCCESS' })
    const jobs = await apiClient.listJobs()
    const jobLogs = await apiClient.listJobLogs({ jobId: jobs.items[0]?.id })
    expect(logs.items[0]).toMatchObject({ username: 'operator', status: 'SUCCESS' })
    expect(jobs.items[0]).toMatchObject({ code: 'heartbeat', enabled: true })
    expect(jobLogs.items[0]).toMatchObject({ jobCode: 'heartbeat', status: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('按 Native 任务写操作契约发送新增、编辑、状态和执行请求', async () => {
    const id = '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a'
    const baseJob = { id, code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: '2026-11-14T02:00:00Z' }
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : null
      if (url.endsWith('/jobs') && init?.method === 'POST') {
        expect(body).toMatchObject({ code: 'heartbeat', name: '系统心跳', cron: '0/30 * * * * ?' })
        return ok(baseJob)
      }
      if (url.endsWith(`/jobs/${id}`) && init?.method === 'PUT') {
        expect(body).toMatchObject({ name: '心跳任务', invokeTarget: 'keystoneJob.heartbeat()' })
        return ok({ ...baseJob, name: body.name })
      }
      if (url.endsWith(`/jobs/${id}/status`)) {
        expect(init?.method).toBe('PUT')
        expect(body).toEqual({ enabled: false })
        return ok({ ...baseJob, enabled: false })
      }
      if (url.endsWith(`/jobs/${id}/trigger`)) {
        expect(init?.method).toBe('POST')
        return ok({ triggered: true })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.createJob({ code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true })
    const updated = await apiClient.updateJob(id, { code: 'heartbeat', name: '心跳任务', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true })
    const status = await apiClient.updateJobStatus(id, false)
    const trigger = await apiClient.triggerJob(id)

    expect(updated.name).toBe('心跳任务')
    expect(status.enabled).toBe(false)
    expect(trigger).toEqual({ triggered: true })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('读取 Native 配置、字典和管理公告契约', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.split('?')[0].endsWith('/configs')) return ok([{
        id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', key: 'security.session.ttl', value: '300',
        description: '访问令牌有效期', enabled: true, updatedAt: '2026-11-14T02:00:00Z',
      }])
      if (url.endsWith('/dictionaries')) return ok([{ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'user_status', name: '用户状态', enabled: true }])
      if (url.split('?')[0].endsWith('/dictionaries/user_status/items')) return ok([{ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', typeCode: 'user_status', value: 'enabled', label: '启用', sortOrder: 1, enabled: true }])
      if (url.split('?')[0].endsWith('/notices/manage')) return ok([{ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', title: '维护通知', content: '内容', noticeType: 'announcement', published: true, enabled: true, publishAt: '2026-11-14T02:00:00Z', createdBy: 'operator', createdAt: '2026-11-14T02:00:00Z' }])
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const configs = await apiClient.listSystemConfigs()
    const types = await apiClient.listDictionaryTypes()
    const items = await apiClient.listDictionaryItems('user_status')
    const notices = await apiClient.listNotices()
    expect(configs[0]).toMatchObject({ key: 'security.session.ttl', enabled: true })
    expect(types[0]).toMatchObject({ code: 'user_status', name: '用户状态' })
    expect(items[0]).toMatchObject({ typeCode: 'user_status', value: 'enabled' })
    expect(notices[0]).toMatchObject({ title: '维护通知', published: true })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('按 page/size 和 keyword 读取分页系统配置契约', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/v1/configs?page=2&size=20&keyword=security')
      return ok({
        items: [{
          id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', key: 'security.session.ttl', value: '300',
          description: '访问令牌有效期', enabled: true, updatedAt: '2026-11-14T02:00:00Z',
        }],
        page: 2,
        size: 20,
        total: 21,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.listSystemConfigsPage({ keyword: 'security', page: 2, size: 20 })

    expect(result).toMatchObject({ page: 2, size: 20, total: 21 })
    expect(result.items[0]).toMatchObject({ key: 'security.session.ttl' })
  })

  it('按 page/size 和 keyword 读取字典条目分页契约', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/v1/dictionaries/user_status/items?page=2&size=20&keyword=%E5%90%AF')
      return ok({
        items: [{ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518f2d', typeCode: 'user_status', value: 'enabled', label: '启用', sortOrder: 1, enabled: true }],
        page: 2,
        size: 20,
        total: 21,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.listDictionaryItemsPage('user_status', { keyword: '启', page: 2, size: 20 })

    expect(result).toMatchObject({ page: 2, size: 20, total: 21 })
    expect(result.items[0]).toMatchObject({ typeCode: 'user_status', label: '启用' })
  })

  it('保留公开公告读取接口', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/notices')) return ok([{ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', title: '维护通知', content: '今晚维护', noticeType: 'notification', published: true, enabled: true, publishAt: '2026-11-14T02:00:00Z', createdBy: 'operator', createdAt: '2026-11-14T01:00:00Z' }])
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const notices = await apiClient.listPublicNotices()

    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', published: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/notices', expect.anything())
  })

  it('通过独立收件箱接口读取和标记当前用户通知', async () => {
    const notification = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', type: 'api_key.created', title: 'API Key 已签发', content: '账号已签发 API Key。', createdAt: '2026-11-18T01:00:00Z', readAt: null }
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/notifications') return ok({ items: [notification], unreadCount: 1 })
      if (url === `/api/v1/notifications/${notification.id}/read` && init?.method === 'POST') return ok({ ...notification, readAt: '2026-11-18T01:01:00Z' })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await apiClient.listNotifications()).toMatchObject({ unreadCount: 1, items: [notification] })
    expect(await apiClient.readNotification(notification.id)).toMatchObject({ id: notification.id, readAt: '2026-11-18T01:01:00Z' })
  })

  it('按页读取站内通知并验证服务端是否还有下一页', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/v1/notifications?page=2')
      return ok({ items: [], unreadCount: 51, page: 2, hasMore: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await apiClient.listNotificationsPage(2)).toEqual({ items: [], unreadCount: 51, page: 2, hasMore: true })
  })

  it('按 page/size、keyword 和 status 读取分页公告契约', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/v1/notices/manage?page=2&size=20&keyword=maintenance&status=published')
      return ok({ items: [{
        id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', title: '维护公告', content: '内容', noticeType: 'announcement',
        published: true, enabled: true, publishAt: '2026-11-14T02:00:00Z', createdBy: 'operator', createdAt: '2026-11-14T02:00:00Z',
      }], page: 2, size: 20, total: 21 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.listNoticesPage({ keyword: 'maintenance', status: 'published', page: 2, size: 20 })

    expect(result).toMatchObject({ page: 2, size: 20, total: 21 })
    expect(result.items[0]).toMatchObject({ title: '维护公告', published: true })
  })

  it('按 Native 契约发送用户、角色、公告和任务批量删除请求并去重 ID', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      expect(init?.method).toBe('DELETE')
      if (url.includes('/users?ids=')) return ok({ deleted: 2 })
      if (url.includes('/roles?ids=')) return ok({ deleted: 2 })
      if (url.includes('/notices?notice_ids=')) return ok({ deleted: 2 })
      if (url.includes('/jobs?jobIds=')) return ok({ deleted: 2 })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await apiClient.deleteUsers(['user-a', 'user-a', 'user-b'])).toEqual({ deleted: 2 })
    expect(await apiClient.deleteRoles(['role-a', 'role-a', 'role-b'])).toEqual({ deleted: 2 })
    expect(await apiClient.deleteNotices(['notice-a', 'notice-b', 'notice-b'])).toEqual({ deleted: 2 })
    expect(await apiClient.deleteJobs(['job-a', 'job-b', 'job-a'])).toEqual({ deleted: 2 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users?ids=user-a%2Cuser-b')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/roles?ids=role-a%2Crole-b')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/v1/notices?notice_ids=notice-a%2Cnotice-b')
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/v1/jobs?jobIds=job-a%2Cjob-b')
  })

  it('按 Native 契约发送配置和字典删除请求', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('DELETE')
      return ok({ deleted: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.deleteSystemConfig('security.session.ttl')).resolves.toEqual({ deleted: true })
    await expect(apiClient.deleteDictionaryType('user_status')).resolves.toEqual({ deleted: true })
    await expect(apiClient.deleteDictionaryItem('item-1')).resolves.toEqual({ deleted: true })
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/v1/configs/security.session.ttl',
      '/api/v1/dictionaries/types/user_status',
      '/api/v1/dictionaries/items/item-1',
    ])
  })

  it('按 Native 契约发送部门、菜单和岗位单项删除请求', async () => {
    const id = '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce'
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('DELETE')
      return ok({ deleted: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.deleteDepartment(id)).resolves.toEqual({ deleted: true })
    await expect(apiClient.deleteMenu(id)).resolves.toEqual({ deleted: true })
    await expect(apiClient.deletePost(id)).resolves.toEqual({ deleted: true })
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      `/api/v1/departments/${id}`,
      `/api/v1/menus/${id}`,
      `/api/v1/posts/${id}`,
    ])
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
