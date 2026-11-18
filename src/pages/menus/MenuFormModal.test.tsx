import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
]

function props(roleCodes: string[], rolesLoading = false) {
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
    onRetryRoles: vi.fn(),
    onRetryMenuRoles: vi.fn(),
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
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
})
