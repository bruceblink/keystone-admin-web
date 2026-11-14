import {
  apiEnvelopeSchema,
  loginResponseSchema,
  monitorSnapshotSchema,
  nativeCacheInfoSchema,
  nativeUsersPageSchema,
  nativeUserSchema,
  nativeBatchDeleteResultSchema,
  nativeDeleteResultSchema,
  nativeApiKeyRevokeResultSchema,
  nativeOperationLogsPageSchema,
  nativeLoginLogsPageSchema,
  nativeDepartmentsSchema,
  nativeDepartmentSchema,
  nativePostsSchema,
  nativePostSchema,
  nativeMenusSchema,
  nativeMenuNodeSchema,
  nativeApiKeysSchema,
  nativeIssuedApiKeySchema,
  nativeSystemConfigsSchema,
  nativeSystemConfigSchema,
  nativeDictionaryTypesSchema,
  nativeDictionaryTypeSchema,
  nativeDictionaryItemsSchema,
  nativeDictionaryItemSchema,
  nativeNoticesSchema,
  nativeNoticeSchema,
  nativeRolesSchema,
  nativeRoleSchema,
  nativeOnlineUsersSchema,
  nativeServerInfoSchema,
  nativeTokenSchema,
  nativeMfaStepUpChallengeSchema,
  nativeMfaStepUpResultSchema,
  userSchema,
  type NativeUsersPage,
  type NativeMfaStepUpChallenge,
  type NativeMfaStepUpResult,
  type NativeUser,
  type NativeUserWriteInput,
  type NativeBatchDeleteResult,
  type NativeDeleteResult,
  type NativeOperationLogsPage,
  type NativeLoginLogsPage,
  type NativeJobWriteInput,
  type NativeDepartment,
  type NativePost,
  type NativePostWriteInput,
  type NativeMenuNode,
  type NativeMenuWriteInput,
  type NativeApiKey,
  type NativeIssuedApiKey,
  type NativeSystemConfig,
  type NativeDictionaryType,
  type NativeDictionaryItem,
  type NativeNotice,
  type NativeRole,
  type NativeRoleWriteInput,
  type NativeDepartmentWriteInput,
  type NativeSystemConfigWriteInput,
  type NativeDictionaryTypeWriteInput,
  type NativeDictionaryItemWriteInput,
  type NativeNoticeWriteInput,
  type User,
} from './schemas'
import { createMockApiKeys, createMockDepartments, createMockDictionaryItems, createMockDictionaryTypes, createMockLogin, createMockLoginLogsPage, createMockMenus, createMockMonitorSnapshot, createMockNotices, createMockOperationLogsPage, createMockPosts, createMockPost, createMockRoles, createMockSystemConfigs, createMockUsersPage, deleteMockPost, updateMockPost } from './mock'
import { jobApi } from './jobClient'
import { ApiError } from './errors'
import { createUserFileClient, readXlsxResponse, XLSX_MIME_TYPE } from './userFileClient'
export { ApiError } from './errors'
export { isXlsxFilename, XLSX_MIME_TYPE } from './userFileClient'
import type { MonitorSnapshot } from '../../entities/monitor/types'
const API_BASE = '/api/v1'
const CLIENT_ID = 'web'
let accessToken: string | null = null
let refreshToken: string | null = null
let currentUser: User | null = null
let currentSessionId: string | null = null
let refreshPromise: Promise<string | null> | null = null
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
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
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
async function requestFile(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', XLSX_MIME_TYPE)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' })
  } catch {
    throw new ApiError('无法连接 Native API', 0, 'network_error')
  }

  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshed = await refreshAccessToken()
    if (refreshed) return requestFile(path, init, false)
  }

  if (!response.ok) {
    const body = await readJson(response)
    const envelope = apiEnvelopeSchema.safeParse(body)
    const message = envelope.success ? envelope.data.message : `请求失败（${response.status}）`
    const code = envelope.success ? envelope.data.error?.code : undefined
    throw new ApiError(message, response.status, code)
  }
  return response
}
const userFileApi = createUserFileClient({ request, requestFile, mockFallbackEnabled })
function applyToken(token: ReturnType<typeof nativeTokenSchema.parse>): User {
  accessToken = token.accessToken
  refreshToken = token.refreshToken
  currentSessionId = token.sessionId
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
      currentSessionId = null
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
  currentSessionId = null
  return result
}

function mockXlsx(filename: string): { blob: Blob; filename: string } {
  return { blob: new Blob(['mock xlsx workbook'], { type: XLSX_MIME_TYPE }), filename }
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
      currentSessionId = null
    }
  },

  /** 创建绑定当前人类会话的短期 MFA step-up 请求；TOTP 不在客户端持久化。 */
  async beginMfaStepUp(contextHash?: string): Promise<NativeMfaStepUpChallenge> {
    const body = contextHash ? { contextHash } : {}
    return nativeMfaStepUpChallengeSchema.parse(await request<unknown>('/auth/mfa/step-up', {
      method: 'POST',
      body: JSON.stringify(body),
    }))
  },

  /** 验证 TOTP 或恢复码，并仅替换内存中的短时 AAL2 access token。 */
  async verifyMfaStepUp(challengeId: string, code: string): Promise<NativeMfaStepUpResult> {
    const result = nativeMfaStepUpResultSchema.parse(await request<unknown>('/auth/mfa/step-up/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    }, false))
    accessToken = result.accessToken
    return result
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

  async listUsers(filters: { username?: string; displayName?: string; page?: number; size?: number } = {}): Promise<NativeUsersPage> {
    const page = filters.page ?? 1
    const size = filters.size ?? 20
    const params = new URLSearchParams({ page: String(page), size: String(size) })
    const username = filters.username?.trim()
    const displayName = filters.displayName?.trim()
    if (username) params.set('username', username)
    if (displayName) params.set('displayName', displayName)

    try {
      return nativeUsersPageSchema.parse(await request<unknown>(`/users?${params.toString()}`))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockUsersPage(page, size)
    }
  },

  async createUser(input: NativeUserWriteInput): Promise<NativeUser> {
    try {
      return nativeUserSchema.parse(await request<unknown>('/users', {
        method: 'POST',
        body: JSON.stringify(input),
      }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return nativeUserSchema.parse({
        id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', username: input.username ?? 'new-user',
        displayName: input.displayName, deptId: input.deptId ?? null, postId: input.postId ?? null,
        enabled: input.enabled ?? true, email: input.email ?? null, phoneNumber: input.phoneNumber ?? null,
        sex: input.sex ?? null, avatar: input.avatar ?? null, loginIp: null, loginAt: null,
        remark: input.remark ?? null, roles: input.roleCodes ?? [],
      })
    }
  },

  async updateUser(id: string, input: NativeUserWriteInput): Promise<NativeUser> {
    try {
      return nativeUserSchema.parse(await request<unknown>(`/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return nativeUserSchema.parse({
        id, username: input.username ?? 'operator', displayName: input.displayName,
        deptId: input.deptId ?? null, postId: input.postId ?? null, enabled: input.enabled ?? true,
        email: input.email ?? null, phoneNumber: input.phoneNumber ?? null, sex: input.sex ?? null,
        avatar: input.avatar ?? null, loginIp: null, loginAt: null, remark: input.remark ?? null,
        roles: input.roleCodes ?? [],
      })
    }
  },

  async deleteUsers(ids: string[]): Promise<NativeBatchDeleteResult> {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
    if (uniqueIds.length === 0) throw new Error('至少选择一名用户')
    const query = new URLSearchParams({ ids: uniqueIds.join(',') }).toString()
    try {
      return nativeBatchDeleteResultSchema.parse(await request<unknown>(`/users?${query}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return { deleted: uniqueIds.length }
    }
  },

  importUsers: userFileApi.importUsers,

  exportUsers: userFileApi.exportUsers,

  async listOperationLogs(filters: { actor?: string; action?: string; resource?: string; page?: number; size?: number } = {}): Promise<NativeOperationLogsPage> {
    const page = filters.page ?? 1
    const size = filters.size ?? 20
    const params = new URLSearchParams({ page: String(page), size: String(size) })
    const actor = filters.actor?.trim()
    const action = filters.action?.trim()
    const resource = filters.resource?.trim()
    if (actor) params.set('actor', actor)
    if (action) params.set('action', action)
    if (resource) params.set('resource', resource)

    try {
      return nativeOperationLogsPageSchema.parse(await request<unknown>(`/operation-logs?${params.toString()}`))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockOperationLogsPage(page, size)
    }
  },

  async exportOperationLogs(filters: { actor?: string; action?: string; resource?: string } = {}): Promise<{ blob: Blob; filename: string }> {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value?.trim()) params.set(key, value.trim())
    }
    const query = params.toString()
    try {
      return await readXlsxResponse(await requestFile(`/operation-logs/export${query ? `?${query}` : ''}`))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return mockXlsx('operation-logs.xlsx')
    }
  },

  async listLoginLogs(filters: { username?: string; status?: string; page?: number; size?: number } = {}): Promise<NativeLoginLogsPage> {
    const page = filters.page ?? 1
    const size = filters.size ?? 20
    const params = new URLSearchParams({ page: String(page), size: String(size) })
    const username = filters.username?.trim()
    const status = filters.status?.trim()
    if (username) params.set('username', username)
    if (status) params.set('status', status)

    try {
      return nativeLoginLogsPageSchema.parse(await request<unknown>(`/login-logs?${params.toString()}`))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockLoginLogsPage(page, size)
    }
  },

  async exportLoginLogs(filters: { username?: string; status?: string } = {}): Promise<{ blob: Blob; filename: string }> {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value?.trim()) params.set(key, value.trim())
    }
    const query = params.toString()
    try {
      return await readXlsxResponse(await requestFile(`/login-logs/export${query ? `?${query}` : ''}`))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return mockXlsx('login-logs.xlsx')
    }
  },

  listJobs: () => jobApi.listJobs(request, mockFallbackEnabled),

  listJobLogs: (filters: { jobId?: string; page?: number; size?: number } = {}) => jobApi.listJobLogs(request, mockFallbackEnabled, filters),

  deleteJobs: (ids: string[]) => jobApi.deleteJobs(request, mockFallbackEnabled, ids),

  createJob: (input: NativeJobWriteInput) => jobApi.createJob(request, mockFallbackEnabled, input),

  updateJob: (id: string, input: NativeJobWriteInput) => jobApi.updateJob(request, mockFallbackEnabled, id, input),

  updateJobStatus: (id: string, enabled: boolean) => jobApi.updateJobStatus(request, mockFallbackEnabled, id, enabled),

  triggerJob: (id: string) => jobApi.triggerJob(request, mockFallbackEnabled, id),

  async listRoles(): Promise<NativeRole[]> {
    try {
      return nativeRolesSchema.parse(await request<unknown>('/roles'))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockRoles()
    }
  },

  async exportRoles(): Promise<{ blob: Blob; filename: string }> {
    try {
      return await readXlsxResponse(await requestFile('/roles/export'))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return mockXlsx('roles.xlsx')
    }
  },

  async createRole(input: NativeRoleWriteInput): Promise<NativeRole> {
    try {
      return nativeRoleSchema.parse(await request<unknown>('/roles', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return nativeRoleSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: input.code ?? 'new-role', name: input.name, enabled: input.enabled ?? true, dataScope: 'ALL', deptScope: null, permissions: [] })
    }
  },

  async updateRole(id: string, input: NativeRoleWriteInput): Promise<NativeRole> {
    try {
      return nativeRoleSchema.parse(await request<unknown>(`/roles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      const role = createMockRoles().find((item) => item.id === id)
      return nativeRoleSchema.parse({ ...(role ?? createMockRoles()[0]), ...input, id })
    }
  },

  async deleteRoles(ids: string[]): Promise<NativeBatchDeleteResult> {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
    if (uniqueIds.length === 0) throw new Error('至少选择一个角色')
    const query = new URLSearchParams({ ids: uniqueIds.join(',') }).toString()
    try {
      return nativeBatchDeleteResultSchema.parse(await request<unknown>(`/roles?${query}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return { deleted: uniqueIds.length }
    }
  },

  async listDepartments(): Promise<NativeDepartment[]> {
    try {
      return nativeDepartmentsSchema.parse(await request<unknown>('/departments'))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockDepartments()
    }
  },

  async createDepartment(input: NativeDepartmentWriteInput): Promise<NativeDepartment> {
    try {
      return nativeDepartmentSchema.parse(await request<unknown>('/departments', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeDepartmentSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: input.code, name: input.name, parentId: input.parentId ?? null, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true })
    }
  },

  async updateDepartment(id: string, input: NativeDepartmentWriteInput): Promise<NativeDepartment> {
    try {
      return nativeDepartmentSchema.parse(await request<unknown>(`/departments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      const department = createMockDepartments().find((item) => item.id === id)
      return nativeDepartmentSchema.parse({ ...(department ?? createMockDepartments()[0]), ...input, id })
    }
  },

  async deleteDepartment(id: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/departments/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return { deleted: true }
    }
  },

  async listPosts(): Promise<NativePost[]> {
    try {
      return nativePostsSchema.parse(await request<unknown>('/posts'))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return createMockPosts()
    }
  },

  async createPost(input: NativePostWriteInput): Promise<NativePost> {
    try {
      return nativePostSchema.parse(await request<unknown>('/posts', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return createMockPost(input)
    }
  },

  async updatePost(id: string, input: NativePostWriteInput): Promise<NativePost> {
    try {
      return nativePostSchema.parse(await request<unknown>(`/posts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return updateMockPost(id, input)
    }
  },

  async deletePost(id: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return deleteMockPost(id)
    }
  },

  async exportPosts(): Promise<{ blob: Blob; filename: string }> {
    try {
      return await readXlsxResponse(await requestFile('/posts/export'))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return mockXlsx('posts.xlsx')
    }
  },

  async deleteMenu(id: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/menus/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return { deleted: true }
    }
  },

  async listMenus(): Promise<NativeMenuNode[]> {
    try {
      return nativeMenusSchema.parse(await request<unknown>('/menus'))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockMenus()
    }
  },

  async createMenu(input: NativeMenuWriteInput): Promise<NativeMenuNode['menu']> {
    try {
      return nativeMenuNodeSchema.parse({ menu: await request<unknown>('/menus', { method: 'POST', body: JSON.stringify(input) }), children: [] }).menu
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeMenuNodeSchema.parse({ menu: { id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', parentId: input.parentId ?? null, code: input.code, name: input.name, path: input.path ?? null, component: input.component ?? null, menuType: input.menuType, permission: input.permission ?? null, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true }, children: [] }).menu
    }
  },

  async updateMenu(id: string, input: NativeMenuWriteInput): Promise<NativeMenuNode['menu']> {
    try {
      return nativeMenuNodeSchema.parse({ menu: await request<unknown>(`/menus/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }), children: [] }).menu
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeMenuNodeSchema.parse({ menu: { id, parentId: input.parentId ?? null, code: input.code, name: input.name, path: input.path ?? null, component: input.component ?? null, menuType: input.menuType, permission: input.permission ?? null, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true }, children: [] }).menu
    }
  },

  async listApiKeys(): Promise<NativeApiKey[]> {
    try {
      return nativeApiKeysSchema.parse(await request<unknown>('/api-keys'))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockApiKeys()
    }
  },

  async issueApiKey(input: { name: string; scopes: string[]; expiresAt?: string | null }): Promise<NativeIssuedApiKey> {
    try {
      return nativeIssuedApiKeySchema.parse(await request<unknown>('/api-keys', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return nativeIssuedApiKeySchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', name: input.name, prefix: 'demo', apiKey: 'ks_live_demo_once', scopes: input.scopes, expiresAt: input.expiresAt ?? null, revokedAt: null, lastUsedAt: null, createdAt: new Date().toISOString() })
    }
  },

  async rotateApiKey(id: string): Promise<NativeIssuedApiKey> {
    try {
      return nativeIssuedApiKeySchema.parse(await request<unknown>(`/api-keys/${encodeURIComponent(id)}/rotate`, { method: 'POST' }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return nativeIssuedApiKeySchema.parse({ id, name: 'Rotated key', prefix: 'demo', apiKey: 'ks_live_rotated_once', scopes: [], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: new Date().toISOString() })
    }
  },

  async revokeApiKey(id: string): Promise<{ revoked: boolean }> {
    try {
      return nativeApiKeyRevokeResultSchema.parse(await request<unknown>(`/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return { revoked: true }
    }
  },

  async listSystemConfigs(): Promise<NativeSystemConfig[]> {
    try {
      return nativeSystemConfigsSchema.parse(await request<unknown>('/configs'))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockSystemConfigs()
    }
  },

  async createSystemConfig(input: NativeSystemConfigWriteInput): Promise<NativeSystemConfig> {
    try {
      return nativeSystemConfigSchema.parse(await request<unknown>('/configs', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeSystemConfigSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', key: input.key ?? 'new.config', value: input.value, description: input.description ?? null, enabled: input.enabled ?? true, updatedAt: new Date().toISOString() })
    }
  },

  async updateSystemConfig(key: string, input: NativeSystemConfigWriteInput): Promise<NativeSystemConfig> {
    try {
      return nativeSystemConfigSchema.parse(await request<unknown>(`/configs/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeSystemConfigSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', key, value: input.value, description: input.description ?? null, enabled: input.enabled ?? true, updatedAt: new Date().toISOString() })
    }
  },

  async deleteSystemConfig(key: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/configs/${encodeURIComponent(key)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return { deleted: true }
    }
  },

  async listDictionaryTypes(): Promise<NativeDictionaryType[]> {
    try {
      return nativeDictionaryTypesSchema.parse(await request<unknown>('/dictionaries'))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockDictionaryTypes()
    }
  },

  async listDictionaryItems(typeCode: string): Promise<NativeDictionaryItem[]> {
    const encodedTypeCode = encodeURIComponent(typeCode)
    try {
      return nativeDictionaryItemsSchema.parse(await request<unknown>(`/dictionaries/${encodedTypeCode}/items`))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockDictionaryItems(typeCode)
    }
  },

  async createDictionaryType(input: NativeDictionaryTypeWriteInput): Promise<NativeDictionaryType> {
    try {
      return nativeDictionaryTypeSchema.parse(await request<unknown>('/dictionaries', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeDictionaryTypeSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: input.code ?? 'new_type', name: input.name, enabled: input.enabled ?? true })
    }
  },

  async updateDictionaryType(code: string, input: NativeDictionaryTypeWriteInput): Promise<NativeDictionaryType> {
    try {
      return nativeDictionaryTypeSchema.parse(await request<unknown>(`/dictionaries/types/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeDictionaryTypeSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code, name: input.name, enabled: input.enabled ?? true })
    }
  },

  async deleteDictionaryType(code: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/dictionaries/types/${encodeURIComponent(code)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return { deleted: true }
    }
  },

  async createDictionaryItem(typeCode: string, input: NativeDictionaryItemWriteInput): Promise<NativeDictionaryItem> {
    try {
      return nativeDictionaryItemSchema.parse(await request<unknown>(`/dictionaries/${encodeURIComponent(typeCode)}/items`, { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeDictionaryItemSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518f2f', typeCode, value: input.value ?? 'new_value', label: input.label, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true })
    }
  },

  async updateDictionaryItem(id: string, input: NativeDictionaryItemWriteInput): Promise<NativeDictionaryItem> {
    try {
      return nativeDictionaryItemSchema.parse(await request<unknown>(`/dictionaries/items/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeDictionaryItemSchema.parse({ id, typeCode: 'custom', value: input.value ?? 'value', label: input.label, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true })
    }
  },

  async deleteDictionaryItem(id: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/dictionaries/items/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!mockFallbackEnabled()) throw error
      return { deleted: true }
    }
  },

  async listNotices(): Promise<NativeNotice[]> {
    try {
      return nativeNoticesSchema.parse(await request<unknown>('/notices/manage'))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return createMockNotices()
    }
  },

  async createNotice(input: NativeNoticeWriteInput): Promise<NativeNotice> {
    try {
      return nativeNoticeSchema.parse(await request<unknown>('/notices', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeNoticeSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', title: input.title, content: input.content, noticeType: input.noticeType, published: false, enabled: input.enabled ?? true, publishAt: null, createdBy: 'operator', createdAt: new Date().toISOString() })
    }
  },

  async updateNotice(id: string, input: NativeNoticeWriteInput): Promise<NativeNotice> {
    try {
      return nativeNoticeSchema.parse(await request<unknown>(`/notices/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeNoticeSchema.parse({ id, title: input.title, content: input.content, noticeType: input.noticeType, published: false, enabled: input.enabled ?? true, publishAt: null, createdBy: 'operator', createdAt: new Date().toISOString() })
    }
  },

  async deleteNotices(ids: string[]): Promise<NativeBatchDeleteResult> {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
    if (uniqueIds.length === 0) throw new Error('至少选择一条公告')
    const query = new URLSearchParams({ notice_ids: uniqueIds.join(',') }).toString()
    try {
      return nativeBatchDeleteResultSchema.parse(await request<unknown>(`/notices?${query}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!mockFallbackEnabled()) throw error
      return { deleted: uniqueIds.length }
    }
  },

  async publishNotice(id: string, published: boolean): Promise<NativeNotice> {
    try {
      return nativeNoticeSchema.parse(await request<unknown>(`/notices/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({ published }) }))
    } catch (error) {
      if (!mockFallbackEnabled()) throw error
      return nativeNoticeSchema.parse({ id, title: '公告', content: '', noticeType: 'announcement', published, enabled: true, publishAt: published ? new Date().toISOString() : null, createdBy: 'operator', createdAt: new Date().toISOString() })
    }
  },

  async revokeOnlineSession(sessionId: string): Promise<{ currentSessionRevoked: boolean }> {
    await request(`/monitor/onlineUser/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    const currentSessionRevoked = currentSessionId === sessionId
    if (currentSessionRevoked) {
      accessToken = null
      refreshToken = null
      currentUser = null
      currentSessionId = null
    }
    return { currentSessionRevoked }
  },
}
