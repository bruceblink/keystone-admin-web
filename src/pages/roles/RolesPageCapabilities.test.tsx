import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RolesPage } from './RolesPage'
import { apiClient } from '../../shared/api/client'
import type { NativeCapabilities, NativeRole } from '../../shared/api/schemas'
import { useSessionStore } from '../../shared/state/session'

const testRole: NativeRole = {
  id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
  code: 'auditor',
  name: '审计员',
  enabled: true,
  dataScope: 'ALL',
  deptScope: null,
  permissions: ['user:read'],
}

const resources: NativeCapabilities['resources'] = {
  user: true, department: true, role: true, post: true, menu: true, config: true,
  dictionary: true, notice: true, job: true, audit: true, session: true,
  'api-key': true, profile: true,
}

function renderPage(permissions: string[]) {
  const capabilities: NativeCapabilities = { permissions, resources }
  useSessionStore.setState({ user: { id: 'role-user', username: 'operator', displayName: '角色用户', role: 'operator' }, isHydrated: true, authRevision: 3 })
  vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue(capabilities)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { ...render(<BrowserRouter><QueryClientProvider client={queryClient}><RolesPage /></QueryClientProvider></BrowserRouter>), queryClient }
}

afterEach(() => {
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, authRevision: 0 })
  window.history.replaceState({}, '', '/')
})

describe('RolesPage capabilities', () => {
  it('只按角色读取、新增和更新权限显示操作，资料保存不请求角色权限目录', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([testRole])
    const listPermissionCatalog = vi.spyOn(apiClient, 'listPermissionCatalog')
    const updateRole = vi.spyOn(apiClient, 'updateRole').mockResolvedValue(testRole)
    const createRole = vi.spyOn(apiClient, 'createRole').mockResolvedValue(testRole)
    const updateRolePermissions = vi.spyOn(apiClient, 'updateRolePermissions')
    vi.spyOn(apiClient, 'listRoleMembers').mockResolvedValue([{ id: 'user-1', username: 'alice', displayName: '爱丽丝' }])
    renderPage(['role:read', 'role:create', 'role:update'])

    await screen.findByText('审计员')
    expect(screen.getByRole('button', { name: '新增角色' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导出 Excel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /删除角色/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('选择当前角色')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('status')).toHaveTextContent('现有权限保持不变')
    fireEvent.change(within(dialog).getByLabelText('角色名称 *'), { target: { value: '审计角色' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存角色' }))
    await waitFor(() => expect(updateRole).toHaveBeenCalledWith(testRole.id, expect.objectContaining({ name: '审计角色' })))
    expect(updateRolePermissions).not.toHaveBeenCalled()
    expect(listPermissionCatalog).not.toHaveBeenCalled()

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '成员' }))
    expect(await screen.findAllByText('alice')).toHaveLength(2)
    expect(screen.getByRole('status')).toHaveTextContent('仅可查看成员')
    expect(screen.queryByRole('button', { name: '分配' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消分配' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: '新增角色' }))
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('status')).toHaveTextContent('不会分配额外权限')
    fireEvent.change(within(dialog).getByLabelText('角色标识 *'), { target: { value: 'new-auditor' } })
    fireEvent.change(within(dialog).getByLabelText('角色名称 *'), { target: { value: '新审计员' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存角色' }))
    await waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ code: 'new-auditor', name: '新审计员' })))
    expect(updateRolePermissions).not.toHaveBeenCalled()
    expect(listPermissionCatalog).not.toHaveBeenCalled()
  })

  it('需要 role:read 才读取列表；单独 role:manage 不开放角色页面数据', async () => {
    const listRoles = vi.spyOn(apiClient, 'listRoles')
    renderPage(['role:manage'])

    expect(screen.getByRole('heading', { name: '角色管理' })).toBeInTheDocument()
    expect(listRoles).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '新增角色' })).not.toBeInTheDocument()
  })

  it('有 role:read 和 role:manage 但无 role:update 时提供独立权限编辑', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([testRole])
    vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([
      { permission: 'user:read', resource: 'user', action: 'read', description: '读取用户', risk: 'low', registered: true, allowed: true },
      { permission: 'role:update', resource: 'role', action: 'update', description: '修改角色', risk: 'medium', registered: true, allowed: true },
    ])
    const updateRole = vi.spyOn(apiClient, 'updateRole')
    const updatePermissions = vi.spyOn(apiClient, 'updateRolePermissions').mockResolvedValue({ updated: true })
    renderPage(['role:read', 'role:manage'])

    await screen.findByText('审计员')
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '权限' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '编辑角色权限' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('角色名称 *')).not.toBeInTheDocument()
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: /修改.*role:update/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存权限' }))

    await waitFor(() => expect(updatePermissions).toHaveBeenCalledWith(testRole.id, ['role:update', 'user:read']))
    expect(updateRole).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
