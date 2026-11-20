import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../shared/api/client'
import type { NativeCapabilities } from '../../shared/api/schemas'
import { useSessionStore } from '../../shared/state/session'
import { allUserCapabilities, renderUsersPage, userPage } from './UsersPage.testSupport'

afterEach(() => {
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, authRevision: 0 })
  window.history.replaceState({}, '', '/')
})

describe('UsersPage capabilities', () => {
  it.each([
    { label: '没有角色权限', permissions: ['user:read', 'user:create'], roleScope: true },
    { label: '只有角色读取权限', permissions: ['user:read', 'user:create', 'role:read'], roleScope: true },
    { label: '只有角色分配权限', permissions: ['user:read', 'user:create', 'role:assign'], roleScope: true },
    { label: '没有角色数据范围', permissions: ['user:read', 'user:create', 'role:read', 'role:assign'], roleScope: false },
  ])('$label时不读取角色目录，并创建无角色账号', async ({ permissions, roleScope }) => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const listRoles = vi.spyOn(apiClient, 'listRoles')
    const createUser = vi.spyOn(apiClient, 'createUser').mockResolvedValue(userPage.items[0])
    const capabilities: NativeCapabilities = {
      ...allUserCapabilities,
      permissions,
      resources: { ...allUserCapabilities.resources, role: roleScope },
    }
    renderUsersPage(capabilities)

    await screen.findByText('平台运维员')
    expect(screen.queryByRole('button', { name: /导入 Excel/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /导出 Excel/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /删除用户/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /选择用户/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /新增用户/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('status')).toHaveTextContent('新用户将以未分配角色状态创建')
    expect(listRoles).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('用户名 *'), { target: { value: 'unassigned-user' } })
    fireEvent.change(within(dialog).getByLabelText('初始密码 *'), { target: { value: 'Strong-password-123!' } })
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '无角色用户' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'unassigned-user', roleCodes: [] })))
    expect(listRoles).not.toHaveBeenCalled()
  })

  it('只有用户读取和更新权限时隐藏其他操作并保留现有角色', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const listRoles = vi.spyOn(apiClient, 'listRoles')
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    const capabilities: NativeCapabilities = {
      ...allUserCapabilities,
      permissions: ['user:read', 'user:update'],
    }
    renderUsersPage(capabilities)

    await screen.findByText('平台运维员')
    expect(screen.queryByRole('button', { name: /新增用户/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /导入 Excel/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /导出 Excel/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /删除用户/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /选择用户/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('status')).toHaveTextContent('保存资料时会保留原角色')
    expect(listRoles).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '仅更新资料' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ displayName: '仅更新资料', roleCodes: null })))
    expect(listRoles).not.toHaveBeenCalled()
  })

  it('允许移除已有停用角色，再修改启用角色', async () => {
    const disabledRoleCode = 'legacy-disabled'
    const assignedUser = {
      ...userPage,
      items: [{ ...userPage.items[0], roles: [disabledRoleCode] }],
      total: 1,
    }
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(assignedUser)
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([
      { id: 'disabled-role-id', code: disabledRoleCode, name: '历史角色', enabled: false, dataScope: 'ALL', deptScope: null, permissions: [] },
      { id: 'active-role-id', code: 'active-role', name: '启用角色', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
    ])
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(assignedUser.items[0])
    renderUsersPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = screen.getByRole('dialog')
    const disabledRole = await within(dialog).findByRole('checkbox', { name: /legacy-disabled（停用）/ })
    const activeRole = within(dialog).getByRole('checkbox', { name: /active-role/ })

    expect(disabledRole).toBeChecked()
    expect(disabledRole).toBeEnabled()
    expect(activeRole).toBeDisabled()
    expect(within(dialog).getByText(/停用角色不能新增分配/)).toBeInTheDocument()

    fireEvent.click(disabledRole)
    expect(activeRole).toBeEnabled()
    fireEvent.click(activeRole)
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(assignedUser.items[0].id, expect.objectContaining({ roleCodes: ['active-role'] })))
  })
})
