import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenusPage } from './MenusPage'
import { apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MenusPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('MenusPage', () => {
  it('显示菜单树和权限标识', async () => {
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{
      menu: { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true },
      children: [{
        menu: { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'system:user', name: '用户管理', path: '/users', component: 'UsersPage', menuType: 'MENU', permission: 'user:read', sortOrder: 1, enabled: true },
        children: [],
      }],
    }])
    renderPage()
    expect(await screen.findByText('系统管理')).toBeInTheDocument()
    expect(screen.getByText('用户管理')).toBeInTheDocument()
    expect(screen.getByText('user:read')).toBeInTheDocument()
  })

  it('确认后删除菜单', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    const deleteMenu = vi.spyOn(apiClient, 'deleteMenu').mockResolvedValue({ deleted: true })
    renderPage()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('删除后不可恢复')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteMenu).toHaveBeenCalledWith(menu.id))
  })

  it('按三级层级顺序展示父级，并在编辑时排除当前节点及后代', async () => {
    const root = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true } as const
    const child = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: root.id, code: 'system:user', name: '用户管理', path: '/users', component: 'UsersPage', menuType: 'MENU', permission: 'user:read', sortOrder: 1, enabled: true } as const
    const grandchild = { id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', parentId: child.id, code: 'system:user:detail', name: '用户详情', path: '/users/detail', component: 'UserDetailPage', menuType: 'MENU', permission: 'user:detail', sortOrder: 1, enabled: true } as const
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu: root, children: [{ menu: child, children: [{ menu: grandchild, children: [] }] }] }])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    vi.spyOn(apiClient, 'listRolesForMenu').mockResolvedValue({ roleCodes: [] })
    renderPage()

    expect(await screen.findByText('用户详情')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新增菜单' }))
    const createDialog = screen.getByRole('dialog')
    const parentSelect = within(createDialog).getByLabelText('上级菜单')
    expect(Array.from(parentSelect.querySelectorAll('option')).map((option) => option.textContent)).toEqual(['根菜单', '系统管理', '　用户管理', '　　用户详情'])
    fireEvent.click(within(createDialog).getByRole('button', { name: '取消' }))

    const editButtons = screen.getAllByRole('button', { name: '编辑' })
    fireEvent.click(editButtons[1]!)
    const editDialog = await screen.findByRole('dialog')
    const editParentSelect = within(editDialog).getByLabelText('上级菜单')
    expect(Array.from(editParentSelect.querySelectorAll('option')).map((option) => option.textContent)).toEqual(['根菜单', '系统管理'])
  })
})
