import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { NativeCapabilities, NativeRole, NativeUsersPage } from '../../shared/api/schemas'
import { apiClient } from '../../shared/api/client'
import { useSessionStore } from '../../shared/state/session'
import { UsersPage } from './UsersPage'

// 页面交互测试共用的用户数据，避免各测试重复实现接口结构。
export const userPage: NativeUsersPage = {
  items: [{
    id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
    username: 'operator',
    displayName: '平台运维员',
    deptId: 'dept-operations',
    postId: 'post-owner',
    enabled: true,
    email: null,
    phoneNumber: null,
    sex: null,
    avatar: null,
    loginIp: null,
    loginAt: null,
    remark: null,
    roles: ['系统管理员'],
  }],
  page: 1,
  size: 20,
  total: 21,
}

export const roleCatalog: NativeRole[] = [
  {
    id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
    code: '系统管理员',
    name: '系统管理员',
    enabled: true,
    dataScope: 'ALL',
    deptScope: null,
    permissions: ['user:read'],
  },
  {
    id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a',
    code: 'auditor',
    name: '审计员',
    enabled: true,
    dataScope: 'ALL',
    deptScope: null,
    permissions: ['audit:read'],
  },
]

export const allUserCapabilities: NativeCapabilities = {
  permissions: ['user:read', 'user:create', 'user:update', 'user:delete', 'user:import', 'user:export', 'role:read', 'role:assign'],
  resources: {
    user: true, department: true, role: true, post: true, menu: true, config: true,
    dictionary: true, notice: true, job: true, audit: true, session: true,
    'api-key': true, profile: true,
  },
}

export function mockRoleCatalog() {
  return vi.spyOn(apiClient, 'listRoles').mockResolvedValue(roleCatalog)
}

export function renderUsersPage(capabilities = allUserCapabilities, authRevision = 1, existingQueryClient?: QueryClient) {
  useSessionStore.setState({
    user: { id: 'users-test-user', username: 'users-test-operator', displayName: '用户测试管理员', role: 'admin' },
    isHydrated: true,
    authRevision,
  })
  const queryClient = existingQueryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<BrowserRouter><QueryClientProvider client={queryClient}><UsersPage capabilities={capabilities} /></QueryClientProvider></BrowserRouter>)
  return { ...view, queryClient }
}
