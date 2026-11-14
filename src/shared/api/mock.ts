import type { MonitorSnapshot } from '../../entities/monitor/types'
import type { NativeApiKey, NativeDepartment, NativeDictionaryItem, NativeDictionaryItemWriteInput, NativeDictionaryType, NativeDictionaryTypeWriteInput, NativeJob, NativeLoginLogsPage, NativeMenuNode, NativeNotice, NativeNoticeWriteInput, NativeOperationLogsPage, NativeRole, NativeSystemConfig, NativeSystemConfigWriteInput, NativeUsersPage, User } from './schemas'

export const mockUser: User = {
  id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
  username: 'operator',
  displayName: '平台运维员',
  role: '系统管理员',
}

const users = [
  { id: '7c8d', user: 'lin.chen', role: '运维管理员', ip: '10.17.17.42', currentPage: '运行监控' },
  { id: '8f10', user: 'rui.zhang', role: '审计员', ip: '10.17.17.58', currentPage: '操作日志' },
  { id: 'a123', user: 'miao.wu', role: '业务管理员', ip: '10.17.17.64', currentPage: '用户管理' },
]

let mockSequence = 1000
let mockSystemConfigs: NativeSystemConfig[] | null = null
let mockDictionaryTypes: NativeDictionaryType[] | null = null
let mockNotices: NativeNotice[] | null = null
const mockDictionaryItems = new Map<string, NativeDictionaryItem[]>()

function nextMockId(): string {
  const suffix = (mockSequence++).toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${suffix}`
}

function clone<T extends object>(value: T): T {
  return { ...value }
}

export function createMockMonitorSnapshot(): MonitorSnapshot {
  const now = Date.now()
  const trend = Array.from({ length: 18 }, (_, index) => {
    const stamp = new Date(now - (17 - index) * 60_000).toISOString()
    return {
      timestamp: stamp,
      cpu: 34 + Math.sin(index / 2.5) * 8 + (index % 5),
      memory: 49 + Math.cos(index / 3.2) * 5 + (index % 3),
    }
  })

  return {
    status: 'LIVE',
    capturedAt: new Date(now).toISOString(),
    source: '开发环境 Mock 快照',
    node: 'keystone@127.0.0.1',
    cpu: Math.round(trend.at(-1)?.cpu ?? 42),
    memory: Math.round(trend.at(-1)?.memory ?? 54),
    beam: { processes: 481, reductions: 18_430_224, runQueue: 1.4 },
    disk: { used: 68, total: 160 },
    network: { inbound: 620, outbound: 184 },
    ets: { tables: 74, entries: 2_318_500, memory: 286 },
    sessions: users.map((session, index) => ({
      ...session,
      lastSeen: new Date(now - index * 48_000).toISOString(),
    })),
    trend,
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
  return [{
    id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: 'heartbeat', name: '系统心跳', group: 'SYSTEM',
    invokeTarget: 'keystoneJob.heartbeat()', jobParams: '{}', cron: '0/30 * * * * ?', concurrent: false,
    enabled: true, remark: '开发环境示例任务', lastStatus: 'SUCCESS', lastRunAt: new Date().toISOString(),
  }]
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
