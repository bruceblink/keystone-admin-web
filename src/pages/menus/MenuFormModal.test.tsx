import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MenuFormModal } from './MenuFormModal'

const menu = {
  id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce',
  parentId: null,
  code: 'system',
  name: '系统管理',
  path: '/system',
  component: 'SystemLayout',
  menuType: 'MENU',
  permission: null,
  sortOrder: 1,
  enabled: true,
}

const roles = [
  { id: menu.id, code: 'admin', name: '系统管理员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
  { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
  { id: '00000000-0000-4000-8000-000000000001', code: 'disabled', name: '停用角色', enabled: false, dataScope: 'ALL', deptScope: null, permissions: [] },
]

function props(roleCodes: string[], rolesLoading = false, overrides: Partial<ComponentProps<typeof MenuFormModal>> = {}) {
  return {
    open: true,
    mode: 'edit' as const,
    menu,
    menus: [menu],
    pending: false,
    error: null,
    roles,
    roleCodes,
    rolesLoading,
    rolesError: null,
    menuRolesError: null,
    canSave: true,
    canManageMetadata: true,
    canManageRoles: true,
    bindingRetryOnly: false,
    partialSaveNotice: null,
    onRetryRoles: vi.fn(),
    onRetryMenuRoles: vi.fn(),
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('MenuFormModal', () => {
  it('后台重新读取角色绑定时保留用户已改选的草稿', async () => {
    // 模拟角色绑定首次加载、用户改选，再经历一次后台重新读取。
    const view = render(<MenuFormModal {...props(['admin'])} />)
    const admin = await screen.findByRole('checkbox', { name: /系统管理员/ })
    const auditor = screen.getByRole('checkbox', { name: /审计员/ })
    await waitFor(() => expect(admin).toBeChecked())

    fireEvent.click(admin)
    fireEvent.click(auditor)
    expect(admin).not.toBeChecked()
    expect(auditor).toBeChecked()

    view.rerender(<MenuFormModal {...props(['admin'], true)} />)
    view.rerender(<MenuFormModal {...props(['admin'])} />)

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /系统管理员/ })).not.toBeChecked()
      expect(screen.getByRole('checkbox', { name: /审计员/ })).toBeChecked()
    })
  })

  it('没有菜单管理权限时保留权限字段且提交不含权限或角色绑定', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MenuFormModal {...props([], false, {
      menu: { ...menu, permission: 'user:read' },
      canManageMetadata: false,
      canManageRoles: false,
      onSubmit,
    })} />)

    expect(screen.getByLabelText(/权限标识/)).toHaveValue('user:read')
    expect(screen.getByLabelText(/权限标识/)).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('角色绑定保持不变')
    fireEvent.change(screen.getByLabelText('菜单名称'), { target: { value: '系统设置' } })
    fireEvent.click(screen.getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [input, roleCodes] = onSubmit.mock.calls[0] as [Record<string, unknown>, string[] | null]
    expect(input).not.toHaveProperty('permission')
    expect(roleCodes).toBeNull()
  })

  it('缺少 role:read 时显示说明且不要求空角色列表', () => {
    render(<MenuFormModal {...props([], false, { canManageRoles: false })} />)

    expect(screen.getByRole('status')).toHaveTextContent('需要 role:read 权限和角色数据范围')
    expect(screen.queryByRole('checkbox', { name: /系统管理员/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存菜单' })).toBeEnabled()
  })

  it('保存菜单资料时不重写未改变的停用角色绑定', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MenuFormModal {...props(['disabled'], false, { onSubmit })} />)

    const disabledRole = await screen.findByRole('checkbox', { name: /停用角色/ })
    expect(disabledRole).toBeChecked()
    expect(screen.getByText('已停用')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('保持勾选可保留绑定，取消勾选可移除')
    fireEvent.change(screen.getByLabelText('菜单名称'), { target: { value: '系统设置' } })
    fireEvent.click(screen.getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[1]).toBeNull()
  })

  it('允许保留已有停用角色并新增启用角色绑定', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MenuFormModal {...props(['disabled'], false, { onSubmit })} />)

    const administrator = await screen.findByRole('checkbox', { name: /系统管理员/ })
    const disabledRole = screen.getByRole('checkbox', { name: /停用角色/ })
    fireEvent.click(administrator)

    expect(administrator).toBeChecked()
    expect(disabledRole).toBeChecked()
    expect(screen.getByRole('button', { name: '保存菜单' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[1]).toEqual(['disabled', 'admin'])
  })

  it('允许明确移除已有停用角色绑定', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MenuFormModal {...props(['disabled'], false, { onSubmit })} />)

    const administrator = await screen.findByRole('checkbox', { name: /系统管理员/ })
    const disabledRole = screen.getByRole('checkbox', { name: /停用角色/ })
    fireEvent.click(disabledRole)
    fireEvent.click(administrator)
    fireEvent.click(screen.getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[1]).toEqual(['admin'])
  })

  it('绑定角色不在目录中时阻止替换以免覆盖未知绑定', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MenuFormModal {...props(['retired'], false, { onSubmit })} />)

    const administrator = await screen.findByRole('checkbox', { name: /系统管理员/ })
    fireEvent.click(administrator)

    expect(await screen.findByRole('alert')).toHaveTextContent('角色目录未返回的角色')
    expect(screen.getByRole('button', { name: '保存菜单' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存菜单' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
