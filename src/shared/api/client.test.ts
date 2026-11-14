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
      if (url.endsWith('/api-keys')) return ok([{
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

  it('发送菜单写入并只在 API Key 签发/轮换响应中接收明文', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : null
      const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: body?.parentId ?? null, code: body?.code ?? 'system', name: body?.name ?? '系统', path: body?.path ?? '/system', component: body?.component ?? null, menuType: body?.menuType ?? 'MENU', permission: body?.permission ?? null, sortOrder: body?.sortOrder ?? 1, enabled: body?.enabled ?? true }
      if (url.endsWith('/menus')) return ok(menu)
      if (url.includes('/menus/')) return ok(menu)
      if (url.endsWith('/api-keys')) return ok({ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', name: body.name, prefix: 'cli_1234', apiKey: 'ks_live_secret_once', scopes: body.scopes, expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z' })
      if (url.includes('/api-keys/') && url.endsWith('/rotate')) return ok({ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', name: 'CLI', prefix: 'cli_5678', apiKey: 'ks_live_rotated_once', scopes: ['user:read'], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z' })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const created = await apiClient.createMenu({ code: 'audit', name: '审计', menuType: 'MENU' })
    const updated = await apiClient.updateMenu(created.id, { code: 'audit', name: '审计中心', menuType: 'MENU' })
    const issued = await apiClient.issueApiKey({ name: 'CLI', scopes: ['user:read'] })
    const rotated = await apiClient.rotateApiKey(issued.id)
    expect(updated.name).toBe('审计中心')
    expect(issued.apiKey).toBe('ks_live_secret_once')
    expect(rotated.apiKey).toBe('ks_live_rotated_once')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('读取 Native 登录日志和任务执行日志分页契约', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/login-logs')) return ok({ items: [{
        id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', username: 'operator', status: 'SUCCESS',
        ipAddress: '127.0.0.1', message: '登录成功', userAgent: 'Chrome', loginAt: '2026-11-14T02:00:00Z',
      }], page: 2, size: 20, total: 21 })
      if (url.endsWith('/jobs')) return ok([{ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false, enabled: true, remark: null, lastStatus: 'SUCCESS', lastRunAt: '2026-11-14T02:00:00Z' }])
      if (url.includes('/jobs/logs')) return ok({ items: [{ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', jobId: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', jobCode: 'heartbeat', jobName: '系统心跳', jobGroup: 'SYSTEM', invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', triggerType: 1, status: 1, jobMessage: '任务执行成功', exceptionInfo: null, startedAt: '2026-11-14T02:00:00Z', finishedAt: '2026-11-14T02:00:00Z', durationMs: 12, createdAt: '2026-11-14T02:00:00Z' }], page: 1, size: 20, total: 1 })
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const logs = await apiClient.listLoginLogs({ page: 2, username: ' operator ', status: 'SUCCESS' })
    const jobs = await apiClient.listJobs()
    const jobLogs = await apiClient.listJobLogs({ jobId: jobs[0]?.id })
    expect(logs.items[0]).toMatchObject({ username: 'operator', status: 'SUCCESS' })
    expect(jobs[0]).toMatchObject({ code: 'heartbeat', enabled: true })
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
      if (url.endsWith(`/jobs/${id}/run`)) {
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
      if (url.endsWith('/configs')) return ok([{
        id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', key: 'security.session.ttl', value: '300',
        description: '访问令牌有效期', enabled: true, updatedAt: '2026-11-14T02:00:00Z',
      }])
      if (url.endsWith('/dictionaries')) return ok([{ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'user_status', name: '用户状态', enabled: true }])
      if (url.endsWith('/dictionaries/user_status/items')) return ok([{ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', typeCode: 'user_status', value: 'enabled', label: '启用', sortOrder: 1, enabled: true }])
      if (url.endsWith('/notices/manage')) return ok([{ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', title: '维护通知', content: '内容', noticeType: 'announcement', published: true, enabled: true, publishAt: '2026-11-14T02:00:00Z', createdBy: 'operator', createdAt: '2026-11-14T02:00:00Z' }])
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
