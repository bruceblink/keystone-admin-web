import type { NativeApiKey, NativeCacheInfo, NativeDepartment, NativeDictionaryItem, NativeDictionaryItemWriteInput, NativeDictionaryType, NativeDictionaryTypeWriteInput, NativeJob, NativeJobTriggerResult, NativeJobWriteInput, NativeLoginLogsPage, NativeMenuNode, NativeNotice, NativeNoticeWriteInput, NativeOnlineUsers, NativeOperationLogsPage, NativePost, NativePostWriteInput, NativeRole, NativeServerInfo, NativeSystemConfig, NativeSystemConfigWriteInput, NativeUsersPage, User } from './schemas'

export const mockUser: User = {
  id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
  username: 'operator',
  displayName: '平台运维员',
  role: '系统管理员',
}

let mockSequence = 1000
let mockSystemConfigs: NativeSystemConfig[] | null = null
let mockDictionaryTypes: NativeDictionaryType[] | null = null
let mockNotices: NativeNotice[] | null = null
let mockJobs: NativeJob[] | null = null
let mockPosts: NativePost[] | null = null
const mockDictionaryItems = new Map<string, NativeDictionaryItem[]>()

function nextMockId(): string {
  const suffix = (mockSequence++).toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${suffix}`
}

function clone<T extends object>(value: T): T {
  return { ...value }
}

/** 开发环境网络不可用时返回主机接口形状；权限拒绝不会进入此回退。 */
export function createMockMonitorServerInfo(): NativeServerInfo {
  return {
    javaVersion: '21',
    jvmName: 'OpenJDK',
    osName: 'macOS',
    osVersion: '15',
    processors: 8,
    maxMemory: 1_000,
    totalMemory: 800,
    freeMemory: 300,
    heapUsed: 500,
    uptimeMs: 3_600_000,
  }
}

/** 开发环境网络不可用时返回缓存统计接口形状。 */
export function createMockMonitorCacheInfo(): NativeCacheInfo {
  return { provider: 'database', activeSessions: 3, loginLogEntries: 128 }
}

/** 开发环境网络不可用时返回在线会话接口形状。 */
export function createMockMonitorOnlineUsers(): NativeOnlineUsers {
  const now = Date.now()
  const users = [
    { sessionId: 'session-7c8d', username: 'lin.chen', displayName: '运维管理员', ipAddress: '10.17.17.42' },
    { sessionId: 'session-8f10', username: 'rui.zhang', displayName: '审计员', ipAddress: '10.17.17.58' },
    { sessionId: 'session-a123', username: 'miao.wu', displayName: '业务管理员', ipAddress: '10.17.17.64' },
  ]

  return {
    items: users.map((user, index) => ({
      ...user,
      userId: `mock-user-${index + 1}`,
      createdAt: new Date(now - index * 48_000).toISOString(),
      expiresAt: new Date(now + 86_400_000).toISOString(),
      accessExpiresAt: new Date(now + 300_000).toISOString(),
    })),
    page: 1,
    size: 100,
    total: users.length,
  }
}

export function createMockLogin() {
  return { accessToken: `dev-token-${Date.now()}`, user: mockUser }
}

export function createMockUsersPage(page = 1, size = 20): NativeUsersPage {
  return {
    items: [{
      id: mockUser.id,
      username: mockUser.username,
      displayName: mockUser.displayName,
      deptId: null,
      postId: null,
      enabled: true,
      email: null,
      phoneNumber: null,
      sex: null,
      avatar: null,
      loginIp: null,
      loginAt: null,
      remark: null,
      roles: [mockUser.role],
    }],
    page,
    size,
    total: 1,
  }
}

export function createMockOperationLogsPage(page = 1, size = 20): NativeOperationLogsPage {
  return {
    items: [{
      id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
      actorUsername: mockUser.username,
      action: 'LOGIN',
      resource: 'auth',
      resourceId: null,
      detail: '登录成功',
      createdAt: new Date().toISOString(),
    }],
    page,
    size,
    total: 1,
  }
}

export function createMockLoginLogsPage(page = 1, size = 20): NativeLoginLogsPage {
  return {
    items: [{
      id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', username: mockUser.username, status: 'SUCCESS',
      ipAddress: '127.0.0.1', message: '登录成功', userAgent: 'Codex Browser', loginAt: new Date().toISOString(),
    }],
    page,
    size,
    total: 1,
  }
}

export function createMockJobs(): NativeJob[] {
  mockJobs ??= [{
    id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM',
    invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false,
    enabled: true, remark: '开发环境示例任务', lastStatus: 'SUCCESS', lastRunAt: new Date().toISOString(),
  }]
  return mockJobs.map(clone)
}

export function createMockJob(input: NativeJobWriteInput): NativeJob {
  createMockJobs()
  const job: NativeJob = {
    id: nextMockId(), code: input.code ?? 'new-job', name: input.name, group: input.group ?? 'DEFAULT',
    invokeTarget: input.invokeTarget, jobParams: input.jobParams ?? null, cron: input.cron,
    concurrent: input.concurrent ?? false, enabled: input.enabled ?? true, remark: input.remark ?? null,
    lastStatus: null, lastRunAt: null,
  }
  mockJobs?.push(job)
  return clone(job)
}

export function updateMockJob(id: string, input: NativeJobWriteInput): NativeJob {
  createMockJobs()
  const index = mockJobs?.findIndex((job) => job.id === id) ?? -1
  const current = index >= 0 && mockJobs ? mockJobs[index] : {
    id, code: input.code ?? 'job', name: input.name, group: input.group ?? 'DEFAULT',
    invokeTarget: input.invokeTarget, jobParams: input.jobParams ?? null, cron: input.cron,
    concurrent: input.concurrent ?? false, enabled: input.enabled ?? true, remark: input.remark ?? null,
    lastStatus: null, lastRunAt: null,
  }
  const job: NativeJob = {
    ...current, name: input.name, group: input.group ?? current.group, invokeTarget: input.invokeTarget,
    jobParams: input.jobParams ?? null, cron: input.cron, concurrent: input.concurrent ?? current.concurrent,
    enabled: input.enabled ?? current.enabled, remark: input.remark ?? null,
  }
  if (mockJobs && index >= 0) mockJobs[index] = job
  else mockJobs?.push(job)
  return clone(job)
}

export function updateMockJobStatus(id: string, enabled: boolean): NativeJob {
  const jobs = createMockJobs()
  const index = jobs.findIndex((job) => job.id === id)
  if (index < 0) return createMockJob({ code: id, name: '任务', group: 'DEFAULT', invokeTarget: 'keystoneJob.heartbeat()', cron: '0/30 * * * * ?', enabled })
  const current = jobs[index]
  const job = { ...current, enabled }
  if (mockJobs) mockJobs[index] = job
  return clone(job)
}

export function triggerMockJob(id: string): NativeJobTriggerResult {
  createMockJobs()
  const index = mockJobs?.findIndex((job) => job.id === id) ?? -1
  if (mockJobs && index >= 0) mockJobs[index] = { ...mockJobs[index], lastStatus: 'SUCCESS', lastRunAt: new Date().toISOString() }
  return { triggered: true }
}

export function createMockRoles(): NativeRole[] {
  return [
    {
      id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
      code: 'admin',
      name: '系统管理员',
      enabled: true,
      dataScope: 'ALL',
      deptScope: '全部组织',
      permissions: ['user:read', 'role:read', 'department:read'],
    },
    {
      id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a',
      code: 'auditor',
      name: '审计员',
      enabled: true,
      dataScope: 'DEPARTMENT',
      deptScope: '审计部',
      permissions: ['audit:read', 'login-log:read'],
    },
  ]
}

export function createMockDepartments(): NativeDepartment[] {
  return [
    { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'HQ', name: '总部', sortOrder: 1, enabled: true },
    { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'OPS', name: '运营部', sortOrder: 1, enabled: true },
    { id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', parentId: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'AUDIT', name: '审计部', sortOrder: 2, enabled: true },
  ]
}

export function createMockPosts(): NativePost[] {
  mockPosts ??= [
    { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'operator', name: '运营专员', sortOrder: 1, enabled: true },
    { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'auditor', name: '审计专员', sortOrder: 2, enabled: true },
  ]
  return mockPosts.map(clone)
}

export function createMockPost(input: NativePostWriteInput): NativePost {
  createMockPosts()
  const post: NativePost = { id: nextMockId(), code: input.code ?? 'new-post', name: input.name, sortOrder: input.sortOrder ?? 0, enabled: input.enabled ?? true }
  mockPosts?.push(post)
  return clone(post)
}

export function updateMockPost(id: string, input: NativePostWriteInput): NativePost {
  const posts = createMockPosts()
  const index = posts.findIndex((post) => post.id === id)
  const current = index >= 0 ? posts[index] : { id, code: input.code ?? 'post', name: input.name, sortOrder: 0, enabled: true }
  const post: NativePost = { ...current, name: input.name, sortOrder: input.sortOrder ?? current.sortOrder, enabled: input.enabled ?? current.enabled }
  if (mockPosts && index >= 0) mockPosts[index] = post
  return clone(post)
}

export function deleteMockPost(id: string): { deleted: boolean } {
  createMockPosts()
  const before = mockPosts?.length ?? 0
  mockPosts = mockPosts?.filter((post) => post.id !== id) ?? []
  return { deleted: before !== mockPosts.length }
}

export function createMockMenus(): NativeMenuNode[] {
  return [{
    menu: {
      id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理',
      path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true,
    },
    children: [{
      menu: {
        id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'system:user', name: '用户管理',
        path: '/users', component: 'UsersPage', menuType: 'MENU', permission: 'user:read', sortOrder: 1, enabled: true,
      },
      children: [],
    }],
  }]
}

export function createMockApiKeys(): NativeApiKey[] {
  return [{
    id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', name: '本地开发客户端', prefix: 'dev_7x2m',
    scopes: ['user:read', 'monitor:read'], expiresAt: null, revokedAt: null,
    lastUsedAt: new Date().toISOString(), createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  }]
}

export function createMockSystemConfigs(): NativeSystemConfig[] {
  mockSystemConfigs ??= [{
    id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', key: 'security.session.ttl', value: '300',
    description: '访问令牌有效期（秒）', enabled: true, updatedAt: new Date().toISOString(),
  }]
  return mockSystemConfigs.map(clone)
}

export function createMockSystemConfig(input: NativeSystemConfigWriteInput): NativeSystemConfig {
  createMockSystemConfigs()
  const config: NativeSystemConfig = { id: nextMockId(), key: input.key ?? 'new.config', value: input.value, description: input.description ?? null, enabled: input.enabled ?? true, updatedAt: new Date().toISOString() }
  mockSystemConfigs?.push(config)
  return clone(config)
}

export function updateMockSystemConfig(key: string, input: NativeSystemConfigWriteInput): NativeSystemConfig {
  createMockSystemConfigs()
  const index = mockSystemConfigs?.findIndex((config) => config.key === key) ?? -1
  const current = index >= 0 && mockSystemConfigs ? mockSystemConfigs[index] : { id: nextMockId(), key }
  const config: NativeSystemConfig = { ...current, key, value: input.value, description: input.description ?? null, enabled: input.enabled ?? true, updatedAt: new Date().toISOString() }
  if (mockSystemConfigs && index >= 0) mockSystemConfigs[index] = config
  else mockSystemConfigs?.push(config)
  return clone(config)
}

export function createMockDictionaryTypes(): NativeDictionaryType[] {
  mockDictionaryTypes ??= [
    { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'notice_type', name: '公告类型', enabled: true },
    { id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: 'user_status', name: '用户状态', enabled: true },
  ]
  return mockDictionaryTypes.map(clone)
}

export function createMockDictionaryType(input: NativeDictionaryTypeWriteInput): NativeDictionaryType {
  createMockDictionaryTypes()
  const type: NativeDictionaryType = { id: nextMockId(), code: input.code ?? 'new_type', name: input.name, enabled: input.enabled ?? true }
  mockDictionaryTypes?.push(type)
  return clone(type)
}

export function updateMockDictionaryType(code: string, input: NativeDictionaryTypeWriteInput): NativeDictionaryType {
  createMockDictionaryTypes()
  const index = mockDictionaryTypes?.findIndex((type) => type.code === code) ?? -1
  const current = index >= 0 && mockDictionaryTypes ? mockDictionaryTypes[index] : { id: nextMockId(), code }
  const type: NativeDictionaryType = { ...current, code, name: input.name, enabled: input.enabled ?? true }
  if (mockDictionaryTypes && index >= 0) mockDictionaryTypes[index] = type
  else mockDictionaryTypes?.push(type)
  return clone(type)
}

export function createMockDictionaryItems(typeCode: string): NativeDictionaryItem[] {
  if (!mockDictionaryItems.has(typeCode)) {
    mockDictionaryItems.set(typeCode, typeCode === 'user_status' ? [
      { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', typeCode, value: 'enabled', label: '启用', sortOrder: 1, enabled: true },
      { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', typeCode, value: 'disabled', label: '停用', sortOrder: 2, enabled: true },
    ] : [{ id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', typeCode, value: 'announcement', label: '通知', sortOrder: 1, enabled: true }])
  }
  return (mockDictionaryItems.get(typeCode) ?? []).map(clone)
}

export function createMockDictionaryItem(typeCode: string, input: NativeDictionaryItemWriteInput): NativeDictionaryItem {
  createMockDictionaryItems(typeCode)
  const item: NativeDictionaryItem = { id: nextMockId(), typeCode, value: input.value ?? 'new_value', label: input.label, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true }
  mockDictionaryItems.get(typeCode)?.push(item)
  return clone(item)
}

export function updateMockDictionaryItem(id: string, input: NativeDictionaryItemWriteInput): NativeDictionaryItem {
  for (const items of mockDictionaryItems.values()) {
    const index = items.findIndex((item) => item.id === id)
    if (index >= 0) {
      const current = items[index]
      const item: NativeDictionaryItem = { ...current, label: input.label, sortOrder: input.sortOrder ?? current.sortOrder, enabled: input.enabled ?? current.enabled }
      items[index] = item
      return clone(item)
    }
  }
  const item: NativeDictionaryItem = { id, typeCode: 'custom', value: input.value ?? 'value', label: input.label, sortOrder: input.sortOrder ?? 1, enabled: input.enabled ?? true }
  return clone(item)
}

export function createMockNotices(): NativeNotice[] {
  mockNotices ??= [{
    id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', title: '平台维护通知', content: '开发环境示例公告', noticeType: 'announcement',
    published: true, enabled: true, publishAt: new Date().toISOString(), createdBy: 'operator', createdAt: new Date().toISOString(),
  }]
  return mockNotices.map(clone)
}

export function createMockNotice(input: NativeNoticeWriteInput): NativeNotice {
  createMockNotices()
  const notice: NativeNotice = { id: nextMockId(), title: input.title, content: input.content, noticeType: input.noticeType, published: false, enabled: input.enabled ?? true, publishAt: null, createdBy: 'operator', createdAt: new Date().toISOString() }
  mockNotices?.push(notice)
  return clone(notice)
}

export function updateMockNotice(id: string, input: NativeNoticeWriteInput): NativeNotice {
  createMockNotices()
  const index = mockNotices?.findIndex((notice) => notice.id === id) ?? -1
  const current = index >= 0 && mockNotices ? mockNotices[index] : { id, published: false, publishAt: null, createdBy: 'operator', createdAt: new Date().toISOString() }
  const notice: NativeNotice = { ...current, title: input.title, content: input.content, noticeType: input.noticeType, enabled: input.enabled ?? true }
  if (mockNotices && index >= 0) mockNotices[index] = notice
  else mockNotices?.push(notice)
  return clone(notice)
}

export function publishMockNotice(id: string, published: boolean): NativeNotice {
  createMockNotices()
  const index = mockNotices?.findIndex((notice) => notice.id === id) ?? -1
  const current = index >= 0 && mockNotices ? mockNotices[index] : { id, title: '公告', content: '', noticeType: 'announcement', enabled: true, createdBy: 'operator', createdAt: new Date().toISOString() }
  const notice: NativeNotice = { ...current, published, publishAt: published ? new Date().toISOString() : null }
  if (mockNotices && index >= 0) mockNotices[index] = notice
  else mockNotices?.push(notice)
  return clone(notice)
}
