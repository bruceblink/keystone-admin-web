import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RolesPage } from './RolesPage'
import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { ...render(<QueryClientProvider client={queryClient}><RolesPage /></QueryClientProvider>), queryClient }
}

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('RolesPage', () => {
  it('从 URL 恢复角色筛选条件并同步查询参数', async () => {
    window.history.replaceState({}, '', '/roles?roles_keyword=auditor')
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    renderPage()

    expect(screen.getByLabelText('角色名称或标识')).toHaveValue('auditor')
    fireEvent.change(screen.getByLabelText('角色名称或标识'), { target: { value: 'admin' } })
    fireEvent.submit(screen.getByRole('button', { name: '查询' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(window.location.search).toContain('roles_keyword=admin'))
  })

  it('使用服务端分页并把当前页写入 URL', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '第一页角色', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    const listRoles = vi.spyOn(apiClient, 'listRoles')
      .mockResolvedValueOnce({ items: [role], page: 1, size: 20, total: 21 })
      .mockResolvedValueOnce({ items: [{ ...role, name: '第二页角色' }], page: 2, size: 20, total: 21 })
    renderPage()

    expect(await screen.findByText('第一页角色')).toBeInTheDocument()
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
    expect(listRoles).toHaveBeenCalledWith({ keyword: '', status: '', page: 1, size: 20 })

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(screen.getByText('第二页角色')).toBeInTheDocument())
    expect(window.location.search).toContain('roles_page=2')
    expect(listRoles).toHaveBeenLastCalledWith({ keyword: '', status: '', page: 2, size: 20 })
  })

  it('响应浏览器前进后退恢复角色筛选条件', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    renderPage()

    window.history.replaceState({}, '', '/roles?roles_keyword=operator')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(screen.getByLabelText('角色名称或标识')).toHaveValue('operator'))
  })

  it('显示角色、数据范围和权限数量', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([{
      id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'admin', name: '系统管理员', enabled: true,
      dataScope: 'ALL', deptScope: '全部组织', permissions: ['user:read', 'role:read'],
    }])
    renderPage()
    expect(await screen.findByText('系统管理员')).toBeInTheDocument()
    expect(screen.getByText('全部数据')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('通过模态框提交新增角色', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    const createRole = vi.spyOn(apiClient, 'createRole').mockResolvedValue({ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] })
    renderPage()
    await screen.findByText('没有匹配的角色')
    fireEvent.click(screen.getByRole('button', { name: /新增角色/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('角色标识 *'), { target: { value: 'auditor' } })
    fireEvent.change(within(dialog).getByLabelText('角色名称 *'), { target: { value: '审计员' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存角色' }))
    await waitFor(() => expect(createRole).toHaveBeenCalledWith({ code: 'auditor', name: '审计员', enabled: true }))
  })

  it('编辑角色时从动态目录逐项选择权限并保存', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: ['user:read'] }
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([
      { permission: 'user:read', resource: 'user', action: 'read', description: 'user read', risk: 'low', registered: true, allowed: true },
      { permission: 'role:update', resource: 'role', action: 'update', description: 'role update', risk: 'medium', registered: true, allowed: true },
    ])
    const updateRole = vi.spyOn(apiClient, 'updateRole').mockResolvedValue(role)
    const updateRolePermissions = vi.spyOn(apiClient, 'updateRolePermissions').mockResolvedValue({ updated: true })
    renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog')
    const permission = await within(dialog).findByRole('checkbox', { name: /修改.*role:update/ })
    expect(within(dialog).getByRole('checkbox', { name: /读取.*user:read/ })).toBeChecked()
    fireEvent.click(permission)
    fireEvent.click(within(dialog).getByRole('button', { name: '保存角色' }))

    await waitFor(() => expect(updateRole).toHaveBeenCalledWith(role.id, { code: role.code, name: role.name, enabled: role.enabled }))
    await waitFor(() => expect(updateRolePermissions).toHaveBeenCalledWith(role.id, ['role:update', 'user:read']))
  })

  it('查看角色成员并在确认后分配或取消分配', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    vi.spyOn(apiClient, 'listRoleUsers').mockImplementation(async (_roleId, allocated = true) => allocated ? ['user-allocated'] : ['user-available'])
    const assignRoleUsers = vi.spyOn(apiClient, 'assignRoleUsers').mockResolvedValue({ updated: true })
    const revokeRoleUsers = vi.spyOn(apiClient, 'revokeRoleUsers').mockResolvedValue({ updated: true })
    renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByRole('button', { name: '成员' }))
    expect(await screen.findByText('user-allocated')).toBeInTheDocument()
    expect(screen.getByText('user-available')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '分配' }))
    await waitFor(() => expect(assignRoleUsers).toHaveBeenCalledWith(role.id, ['user-available']))
    fireEvent.click(screen.getByRole('button', { name: '取消分配' }))
    const dialog = await screen.findByRole('dialog', { name: '取消角色成员分配' })
    expect(dialog).toHaveTextContent('将从“审计员”移除此用户')
    expect(revokeRoleUsers).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '取消角色成员分配' })).not.toBeInTheDocument()
    expect(revokeRoleUsers).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '取消分配' }))
    const confirmation = await screen.findByRole('dialog', { name: '取消角色成员分配' })
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认取消分配' }))
    await waitFor(() => expect(revokeRoleUsers).toHaveBeenCalledWith(role.id, ['user-allocated']))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '取消角色成员分配' })).not.toBeInTheDocument())
  })

  it('撤销成员失败后保留确认上下文并允许重试', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    let firstAttempt = true
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    vi.spyOn(apiClient, 'listRoleUsers').mockImplementation(async (_roleId, allocated = true) => allocated ? (firstAttempt ? ['user-allocated'] : []) : ['user-available'])
    const revokeRoleUsers = vi.spyOn(apiClient, 'revokeRoleUsers').mockImplementation(async () => {
      if (firstAttempt) {
        firstAttempt = false
        throw new ApiError('temporary failure', 503, 'service_unavailable', null, { requestId: 'role-revoke-1' })
      }
      return { updated: true }
    })
    renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByRole('button', { name: '成员' }))
    await screen.findByText('user-allocated')
    fireEvent.click(screen.getByRole('button', { name: '取消分配' }))
    let dialog = await screen.findByRole('dialog', { name: '取消角色成员分配' })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认取消分配' }))

    expect(await within(dialog).findByText(/service_unavailable/)).toBeInTheDocument()
    expect(dialog).toHaveTextContent('requestId=role-revoke-1')
    expect(within(dialog).getByRole('button', { name: '确认取消分配' })).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('button', { name: '确认取消分配' }))

    await waitFor(() => expect(revokeRoleUsers).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '取消角色成员分配' })).not.toBeInTheDocument())
  })

  it('成员查询刷新后分别将两组列表页码钳制到有效页', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    let allocatedIds = Array.from({ length: 17 }, (_, index) => `allocated-${index + 1}`)
    let availableIds = Array.from({ length: 17 }, (_, index) => `available-${index + 1}`)
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    const listRoleUsers = vi.spyOn(apiClient, 'listRoleUsers').mockImplementation(async (_roleId, allocated = true) => allocated ? allocatedIds : availableIds)
    const { queryClient } = renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByRole('button', { name: '成员' }))
    const allocatedColumn = screen.getByRole('heading', { name: '已分配用户' }).closest('section') as HTMLElement
    const availableColumn = screen.getByRole('heading', { name: '可分配用户' }).closest('section') as HTMLElement
    await within(allocatedColumn).findByText('allocated-1')
    await within(availableColumn).findByText('available-1')

    fireEvent.click(within(allocatedColumn).getByRole('button', { name: '下一页' }))
    fireEvent.click(within(allocatedColumn).getByRole('button', { name: '下一页' }))
    fireEvent.click(within(availableColumn).getByRole('button', { name: '下一页' }))
    expect(within(allocatedColumn).getByText('第 3 / 3 页')).toBeInTheDocument()
    expect(within(availableColumn).getByText('第 2 / 3 页')).toBeInTheDocument()

    allocatedIds = allocatedIds.slice(0, 6)
    availableIds = availableIds.slice(0, 6)
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['role-users', role.id], type: 'active' })
    })
    await waitFor(() => expect(listRoleUsers).toHaveBeenCalledTimes(4))

    expect(within(allocatedColumn).getByText('allocated-1')).toBeInTheDocument()
    expect(within(allocatedColumn).getByText('allocated-6')).toBeInTheDocument()
    expect(within(allocatedColumn).queryByText('allocated-17')).not.toBeInTheDocument()
    expect(within(allocatedColumn).queryByText(/第 \d+ \/ \d+ 页/)).not.toBeInTheDocument()
    expect(within(availableColumn).getByText('available-1')).toBeInTheDocument()
    expect(within(availableColumn).getByText('available-6')).toBeInTheDocument()
    expect(within(availableColumn).queryByText('available-17')).not.toBeInTheDocument()
    expect(within(availableColumn).queryByText(/第 \d+ \/ \d+ 页/)).not.toBeInTheDocument()
  })

  it('保存角色失败时显示业务码诊断并保留表单', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    vi.spyOn(apiClient, 'createRole').mockRejectedValue(new ApiError('temporary failure', 503, 'service_unavailable', null, { requestId: 'role-save-1' }))
    renderPage()

    await screen.findByText('没有匹配的角色')
    fireEvent.click(screen.getByRole('button', { name: /新增角色/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('角色标识 *'), { target: { value: 'auditor' } })
    fireEvent.change(within(dialog).getByLabelText('角色名称 *'), { target: { value: '审计员' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存角色' }))

    await waitFor(() => expect(within(dialog).getByText(/service_unavailable · 服务暂不可用/)).toBeInTheDocument())
    expect(within(dialog).getByLabelText('角色标识 *')).toHaveValue('auditor')
    expect(within(dialog).getByText(/requestId=role-save-1/)).toBeInTheDocument()
  })

  it('确认后批量删除角色', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    const deleteRoles = vi.spyOn(apiClient, 'deleteRoles').mockResolvedValue({ deleted: 1 })
    renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByLabelText('选择角色 auditor'))
    fireEvent.click(screen.getByRole('button', { name: '删除角色（1）' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('删除后不可恢复')
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteRoles).toHaveBeenCalledWith([role.id]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('提供角色 XLSX 导出操作', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    const exportRoles = vi.spyOn(apiClient, 'exportRoles').mockResolvedValue({ blob: new Blob(['xlsx']), filename: 'roles.xlsx' })
    renderPage()
    await screen.findByText('没有匹配的角色')
    fireEvent.click(screen.getByRole('button', { name: '导出 Excel' }))
    await waitFor(() => expect(exportRoles).toHaveBeenCalledOnce())
  })

  it('刷新失败时保留已有角色并提供重试入口', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    const listRoles = vi.spyOn(apiClient, 'listRoles')
      .mockResolvedValueOnce([role])
      .mockRejectedValueOnce(new ApiError('服务暂时不可用', 503, 'service_unavailable'))
      .mockResolvedValueOnce([role])
    renderPage()

    expect(await screen.findByText('审计员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新列表' }))
    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(screen.getByText(/service_unavailable · 服务暂不可用/)).toBeInTheDocument()
    expect(screen.getByText('审计员')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(listRoles).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByText('数据刷新失败')).not.toBeInTheDocument())
  })
})
