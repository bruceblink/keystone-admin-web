import {
  apiEnvelopeSchema,
  loginResponseSchema,
  nativeCacheInfoSchema,
  nativeUsersPageSchema,
  nativeUserSchema,
  nativeProfileSchema,
  nativeBatchDeleteResultSchema,
  nativeDeleteResultSchema,
  nativeApiKeyRevokeResultSchema,
  nativeMenuRoleAssignmentSchema,
  nativeUpdatedResultSchema,
  nativeOperationLogsPageSchema,
  nativeLoginLogsPageSchema,
  nativeDepartmentsSchema,
  nativeDepartmentSchema,
  nativePostsSchema,
  nativePostsPageSchema,
  nativePostSchema,
  nativeMenusSchema,
  nativeMenuNodeSchema,
  nativeApiKeysSchema,
  nativeApiKeysPageSchema,
  nativePermissionCatalogSchema,
  nativeIssuedApiKeySchema,
  nativeSystemConfigsSchema,
  nativeSystemConfigsPageSchema,
  nativeSystemConfigSchema,
  nativeDictionaryTypesSchema,
  nativeDictionaryTypeSchema,
  nativeDictionaryItemsSchema,
  nativeDictionaryItemsPageSchema,
  nativeDictionaryItemSchema,
  nativeNoticesSchema,
  notificationSchema,
  notificationsSchema,
  notificationsPageSchema,
  nativeNoticesPageSchema,
  nativeNoticeSchema,
  nativeRolesSchema,
  nativeRolesPageSchema,
  nativeRoleSchema,
  nativeRoleUserIdsSchema,
  nativeRoleMembersResponseSchema,
  nativeRoleMembersPageSchema,
  nativeOnlineUsersSchema,
  nativeServerInfoSchema,
  nativeTokenSchema,
  nativeCapabilitiesSchema,
  nativeMfaStepUpChallengeSchema,
  nativeMfaLoginChallengeSchema,
  nativeMfaStepUpResultSchema,
  userSchema,
  type NativeUsersPage,
  type NativeServerInfo,
  type NativeCacheInfo,
  type NativeOnlineUsers,
  type NativeMfaStepUpChallenge,
  type NativeMfaLoginChallenge,
  type NativeMfaStepUpResult,
  type NativeCapabilities,
  type NotificationsPage,
  type NativeUser,
  type NativeProfile,
  type NativeProfileWriteInput,
  type NativeUserWriteInput,
  type NativeBatchDeleteResult,
  type NativeDeleteResult,
  type NativeOperationLogsPage,
  type NativeLoginLogsPage,
  type NativeJobWriteInput,
  type NativeDepartment,
  type NativePost,
  type NativePostsPage,
  type NativePostWriteInput,
  type NativeMenuNode,
  type NativeMenuRoleAssignment,
  type NativeMenuWriteInput,
  type NativeApiKey,
  type NativeApiKeysPage,
  type NativePermissionCatalogEntry,
  type NativeIssuedApiKey,
  type NativeSystemConfig,
  type NativeSystemConfigsPage,
  type NativeDictionaryType,
  type NativeDictionaryItem,
  type NativeDictionaryItemsPage,
  type NativeNotice,
  type Notification,
  type Notifications,
  type NativeNoticesPage,
  type NativeRole,
  type NativeRolesPage,
  type NativeRoleUserIds,
  type NativeRoleMember,
  type NativeRoleMembersResult,
  type NativeRoleWriteInput,
  type NativeDepartmentWriteInput,
  type NativeSystemConfigWriteInput,
  type NativeDictionaryTypeWriteInput,
  type NativeDictionaryItemWriteInput,
  type NativeNoticeWriteInput,
  type User,
} from './schemas'
import { createMockApiKeys, createMockDepartments, createMockDictionaryItems, createMockDictionaryTypes, createMockLogin, createMockLoginLogsPage, createMockMenus, createMockMonitorCacheInfo, createMockMonitorOnlineUsers, createMockMonitorServerInfo, createMockNotices, createMockOperationLogsPage, createMockPosts, createMockPost, createMockRoles, createMockSystemConfigs, createMockUsersPage, deleteMockPost, updateMockPost } from './mock'
import { jobApi } from './jobClient'
import { ApiError } from './errors'
import { createUserFileClient, readXlsxResponse, XLSX_MIME_TYPE } from './userFileClient'
export { ApiError } from './errors'
export { isXlsxFilename, XLSX_MIME_TYPE } from './userFileClient'
const API_BASE = '/api/v1'
const CLIENT_ID = 'web'
type PostListFilters = { keyword?: string; status?: string; page?: number; size?: number }
type RoleListFilters = { keyword?: string; status?: string; page?: number; size?: number }

/** 标记监控资源来自真实 API 或明确启用的开发 Mock。 */
export type MonitorResourceResult<T> = { value: T; source: 'api' | 'mock' }

let accessToken: string | null = null
let refreshToken: string | null = null
let currentUser: User | null = null
let currentSessionId: string | null = null
let refreshPromise: Promise<string | null> | null = null
let sessionExpiredHandler: (() => void) | null = null
let accessTokenRefreshedHandler: ((requestPath: string) => void) | null = null

/** 清除当前页面持有的认证信息；用于服务端已经撤销当前会话的操作。 */
export function clearLocalAuthentication(): void {
  accessToken = null
  refreshToken = null
  currentUser = null
  currentSessionId = null
}

async function listPostsRequest(): Promise<NativePost[]>
async function listPostsRequest(filters: PostListFilters): Promise<NativePostsPage>
async function listPostsRequest(filters?: PostListFilters): Promise<NativePost[] | NativePostsPage> {
  const paged = filters !== undefined
  const page = filters?.page ?? 1
  const size = filters?.size ?? 20
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (filters?.keyword?.trim()) params.set('keyword', filters.keyword.trim())
  if (filters?.status?.trim()) params.set('status', filters.status.trim())

  try {
    const payload = await request<unknown>(paged ? `/posts?${params.toString()}` : '/posts')
    return paged ? nativePostsPageSchema.parse(payload) : nativePostsSchema.parse(payload)
  } catch (error) {
    if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
    if (!shouldMockFallback(error)) throw error
    const keyword = filters?.keyword?.toLocaleLowerCase() ?? ''
    const status = filters?.status ?? ''
    const filtered = createMockPosts().filter((post) => {
      const matchesKeyword = !keyword || `${post.code} ${post.name}`.toLocaleLowerCase().includes(keyword)
      const matchesStatus = !status || (status === 'enabled' ? post.enabled : !post.enabled)
      return matchesKeyword && matchesStatus
    })
    if (!paged) return filtered
    const start = (page - 1) * size
    return { items: filtered.slice(start, start + size), page, size, total: filtered.length }
  }
}

async function listRolesRequest(): Promise<NativeRole[]>
async function listRolesRequest(filters: RoleListFilters): Promise<NativeRole[] | NativeRolesPage>
async function listRolesRequest(filters?: RoleListFilters): Promise<NativeRole[] | NativeRolesPage> {
  const paged = filters !== undefined
  const page = filters?.page ?? 1
  const size = filters?.size ?? 20
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (filters?.keyword?.trim()) params.set('keyword', filters.keyword.trim())
  if (filters?.status?.trim() && filters.status !== 'all') params.set('status', filters.status.trim())

  try {
    const payload = await request<unknown>(paged ? `/roles?${params.toString()}` : '/roles')
    const pageResult = nativeRolesPageSchema.safeParse(payload)
    if (!paged) return pageResult.success ? pageResult.data.items : nativeRolesSchema.parse(payload)
    if (pageResult.success) return pageResult.data
    const legacyItems = nativeRolesSchema.parse(payload)
    return { items: legacyItems, page, size, total: legacyItems.length }
  } catch (error) {
    if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
    if (!shouldMockFallback(error)) throw error
    const keyword = filters?.keyword?.toLocaleLowerCase() ?? ''
    const status = filters?.status ?? ''
    const filtered = createMockRoles().filter((role) => {
      const matchesKeyword = !keyword || `${role.code} ${role.name}`.toLocaleLowerCase().includes(keyword)
      const matchesStatus = !status || status === 'all' || (status === 'enabled' ? role.enabled : !role.enabled)
      return matchesKeyword && matchesStatus
    })
    if (!paged) return filtered
    const start = (page - 1) * size
    return { items: filtered.slice(start, start + size), page, size, total: filtered.length }
  }
}
function mockFallbackEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK !== 'false'
}
function shouldMockFallback(error: unknown): boolean {
  return mockFallbackEnabled() && error instanceof ApiError && error.status === 0
}

// 统一系统配置读取入口，避免数组兼容接口和分页接口在客户端形成重复路由。
async function requestSystemConfigs(query = ''): Promise<unknown> {
  return request<unknown>(`/configs?${query}`)
}

// 字典条目数组和分页查询共用一个请求入口，避免客户端重复登记同一路由。
async function requestDictionaryItems(typeCode: string, query = ''): Promise<unknown> {
  const suffix = query ? `?${query}` : ''
  const path = `/dictionaries/${encodeURIComponent(typeCode)}/items${suffix}`
  return request<unknown>(path)
}

// 统一 API Key 和公告读取入口，兼容数组接口并保持分页请求使用同一路由。
async function requestApiKeys(query = ''): Promise<unknown> {
  return request<unknown>(`/api-keys?${query}`)
}

async function requestManagedNotices(query = ''): Promise<unknown> {
  return request<unknown>(`/notices/manage?${query}`)
}

function serverApiError(envelope: ReturnType<typeof apiEnvelopeSchema.parse>, status: number): ApiError {
  const error = envelope.error
  const hasServerCode = typeof error?.code === 'string' && error.code.trim() !== ''
  // 服务端失败响应缺少业务码时，按协议响应错误处理，避免页面产生不可反查的异常。
  return new ApiError(envelope.message, status, hasServerCode ? error.code : 'invalid_response', envelope.data, {
    source: hasServerCode ? 'server' : 'client',
    requestId: error?.requestId,
    details: error?.details,
    fields: error?.fields,
    retryAfterSeconds: error?.retryAfterSeconds,
  })
}
/** 会话刷新失败时通知状态层，避免模块内令牌已清理但页面仍保留旧用户。 */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}
export function setAccessTokenRefreshedHandler(handler: ((requestPath: string) => void) | null): void {
  accessTokenRefreshedHandler = handler
}
function unwrap<T>(body: unknown, status: number): T {
  const envelope = apiEnvelopeSchema.safeParse(body)
  if (!envelope.success) return body as T
  if (!envelope.data.success) {
    throw serverApiError(envelope.data, status)
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
    throw new ApiError('无法连接系统 API', 0, 'network_error')
  }

  const body = response.status === 204 ? null : await readJson(response)
  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshed = await refreshAccessToken(path)
    if (refreshed) return request<T>(path, init, false)
  }

  if (!response.ok) {
    const envelope = apiEnvelopeSchema.safeParse(body)
    const message = envelope.success ? envelope.data.message : `请求失败（${response.status}）`
    if (envelope.success) throw serverApiError(envelope.data, response.status)
    throw new ApiError(message, response.status, undefined, undefined, { source: 'server' })
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
    throw new ApiError('无法连接系统 API', 0, 'network_error')
  }

  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshed = await refreshAccessToken(path)
    if (refreshed) return requestFile(path, init, false)
  }

  if (!response.ok) {
    const body = await readJson(response)
    const envelope = apiEnvelopeSchema.safeParse(body)
    const message = envelope.success ? envelope.data.message : `请求失败（${response.status}）`
    if (envelope.success) throw serverApiError(envelope.data, response.status)
    throw new ApiError(message, response.status, undefined, undefined, { source: 'server' })
  }
  return response
}
const userFileApi = createUserFileClient({ request, requestFile, mockFallbackEnabled: shouldMockFallback })
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
async function refreshAccessToken(requestPath?: string): Promise<string | null> {
  if (!refreshToken) return null
  if (refreshPromise) return refreshPromise
  refreshPromise = request<unknown>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken, clientId: CLIENT_ID }),
  }, false)
    .then((result) => {
      const token = nativeTokenSchema.parse(result)
      applyToken(token)
      // 权限查询本身完成了重新验证；其他接口触发令牌刷新时，提示会话重新读取能力。
      if (requestPath && requestPath !== '/auth/me/capabilities') accessTokenRefreshedHandler?.(requestPath)
      return token.accessToken
    })
    .catch(() => {
      clearLocalAuthentication()
      sessionExpiredHandler?.()
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

export function getMfaLoginChallenge(error: unknown): NativeMfaLoginChallenge | null {
  // Native 和 Phoenix 的可读 message 不同，认证挑战由 401 和统一 challenge DTO 判定。
  if (!(error instanceof ApiError) || error.status !== 401) return null
  const challenge = nativeMfaLoginChallengeSchema.safeParse(error.data)
  return challenge.success ? challenge.data : null
}

export const apiClient = {
  async login(username: string, password: string, forceLogin = false): Promise<{ accessToken: string; user: User }> {
    try {
      const token = nativeTokenSchema.parse(await request<unknown>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, forceLogin, clientId: CLIENT_ID }),
      }))
      const user = applyToken(token)
      return { accessToken: token.accessToken, user }
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return mockUserResult()
    }
  },

  /** 首次登录前更新管理员初始密码；接口成功后不会在前端创建会话。 */
  async changeInitialPassword(username: string, currentPassword: string, newPassword: string): Promise<{ updated: boolean }> {
    return nativeUpdatedResultSchema.parse(await request<unknown>('/auth/change-initial-password', {
      method: 'POST',
      body: JSON.stringify({ username, currentPassword, newPassword }),
    }, false))
  },

  async verifyMfaLogin(username: string, challengeId: string, clientId: string, code: string, forceLogin = false): Promise<{ accessToken: string; user: User }> {
    const token = nativeTokenSchema.parse(await request<unknown>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ username, challengeId, clientId, code, forceLogin }),
    }, false))
    const user = applyToken(token)
    return { accessToken: token.accessToken, user }
  },

  async restoreSession(): Promise<User | null> {
    const token = await refreshAccessToken()
    return token ? currentUser : null
  },

  /** 每次读取当前会话的有效权限和资源范围；失败时不使用 Mock 或默认权限。 */
  async getCapabilities(): Promise<NativeCapabilities> {
    return nativeCapabilitiesSchema.parse(await request<unknown>('/auth/me/capabilities'))
  },

  async logout(): Promise<void> {
    try {
      // 访问令牌过期时先刷新，确保仍能撤销当前服务端会话。
      await request('/auth/logout', { method: 'POST' })
    } finally {
      // 无论服务端结果如何，都清理当前页面中的认证信息。
      clearLocalAuthentication()
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

  // 监控资源分别读取；单项权限拒绝只影响对应数据区块，不转换成整页 Mock 成功。
  async getMonitorServerInfo(): Promise<MonitorResourceResult<NativeServerInfo>> {
    try {
      return { value: nativeServerInfoSchema.parse(await request<unknown>('/monitor/serverInfo')), source: 'api' }
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return { value: createMockMonitorServerInfo(), source: 'mock' }
    }
  },

  async getMonitorCacheInfo(): Promise<MonitorResourceResult<NativeCacheInfo>> {
    try {
      return { value: nativeCacheInfoSchema.parse(await request<unknown>('/monitor/cacheInfo')), source: 'api' }
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return { value: createMockMonitorCacheInfo(), source: 'mock' }
    }
  },

  async listMonitorOnlineUsers(): Promise<MonitorResourceResult<NativeOnlineUsers>> {
    try {
      return { value: nativeOnlineUsersSchema.parse(await request<unknown>('/monitor/onlineUsers?page=1&size=100')), source: 'api' }
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return { value: createMockMonitorOnlineUsers(), source: 'mock' }
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
      if (!shouldMockFallback(error)) throw error
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
      if (!shouldMockFallback(error)) throw error
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
      if (!shouldMockFallback(error)) throw error
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
      if (!shouldMockFallback(error)) throw error
      return { deleted: uniqueIds.length }
    }
  },

  importUsers: userFileApi.importUsers,

  exportUsers: userFileApi.exportUsers,

  async getProfile(): Promise<NativeProfile> {
    try {
      return nativeProfileSchema.parse(await request<unknown>('/profile'))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      const user = currentUser
      return nativeProfileSchema.parse({
        id: user?.id ?? '', username: user?.username ?? '', displayName: user?.displayName ?? '',
        roles: user?.role ? [user.role] : [], mustChangePassword: false, deptId: null, postId: null,
        email: null, phoneNumber: null, sex: null, avatar: null, loginIp: null, loginAt: null, remark: null,
      })
    }
  },

  async updateProfile(input: NativeProfileWriteInput): Promise<NativeProfile> {
    try {
      return nativeProfileSchema.parse(await request<unknown>('/profile', { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      const current = await apiClient.getProfile()
      return nativeProfileSchema.parse({ ...current, ...input })
    }
  },

  async updateProfileAvatar(avatar: string): Promise<{ avatar: string }> {
    try {
      return await request<unknown>('/profile/avatar', { method: 'PUT', body: JSON.stringify({ avatar }) }) as { avatar: string }
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return { avatar }
    }
  },

  async updateProfilePassword(password: string): Promise<{ updated: boolean }> {
    return nativeUpdatedResultSchema.parse(await request<unknown>('/profile/password', { method: 'PUT', body: JSON.stringify({ password }) }))
  },

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
      if (!shouldMockFallback(error)) throw error
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
      if (!shouldMockFallback(error)) throw error
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
      if (!shouldMockFallback(error)) throw error
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
      if (!shouldMockFallback(error)) throw error
      return mockXlsx('login-logs.xlsx')
    }
  },

  listJobs: (filters: { keyword?: string; page?: number; size?: number } = {}) => jobApi.listJobs(request, shouldMockFallback, filters),
  getJob: (id: string) => jobApi.getJob(request, shouldMockFallback, id),

  listJobLogs: (filters: { jobId?: string; page?: number; size?: number } = {}) => jobApi.listJobLogs(request, shouldMockFallback, filters),

  deleteJobs: (ids: string[]) => jobApi.deleteJobs(request, shouldMockFallback, ids),

  createJob: (input: NativeJobWriteInput) => jobApi.createJob(request, shouldMockFallback, input),

  updateJob: (id: string, input: NativeJobWriteInput) => jobApi.updateJob(request, shouldMockFallback, id, input),

  updateJobStatus: (id: string, enabled: boolean) => jobApi.updateJobStatus(request, shouldMockFallback, id, enabled),

  triggerJob: (id: string) => jobApi.triggerJob(request, shouldMockFallback, id),

  listRoles: listRolesRequest,

  async exportRoles(): Promise<{ blob: Blob; filename: string }> {
    try {
      return await readXlsxResponse(await requestFile('/roles/export'))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!shouldMockFallback(error)) throw error
      return mockXlsx('roles.xlsx')
    }
  },

  async createRole(input: NativeRoleWriteInput): Promise<NativeRole> {
    try {
      return nativeRoleSchema.parse(await request<unknown>('/roles', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!shouldMockFallback(error)) throw error
      return nativeRoleSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: input.code ?? 'new-role', name: input.name, enabled: input.enabled ?? true, dataScope: 'ALL', deptScope: null, permissions: [] })
    }
  },

  async updateRole(id: string, input: NativeRoleWriteInput): Promise<NativeRole> {
    try {
      return nativeRoleSchema.parse(await request<unknown>(`/roles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!shouldMockFallback(error)) throw error
      const role = createMockRoles().find((item) => item.id === id)
      return nativeRoleSchema.parse({ ...(role ?? createMockRoles()[0]), ...input, id })
    }
  },

  /** 替换角色权限目录；服务端要求 role:manage 和 MFA step-up。 */
  async updateRolePermissions(id: string, permissions: string[]): Promise<{ updated: boolean }> {
    const normalized = [...new Set(permissions.map((permission) => permission.trim()).filter(Boolean))]
    try {
      return nativeUpdatedResultSchema.parse(await request<unknown>(`/roles/${encodeURIComponent(id)}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: normalized }),
      }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!shouldMockFallback(error)) throw error
      return { updated: true }
    }
  },

  /** 查询角色已分配或可分配的用户 ID；两个后端保持相同的数组响应。 */
  async listRoleUsers(id: string, allocated = true): Promise<NativeRoleUserIds> {
    const query = new URLSearchParams({ allocated: String(allocated) }).toString()
    try {
      return nativeRoleUserIdsSchema.parse(await request<unknown>(`/roles/${encodeURIComponent(id)}/users?${query}`))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return []
    }
  },

  /** 显式分页时读取服务端分页；旧版后端返回数组时保留本地切片兼容。 */
  async listRoleMembers(id: string, allocated = true, pagination?: { page: number; size: number }): Promise<NativeRoleMembersResult> {
    const query = new URLSearchParams({
      allocated: String(allocated),
      include: 'identity',
      ...(pagination ? { page: String(pagination.page), size: String(pagination.size) } : {}),
    }).toString()
    try {
      const response = await request<unknown>(`/roles/${encodeURIComponent(id)}/users?${query}`)
      const normalizeMembers = (members: Array<NativeRoleMember | string>): NativeRoleMember[] =>
        members.map((member) => typeof member === 'string' ? { id: member, username: null, displayName: null } : member)
      if (Array.isArray(response)) {
        return normalizeMembers(nativeRoleMembersResponseSchema.parse(response))
      }
      const page = nativeRoleMembersPageSchema.parse(response)
      return { ...page, items: normalizeMembers(page.items) }
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return []
    }
  },

  /** 原子追加角色成员；服务端会执行权限和 MFA 校验。 */
  async assignRoleUsers(id: string, userIds: string[]): Promise<{ updated: boolean }> {
    const normalized = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))]
    if (normalized.length === 0) throw new Error('至少选择一个用户')
    try {
      return nativeUpdatedResultSchema.parse(await request<unknown>(`/roles/${encodeURIComponent(id)}/users`, {
        method: 'PUT',
        body: JSON.stringify({ userIds: normalized }),
      }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return { updated: true }
    }
  },

  /** 原子移除角色成员；服务端保持重复移除幂等。 */
  async revokeRoleUsers(id: string, userIds: string[]): Promise<{ updated: boolean }> {
    const normalized = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))]
    if (normalized.length === 0) throw new Error('至少选择一个用户')
    try {
      return nativeUpdatedResultSchema.parse(await request<unknown>(`/roles/${encodeURIComponent(id)}/users`, {
        method: 'DELETE',
        body: JSON.stringify({ userIds: normalized }),
      }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return { updated: true }
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
      if (!shouldMockFallback(error)) throw error
      return { deleted: uniqueIds.length }
    }
  },

  async listDepartments(): Promise<NativeDepartment[]> {
    try {
      return nativeDepartmentsSchema.parse(await request<unknown>('/departments'))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return createMockDepartments()
    }
  },

  async createDepartment(input: NativeDepartmentWriteInput): Promise<NativeDepartment> {
    try {
      return nativeDepartmentSchema.parse(await request<unknown>('/departments', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeDepartmentSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: input.code, name: input.name, parentId: input.parentId ?? null, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true })
    }
  },

  async updateDepartment(id: string, input: NativeDepartmentWriteInput): Promise<NativeDepartment> {
    try {
      return nativeDepartmentSchema.parse(await request<unknown>(`/departments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      const department = createMockDepartments().find((item) => item.id === id)
      return nativeDepartmentSchema.parse({ ...(department ?? createMockDepartments()[0]), ...input, id })
    }
  },

  async deleteDepartment(id: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/departments/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return { deleted: true }
    }
  },

  listPosts: listPostsRequest,

  async createPost(input: NativePostWriteInput): Promise<NativePost> {
    try {
      return nativePostSchema.parse(await request<unknown>('/posts', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return createMockPost(input)
    }
  },

  async updatePost(id: string, input: NativePostWriteInput): Promise<NativePost> {
    try {
      return nativePostSchema.parse(await request<unknown>(`/posts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return updateMockPost(id, input)
    }
  },

  async deletePost(id: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return deleteMockPost(id)
    }
  },

  async exportPosts(): Promise<{ blob: Blob; filename: string }> {
    try {
      return await readXlsxResponse(await requestFile('/posts/export'))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return mockXlsx('posts.xlsx')
    }
  },

  async deleteMenu(id: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/menus/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return { deleted: true }
    }
  },

  async listMenus(): Promise<NativeMenuNode[]> {
    try {
      return nativeMenusSchema.parse(await request<unknown>('/menus'))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return createMockMenus()
    }
  },

  async createMenu(input: NativeMenuWriteInput): Promise<NativeMenuNode['menu']> {
    try {
      return nativeMenuNodeSchema.parse({ menu: await request<unknown>('/menus', { method: 'POST', body: JSON.stringify(input) }), children: [] }).menu
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeMenuNodeSchema.parse({ menu: { id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', parentId: input.parentId ?? null, code: input.code, name: input.name, path: input.path ?? null, component: input.component ?? null, menuType: input.menuType, permission: input.permission ?? null, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true }, children: [] }).menu
    }
  },

  async updateMenu(id: string, input: NativeMenuWriteInput): Promise<NativeMenuNode['menu']> {
    try {
      return nativeMenuNodeSchema.parse({ menu: await request<unknown>(`/menus/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }), children: [] }).menu
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeMenuNodeSchema.parse({ menu: { id, parentId: input.parentId ?? null, code: input.code, name: input.name, path: input.path ?? null, component: input.component ?? null, menuType: input.menuType, permission: input.permission ?? null, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true }, children: [] }).menu
    }
  },

  /** 查询菜单当前绑定的角色编码，供权限管理表单回显。 */
  async listRolesForMenu(id: string): Promise<NativeMenuRoleAssignment> {
    try {
      return nativeMenuRoleAssignmentSchema.parse(await request<unknown>(`/menus/${encodeURIComponent(id)}/roles`))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return { roleCodes: [] }
    }
  },

  /** 替换菜单的角色绑定；服务端会校验角色编码和管理权限。 */
  async assignMenuRoles(id: string, roleCodes: string[]): Promise<{ updated: boolean }> {
    const normalized = [...new Set(roleCodes.map((code) => code.trim()).filter(Boolean))]
    try {
      return nativeUpdatedResultSchema.parse(await request<unknown>(`/menus/${encodeURIComponent(id)}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roleCodes: normalized }),
      }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return { updated: true }
    }
  },

  async listApiKeys(): Promise<NativeApiKey[]> {
    try {
      return nativeApiKeysSchema.parse(await requestApiKeys())
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return createMockApiKeys()
    }
  },

  async listApiKeysPage(filters: { keyword?: string; status?: string; page: number; size: number }): Promise<NativeApiKeysPage> {
    try {
      const params = new URLSearchParams({ page: String(filters.page), size: String(filters.size) })
      if (filters.keyword) params.set('keyword', filters.keyword)
      if (filters.status && filters.status !== 'all') params.set('status', filters.status)
      return nativeApiKeysPageSchema.parse(await requestApiKeys(params.toString()))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      const keyword = filters.keyword?.toLocaleLowerCase() ?? ''
      const filtered = createMockApiKeys().filter((key) => {
        const matchesKeyword = !keyword || `${key.name} ${key.prefix} ${key.scopes.join(' ')}`.toLocaleLowerCase().includes(keyword)
        const matchesStatus = !filters.status || filters.status === 'all' || (filters.status === 'revoked' ? Boolean(key.revokedAt) : !key.revokedAt)
        return matchesKeyword && matchesStatus
      })
      const start = (filters.page - 1) * filters.size
      return { items: filtered.slice(start, start + filters.size), page: filters.page, size: filters.size, total: filtered.length }
    }
  },

  async listPermissionCatalog(): Promise<NativePermissionCatalogEntry[]> {
    return nativePermissionCatalogSchema.parse(await request<unknown>('/permissions/catalog')).entries
  },

  async issueApiKey(input: { name: string; scopes: string[]; expiresAt?: string | null }): Promise<NativeIssuedApiKey> {
    try {
      return nativeIssuedApiKeySchema.parse(await request<unknown>('/api-keys', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!shouldMockFallback(error)) throw error
      return nativeIssuedApiKeySchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', name: input.name, prefix: 'demo', apiKey: 'ks_live_demo_once', scopes: input.scopes, expiresAt: input.expiresAt ?? null })
    }
  },

  async rotateApiKey(id: string): Promise<NativeIssuedApiKey> {
    try {
      return nativeIssuedApiKeySchema.parse(await request<unknown>(`/api-keys/${encodeURIComponent(id)}/rotate`, { method: 'POST' }))
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) throw error
      if (!shouldMockFallback(error)) throw error
      return nativeIssuedApiKeySchema.parse({ id, name: 'Rotated key', prefix: 'demo', apiKey: 'ks_live_rotated_once', scopes: [], expiresAt: null })
    }
  },

  async revokeApiKey(id: string): Promise<{ revoked: boolean }> {
    try {
      return nativeApiKeyRevokeResultSchema.parse(await request<unknown>(`/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return { revoked: true }
    }
  },

  async listSystemConfigs(): Promise<NativeSystemConfig[]> {
    try {
      return nativeSystemConfigsSchema.parse(await requestSystemConfigs())
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return createMockSystemConfigs()
    }
  },

  async listSystemConfigsPage(filters: { keyword?: string; page: number; size: number }): Promise<NativeSystemConfigsPage> {
    try {
      const params = new URLSearchParams({ page: String(filters.page), size: String(filters.size) })
      if (filters.keyword) params.set('keyword', filters.keyword)
      return nativeSystemConfigsPageSchema.parse(await requestSystemConfigs(params.toString()))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      const keyword = filters.keyword?.toLocaleLowerCase() ?? ''
      const filtered = createMockSystemConfigs().filter((config) => !keyword || `${config.key} ${config.description ?? ''}`.toLocaleLowerCase().includes(keyword))
      const start = (filters.page - 1) * filters.size
      return { items: filtered.slice(start, start + filters.size), page: filters.page, size: filters.size, total: filtered.length }
    }
  },

  async createSystemConfig(input: NativeSystemConfigWriteInput): Promise<NativeSystemConfig> {
    try {
      return nativeSystemConfigSchema.parse(await request<unknown>('/configs', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeSystemConfigSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', key: input.key ?? 'new.config', value: input.value, description: input.description ?? null, enabled: input.enabled ?? true, updatedAt: new Date().toISOString() })
    }
  },

  async updateSystemConfig(key: string, input: NativeSystemConfigWriteInput): Promise<NativeSystemConfig> {
    try {
      return nativeSystemConfigSchema.parse(await request<unknown>(`/configs/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeSystemConfigSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', key, value: input.value, description: input.description ?? null, enabled: input.enabled ?? true, updatedAt: new Date().toISOString() })
    }
  },

  async deleteSystemConfig(key: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/configs/${encodeURIComponent(key)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return { deleted: true }
    }
  },

  async listDictionaryTypes(): Promise<NativeDictionaryType[]> {
    try {
      return nativeDictionaryTypesSchema.parse(await request<unknown>('/dictionaries'))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return createMockDictionaryTypes()
    }
  },

  async listDictionaryItems(typeCode: string): Promise<NativeDictionaryItem[]> {
    try {
      return nativeDictionaryItemsSchema.parse(await request<unknown>(`/dictionaries/${encodeURIComponent(typeCode)}/items`))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return createMockDictionaryItems(typeCode)
    }
  },

  async listDictionaryItemsPage(typeCode: string, filters: { keyword?: string; page: number; size: number }): Promise<NativeDictionaryItemsPage> {
    try {
      const params = new URLSearchParams({ page: String(filters.page), size: String(filters.size) })
      if (filters.keyword) params.set('keyword', filters.keyword)
      return nativeDictionaryItemsPageSchema.parse(await requestDictionaryItems(typeCode, params.toString()))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      const keyword = filters.keyword?.toLocaleLowerCase() ?? ''
      const filtered = createMockDictionaryItems(typeCode).filter((item) => !keyword || `${item.value} ${item.label}`.toLocaleLowerCase().includes(keyword))
      const start = (filters.page - 1) * filters.size
      return { items: filtered.slice(start, start + filters.size), page: filters.page, size: filters.size, total: filtered.length }
    }
  },

  async createDictionaryType(input: NativeDictionaryTypeWriteInput): Promise<NativeDictionaryType> {
    try {
      return nativeDictionaryTypeSchema.parse(await request<unknown>('/dictionaries', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeDictionaryTypeSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: input.code ?? 'new_type', name: input.name, enabled: input.enabled ?? true })
    }
  },

  async updateDictionaryType(code: string, input: NativeDictionaryTypeWriteInput): Promise<NativeDictionaryType> {
    try {
      return nativeDictionaryTypeSchema.parse(await request<unknown>(`/dictionaries/types/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeDictionaryTypeSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code, name: input.name, enabled: input.enabled ?? true })
    }
  },

  async deleteDictionaryType(code: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/dictionaries/types/${encodeURIComponent(code)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return { deleted: true }
    }
  },

  async createDictionaryItem(typeCode: string, input: NativeDictionaryItemWriteInput): Promise<NativeDictionaryItem> {
    try {
      return nativeDictionaryItemSchema.parse(await request<unknown>(`/dictionaries/${encodeURIComponent(typeCode)}/items`, { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeDictionaryItemSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518f2f', typeCode, value: input.value ?? 'new_value', label: input.label, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true })
    }
  },

  async updateDictionaryItem(id: string, input: NativeDictionaryItemWriteInput): Promise<NativeDictionaryItem> {
    try {
      return nativeDictionaryItemSchema.parse(await request<unknown>(`/dictionaries/items/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeDictionaryItemSchema.parse({ id, typeCode: 'custom', value: input.value ?? 'value', label: input.label, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true })
    }
  },

  async deleteDictionaryItem(id: string): Promise<NativeDeleteResult> {
    try {
      return nativeDeleteResultSchema.parse(await request<unknown>(`/dictionaries/items/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error
      if (!shouldMockFallback(error)) throw error
      return { deleted: true }
    }
  },

  async listPublicNotices(): Promise<NativeNotice[]> {
    try {
      return nativeNoticesSchema.parse(await request<unknown>('/notices'))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return createMockNotices().filter((notice) => notice.published && notice.enabled)
    }
  },

  /** 读取当前登录用户的站内通知，不使用公开公告接口。 */
  async listNotifications(): Promise<Notifications> {
    return notificationsSchema.parse(await request<unknown>('/notifications'))
  },

  /** 读取当前登录用户指定页的站内通知；服务端每页返回 50 条。 */
  async listNotificationsPage(page: number): Promise<NotificationsPage> {
    const params = new URLSearchParams({ page: String(page) })
    return notificationsPageSchema.parse(await request<unknown>(`/notifications?${params.toString()}`))
  },

  /** 将当前用户的一条通知标记为已读，并返回更新后的详情。 */
  async readNotification(id: string): Promise<Notification> {
    return notificationSchema.parse(await request<unknown>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }))
  },

  async listNotices(): Promise<NativeNotice[]> {
    try {
      return nativeNoticesSchema.parse(await requestManagedNotices())
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return createMockNotices()
    }
  },

  async listNoticesPage(filters: { keyword?: string; status?: string; page: number; size: number }): Promise<NativeNoticesPage> {
    try {
      const params = new URLSearchParams({ page: String(filters.page), size: String(filters.size) })
      if (filters.keyword) params.set('keyword', filters.keyword)
      if (filters.status && filters.status !== 'all') params.set('status', filters.status)
      return nativeNoticesPageSchema.parse(await requestManagedNotices(params.toString()))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      const keyword = filters.keyword?.toLocaleLowerCase() ?? ''
      const filtered = createMockNotices().filter((notice) => {
        const matchesKeyword = !keyword || `${notice.title} ${notice.content} ${notice.noticeType}`.toLocaleLowerCase().includes(keyword)
        const matchesStatus = !filters.status || filters.status === 'all' || (filters.status === 'published' ? notice.published : !notice.published)
        return matchesKeyword && matchesStatus
      })
      const start = (filters.page - 1) * filters.size
      return { items: filtered.slice(start, start + filters.size), page: filters.page, size: filters.size, total: filtered.length }
    }
  },

  async createNotice(input: NativeNoticeWriteInput): Promise<NativeNotice> {
    try {
      return nativeNoticeSchema.parse(await request<unknown>('/notices', { method: 'POST', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeNoticeSchema.parse({ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', title: input.title, content: input.content, noticeType: input.noticeType, published: false, enabled: input.enabled ?? true, publishAt: null, createdBy: 'operator', createdAt: new Date().toISOString() })
    }
  },

  async updateNotice(id: string, input: NativeNoticeWriteInput): Promise<NativeNotice> {
    try {
      return nativeNoticeSchema.parse(await request<unknown>(`/notices/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
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
      if (!shouldMockFallback(error)) throw error
      return { deleted: uniqueIds.length }
    }
  },

  async publishNotice(id: string, published: boolean): Promise<NativeNotice> {
    try {
      return nativeNoticeSchema.parse(await request<unknown>(`/notices/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({ published }) }))
    } catch (error) {
      if (!shouldMockFallback(error)) throw error
      return nativeNoticeSchema.parse({ id, title: '公告', content: '', noticeType: 'announcement', published, enabled: true, publishAt: published ? new Date().toISOString() : null, createdBy: 'operator', createdAt: new Date().toISOString() })
    }
  },

  async revokeOnlineSession(sessionId: string): Promise<{ currentSessionRevoked: boolean }> {
    await request(`/monitor/onlineUser/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    const currentSessionRevoked = currentSessionId === sessionId
    if (currentSessionRevoked) {
      clearLocalAuthentication()
    }
    return { currentSessionRevoked }
  },
}
