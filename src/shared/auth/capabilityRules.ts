import type { NativeCapabilities } from '../api/schemas'

type CapabilityPage = {
  path: string
  title: string
  permission: string
  resource: keyof NativeCapabilities['resources']
}

const monitorReadPermissions = ['server:read', 'cache:refresh', 'online-session:read'] as const

// 默认入口顺序与侧栏顺序一致；该列表只包含 React 内部页面。
export const capabilityPages: CapabilityPage[] = [
  { path: '/monitor', title: '运行监控', permission: 'session:read', resource: 'session' },
  { path: '/users', title: '用户与权限', permission: 'user:read', resource: 'user' },
  { path: '/roles', title: '角色管理', permission: 'role:read', resource: 'role' },
  { path: '/departments', title: '组织结构', permission: 'department:read', resource: 'department' },
  { path: '/posts', title: '岗位管理', permission: 'post:read', resource: 'post' },
  { path: '/menus', title: '菜单与权限', permission: 'menu:read', resource: 'menu' },
  { path: '/api-keys', title: 'API Key', permission: 'api-key:read', resource: 'api-key' },
  { path: '/audit/operations', title: '操作审计', permission: 'operation-log:read', resource: 'audit' },
  { path: '/audit/login', title: '登录日志', permission: 'login-log:read', resource: 'audit' },
  { path: '/jobs', title: '定时任务', permission: 'job:read', resource: 'job' },
  { path: '/configs', title: '系统配置', permission: 'config:read', resource: 'config' },
  { path: '/dictionaries', title: '字典管理', permission: 'dictionary:read', resource: 'dictionary' },
  { path: '/notices', title: '通知公告', permission: 'notice:read', resource: 'notice' },
  { path: '/profile', title: '个人资料', permission: 'user:read', resource: 'profile' },
]

/** 页面必须同时具备具体读取权限和对应资源范围。 */
export function canAccessCapabilityPage(path: string, capabilities: NativeCapabilities): boolean {
  if (path === '/monitor' || path === '/dashboard') {
    return capabilities.resources.session && monitorReadPermissions.some((permission) => capabilities.permissions.includes(permission))
  }
  const rule = capabilityPages.find((page) => page.path === path)
  return Boolean(rule && capabilities.resources[rule.resource] && capabilities.permissions.includes(rule.permission))
}

/** 监控子资源使用独立权限，并共享会话数据范围。 */
export function canReadMonitorResource(permission: typeof monitorReadPermissions[number], capabilities: NativeCapabilities): boolean {
  return capabilities.resources.session && capabilities.permissions.includes(permission)
}

/** 登录后默认进入第一个可访问的 React 页面；外部 Swagger 链接不参与路由落点。 */
export function firstAccessibleCapabilityPage(capabilities: NativeCapabilities): CapabilityPage | null {
  return capabilityPages.find((page) => canAccessCapabilityPage(page.path, capabilities)) ?? null
}
