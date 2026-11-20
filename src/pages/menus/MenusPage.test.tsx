import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenusPage } from './MenusPage'
import { ApiError, apiClient } from '../../shared/api/client'
import type { NativeCapabilities } from '../../shared/api/schemas'
import { useSessionStore } from '../../shared/state/session'

const allMenuCapabilities: NativeCapabilities = {
  permissions: ['menu:read', 'menu:create', 'menu:update', 'menu:delete', 'menu:manage', 'role:read'],
  resources: {
    user: true, department: true, role: true, post: true, menu: true, config: true,
    dictionary: true, notice: true, job: true, audit: true, session: true,
    'api-key': true, profile: true,
  },
}

function renderPage(permissions = allMenuCapabilities.permissions, menuScope = true, roleScope = true) {
  useSessionStore.setState({ user: { id: 'menu-user', username: 'menu-operator', displayName: '菜单管理员', role: 'operator' }, isHydrated: true, authRevision: 7 })
  vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue({
    ...allMenuCapabilities,
    permissions,
    resources: { ...allMenuCapabilities.resources, menu: menuScope, role: roleScope },
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<BrowserRouter><QueryClientProvider client={queryClient}><MenusPage /></QueryClientProvider></BrowserRouter>)
}

afterEach(() => {
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, authRevision: 0 })
  window.history.replaceState({}, '', '/')
})

describe('MenusPage', () => {
  it('从 URL 恢复菜单筛选条件并同步查询和重置参数', async () => {
    window.history.replaceState({}, '', '/menus?menus_keyword=system')
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    renderPage()

    expect(await screen.findByLabelText('菜单名称、编码或权限')).toHaveValue('system')
    fireEvent.change(screen.getByLabelText('菜单名称、编码或权限'), { target: { value: 'admin' } })
    fireEvent.submit(screen.getByRole('button', { name: '查询' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(window.location.search).toContain('menus_keyword=admin'))

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    await waitFor(() => expect(window.location.search).not.toContain('menus_keyword='))
    expect(screen.getByLabelText('菜单名称、编码或权限')).toHaveValue('')
  })

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

  it('令牌刷新后重新读取菜单，避免继续显示旧授权下的目录', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    const listMenus = vi.spyOn(apiClient, 'listMenus').mockResolvedValueOnce([{ menu, children: [] }]).mockResolvedValueOnce([])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    renderPage()

    await screen.findByText('系统管理')
    // authRevision 变化代表令牌更新；菜单查询必须随新授权重新执行。
    act(() => useSessionStore.setState({ authRevision: 8 }))

    await waitFor(() => expect(listMenus).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('系统管理')).not.toBeInTheDocument())
  })

  it('认证版本变化时关闭旧编辑并在重新打开后读取新角色绑定', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([
      { id: 'role-admin', code: 'admin', name: '系统管理员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
      { id: 'role-auditor', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
    ])
    const listRolesForMenu = vi.spyOn(apiClient, 'listRolesForMenu').mockResolvedValueOnce({ roleCodes: ['admin'] }).mockResolvedValueOnce({ roleCodes: ['auditor'] })
    const updateMenu = vi.spyOn(apiClient, 'updateMenu').mockResolvedValue({ ...menu, name: '系统平台' })
    const assignMenuRoles = vi.spyOn(apiClient, 'assignMenuRoles')
    renderPage()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog')
    const adminRole = await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    const auditorRole = within(dialog).getByRole('checkbox', { name: /审计员/ })
    await waitFor(() => expect(adminRole).toBeChecked())
    fireEvent.click(auditorRole)
    expect(auditorRole).toBeChecked()

    act(() => useSessionStore.setState({ authRevision: 8 }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateMenu).not.toHaveBeenCalled()
    expect(assignMenuRoles).not.toHaveBeenCalled()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const refreshedDialog = await screen.findByRole('dialog')
    await waitFor(() => expect(listRolesForMenu).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(refreshedDialog).getByRole('checkbox', { name: /系统管理员/ })).not.toBeChecked())
    expect(within(refreshedDialog).getByRole('checkbox', { name: /审计员/ })).toBeChecked()

    fireEvent.change(within(refreshedDialog).getByLabelText('菜单名称'), { target: { value: '系统平台' } })
    fireEvent.click(within(refreshedDialog).getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(updateMenu).toHaveBeenCalledTimes(1))
    expect(assignMenuRoles).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('资料已更新；角色绑定保持不变')
  })

  it('刷新失败时保留菜单树并显示错误码，重试成功后清除反馈', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    const listMenus = vi.spyOn(apiClient, 'listMenus').mockResolvedValueOnce([{ menu, children: [] }]).mockRejectedValueOnce(new ApiError('服务暂不可用', 503, 'service_unavailable')).mockResolvedValueOnce([{ menu, children: [] }])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    renderPage()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '刷新菜单' }))
    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(screen.getByText('诊断：service_unavailable · 服务暂不可用')).toBeInTheDocument()
    expect(screen.getByText('系统管理')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(listMenus).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByText('数据刷新失败')).not.toBeInTheDocument())
    expect(screen.getByText('系统管理')).toBeInTheDocument()
  })

  it('需要 menu:read 和菜单数据范围才读取目录或显示写操作', async () => {
    const listMenus = vi.spyOn(apiClient, 'listMenus')
    renderPage(['menu:create', 'menu:update', 'menu:delete'], false)

    expect(await screen.findByText('当前账号无权读取菜单目录')).toBeInTheDocument()
    expect(listMenus).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '新增菜单' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刷新菜单' })).not.toBeInTheDocument()
  })

  it('缺少 menu:read 时即使有菜单数据范围也不读取目录', async () => {
    const listMenus = vi.spyOn(apiClient, 'listMenus')
    renderPage(['menu:manage', 'menu:create', 'menu:update', 'menu:delete'], true)

    expect(await screen.findByText('当前账号无权读取菜单目录')).toBeInTheDocument()
    expect(listMenus).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '新增菜单' })).not.toBeInTheDocument()
  })

  it('按菜单具体权限分别显示新增、编辑和删除入口', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    renderPage(['menu:read', 'menu:update'], true)

    await screen.findByText('系统管理')
    expect(screen.queryByRole('button', { name: '新增菜单' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '操作' })).toBeInTheDocument()
  })

  it('只有新增和删除权限时不显示编辑入口', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    renderPage(['menu:read', 'menu:create', 'menu:delete'], true)

    await screen.findByText('系统管理')
    expect(screen.getByRole('button', { name: '新增菜单' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
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

  it('没有 menu:manage 时仅保存菜单资料，不读取或写入角色绑定，也不发送权限字段', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: 'user:read', sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    const listRoles = vi.spyOn(apiClient, 'listRoles')
    const listRolesForMenu = vi.spyOn(apiClient, 'listRolesForMenu')
    const assignMenuRoles = vi.spyOn(apiClient, 'assignMenuRoles')
    const updateMenu = vi.spyOn(apiClient, 'updateMenu').mockResolvedValue({ ...menu, name: '系统设置' })
    renderPage(['menu:read', 'menu:update'], true)

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('status')).toHaveTextContent('角色绑定保持不变')
    expect(within(dialog).getByLabelText(/权限标识/)).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('菜单名称'), { target: { value: '系统设置' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(updateMenu).toHaveBeenCalledTimes(1))
    expect(updateMenu.mock.calls[0]?.[1]).not.toHaveProperty('permission')
    expect(listRoles).not.toHaveBeenCalled()
    expect(listRolesForMenu).not.toHaveBeenCalled()
    expect(assignMenuRoles).not.toHaveBeenCalled()
  })

  it('编辑绑定时保留已停用角色，并只允许增加启用角色', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([
      { id: '00000000-0000-4000-8000-000000000002', code: 'admin', name: '系统管理员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
      { id: '00000000-0000-4000-8000-000000000001', code: 'disabled', name: '停用角色', enabled: false, dataScope: 'ALL', deptScope: null, permissions: [] },
    ])
    vi.spyOn(apiClient, 'listRolesForMenu').mockResolvedValue({ roleCodes: ['disabled'] })
    const updateMenu = vi.spyOn(apiClient, 'updateMenu').mockResolvedValue({ ...menu, name: '系统设置' })
    const assignMenuRoles = vi.spyOn(apiClient, 'assignMenuRoles').mockResolvedValue({ updated: true })
    renderPage()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog')
    const disabledRole = await within(dialog).findByRole('checkbox', { name: /停用角色/ })
    expect(disabledRole).toBeChecked()
    expect(within(dialog).getByText('已停用')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /系统管理员/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(updateMenu).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(assignMenuRoles).toHaveBeenCalledWith(menu.id, ['disabled', 'admin']))
  })

  it('只更新菜单资料时跳过绑定替换，保留当前停用角色', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: 'user:read', sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([
      { id: '00000000-0000-4000-8000-000000000001', code: 'disabled', name: '停用角色', enabled: false, dataScope: 'ALL', deptScope: null, permissions: [] },
    ])
    vi.spyOn(apiClient, 'listRolesForMenu').mockResolvedValue({ roleCodes: ['disabled'] })
    const updateMenu = vi.spyOn(apiClient, 'updateMenu').mockResolvedValue({ ...menu, name: '系统设置' })
    const assignMenuRoles = vi.spyOn(apiClient, 'assignMenuRoles')
    renderPage()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/当前绑定包含停用角色/)).toHaveAttribute('role', 'status')
    fireEvent.change(within(dialog).getByLabelText('菜单名称'), { target: { value: '系统设置' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(updateMenu).toHaveBeenCalledTimes(1))
    expect(assignMenuRoles).not.toHaveBeenCalled()
  })

  it('有 menu:manage 但没有 role:read 或角色范围时保存资料且保留原角色绑定', async () => {
    const created = { id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', parentId: null, code: 'audit', name: '审计中心', path: null, component: null, menuType: 'MENU', permission: 'audit:read', sortOrder: 1, enabled: true }
    const listRoles = vi.spyOn(apiClient, 'listRoles')
    const assignMenuRoles = vi.spyOn(apiClient, 'assignMenuRoles')
    const createMenu = vi.spyOn(apiClient, 'createMenu').mockResolvedValue(created)
    renderPage(['menu:read', 'menu:create', 'menu:manage'], true, false)

    fireEvent.click(await screen.findByRole('button', { name: '新增菜单' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('status')).toHaveTextContent('需要 role:read 权限和角色数据范围')
    fireEvent.change(within(dialog).getByLabelText('菜单名称'), { target: { value: created.name } })
    fireEvent.change(within(dialog).getByLabelText('菜单编码'), { target: { value: created.code } })
    fireEvent.change(within(dialog).getByLabelText('权限标识'), { target: { value: created.permission } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(createMenu).toHaveBeenCalledTimes(1))
    expect(createMenu).toHaveBeenCalledWith(expect.objectContaining({ permission: created.permission }))
    expect(listRoles).not.toHaveBeenCalled()
    expect(assignMenuRoles).not.toHaveBeenCalled()
    const notice = await screen.findByText(/已创建；本次没有分配角色/)
    expect(notice.closest('[role="status"]')).toHaveTextContent('未绑定角色的菜单可能不会显示在当前目录中')
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
    await within(createDialog).findByText('暂无启用角色可分配。')
    const parentSelect = within(createDialog).getByLabelText('上级菜单')
    expect(Array.from(parentSelect.querySelectorAll('option')).map((option) => option.textContent)).toEqual(['根菜单', '系统管理', '　用户管理', '　　用户详情'])
    fireEvent.click(within(createDialog).getByRole('button', { name: '取消' }))

    const editButtons = screen.getAllByRole('button', { name: '编辑' })
    fireEvent.click(editButtons[1]!)
    const editDialog = await screen.findByRole('dialog')
    await within(editDialog).findByText('暂无启用角色可分配。')
    const editParentSelect = within(editDialog).getByLabelText('上级菜单')
    expect(Array.from(editParentSelect.querySelectorAll('option')).map((option) => option.textContent)).toEqual(['根菜单', '系统管理'])
  })

  it('筛选三级菜单时保留全部祖先节点', async () => {
    const root = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true } as const
    const child = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: root.id, code: 'system:user', name: '用户管理', path: '/users', component: 'UsersPage', menuType: 'MENU', permission: 'user:read', sortOrder: 1, enabled: true } as const
    const grandchild = { id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', parentId: child.id, code: 'system:user:detail', name: '用户详情', path: '/users/detail', component: 'UserDetailPage', menuType: 'MENU', permission: 'user:detail', sortOrder: 1, enabled: true } as const
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu: root, children: [{ menu: child, children: [{ menu: grandchild, children: [] }] }] }])
    renderPage()

    await screen.findByText('用户详情')
    fireEvent.change(screen.getByLabelText('菜单名称、编码或权限'), { target: { value: 'user:detail' } })
    fireEvent.click(screen.getByRole('button', { name: '查询' }))

    expect(screen.getByText('系统管理')).toBeInTheDocument()
    expect(screen.getByText('用户管理')).toBeInTheDocument()
    expect(screen.getByText('用户详情')).toBeInTheDocument()
    expect(screen.getByText('共 3 个菜单节点')).toBeInTheDocument()
  })

  it('保存菜单后替换角色绑定', async () => {
    const root = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    const created = { ...root, id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', code: 'audit', name: '审计中心' }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu: root, children: [] }])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([
      { id: root.id, code: 'admin', name: '系统管理员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
      { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
      { id: '00000000-0000-4000-8000-000000000001', code: 'disabled', name: '停用角色', enabled: false, dataScope: 'ALL', deptScope: null, permissions: [] },
    ])
    const createMenu = vi.spyOn(apiClient, 'createMenu').mockResolvedValue(created)
    const assignMenuRoles = vi.spyOn(apiClient, 'assignMenuRoles').mockResolvedValue({ updated: true })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '新增菜单' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    expect(within(dialog).queryByRole('checkbox', { name: /停用角色/ })).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('菜单名称'), { target: { value: created.name } })
    fireEvent.change(within(dialog).getByLabelText('菜单编码'), { target: { value: created.code } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /系统管理员/ }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /审计员/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(createMenu).toHaveBeenCalledWith(expect.objectContaining({ code: created.code, name: created.name })))
    await waitFor(() => expect(assignMenuRoles).toHaveBeenCalledWith(created.id, ['admin', 'auditor']))
    expect(await screen.findByText(/已创建，并已完成角色绑定/)).toBeInTheDocument()
  })

  it('角色绑定失败时明确提示部分成功，重试只提交未成功的绑定', async () => {
    const created = { id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', parentId: null, code: 'audit', name: '审计中心', path: null, component: null, menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu: created, children: [] }])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([
      { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'admin', name: '系统管理员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
      { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
    ])
    vi.spyOn(apiClient, 'listRolesForMenu').mockResolvedValue({ roleCodes: [] })
    const createMenu = vi.spyOn(apiClient, 'createMenu').mockResolvedValue(created)
    const updateMenu = vi.spyOn(apiClient, 'updateMenu').mockResolvedValue(created)
    const assignMenuRoles = vi.spyOn(apiClient, 'assignMenuRoles')
      .mockRejectedValueOnce(new ApiError('角色绑定暂不可用', 503, 'service_unavailable'))
      .mockResolvedValue({ updated: true })
    renderPage(['menu:read', 'menu:create', 'menu:manage', 'role:read'])

    fireEvent.click(await screen.findByRole('button', { name: '新增菜单' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    fireEvent.change(within(dialog).getByLabelText('菜单名称'), { target: { value: created.name } })
    fireEvent.change(within(dialog).getByLabelText('菜单编码'), { target: { value: created.code } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /系统管理员/ }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /审计员/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存菜单' }))

    expect(await within(dialog).findByText('菜单保存失败')).toBeInTheDocument()
    expect(await within(dialog).findByRole('status')).toHaveTextContent('资料已保存，但角色绑定失败')
    expect(within(dialog).getByRole('checkbox', { name: /系统管理员/ })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /审计员/ })).toBeChecked()
    expect(within(dialog).getByRole('button', { name: '重试角色绑定' })).toBeEnabled()
    expect(within(dialog).getByLabelText('菜单名称')).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: '重试角色绑定' }))
    expect(createMenu).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(assignMenuRoles).toHaveBeenCalledTimes(2))
    expect(updateMenu).not.toHaveBeenCalled()
    expect(assignMenuRoles).toHaveBeenLastCalledWith(created.id, ['admin', 'auditor'])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('角色目录读取失败时阻止保存并允许重试', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    const listRoles = vi.spyOn(apiClient, 'listRoles').mockRejectedValueOnce(new ApiError('角色目录不可用', 503, 'service_unavailable', null, { requestId: 'roles-1' })).mockResolvedValueOnce([
      { id: menu.id, code: 'admin', name: '系统管理员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
    ])
    const createMenu = vi.spyOn(apiClient, 'createMenu')
    renderPage()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '新增菜单' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('角色目录读取失败')).toBeInTheDocument()
    expect(within(dialog).getByText(/service_unavailable · 服务暂不可用/)).toBeInTheDocument()
    expect(within(dialog).getByText(/requestId=roles-1/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '保存菜单' })).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('button', { name: '重试角色目录' }))
    expect(await within(dialog).findByRole('checkbox', { name: /系统管理员/ })).toBeInTheDocument()
    expect(listRoles).toHaveBeenCalledTimes(2)
    expect(within(dialog).getByRole('button', { name: '保存菜单' })).not.toBeDisabled()
    expect(createMenu).not.toHaveBeenCalled()
  })

  it('菜单角色绑定读取失败时阻止保存并允许重试', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([
      { id: menu.id, code: 'admin', name: '系统管理员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] },
    ])
    const listRolesForMenu = vi.spyOn(apiClient, 'listRolesForMenu').mockRejectedValueOnce(new ApiError('绑定读取超时', 503, 'service_unavailable', null, { requestId: 'menu-roles-1' })).mockResolvedValueOnce({ roleCodes: ['admin'] })
    renderPage()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('菜单角色绑定读取失败')).toBeInTheDocument()
    expect(within(dialog).getByText(/service_unavailable · 服务暂不可用/)).toBeInTheDocument()
    expect(within(dialog).getByText(/requestId=menu-roles-1/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '保存菜单' })).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('button', { name: '重试菜单角色绑定' }))
    const roleCheckbox = await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    await waitFor(() => expect(roleCheckbox).toBeChecked())
    expect(listRolesForMenu).toHaveBeenCalledTimes(2)
    expect(within(dialog).getByRole('button', { name: '保存菜单' })).not.toBeDisabled()
  })

  it('删除菜单失败时在确认框显示业务错误诊断', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    vi.spyOn(apiClient, 'deleteMenu').mockRejectedValue(new ApiError('菜单仍被引用', 409, 'resource_conflict', null, { requestId: 'menu-1' }))
    renderPage()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除 1 条' }))

    expect(await within(dialog).findByText(/resource_conflict/)).toBeInTheDocument()
    expect(dialog).toHaveTextContent('requestId=menu-1')
  })
})
