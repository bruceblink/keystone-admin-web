import type { MonitorSnapshot } from '../../entities/monitor/types'
import type { NativeOperationLogsPage, NativeUsersPage, User } from './schemas'

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
