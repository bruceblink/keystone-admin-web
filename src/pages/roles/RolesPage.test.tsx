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

  it('深链接切换筛选时等待当前结果后再校正页码', async () => {
    const previousRole = { id: 'previous-role', code: 'previous', name: '旧筛选角色', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    const targetRole = { ...previousRole, id: 'target-role', code: 'target', name: '目标筛选角色' }
    let resolveTargetPage!: (value: { items: typeof targetRole[]; page: number; size: number; total: number }) => void
    const targetPage = new Promise<{ items: typeof targetRole[]; page: number; size: number; total: number }>((resolve) => { resolveTargetPage = resolve })
    const listRoles = vi.spyOn(apiClient, 'listRoles').mockImplementation(async ({ keyword = '', page = 1 } = {}) => {
      if (keyword === 'target' && page === 5) return targetPage
      if (keyword === 'target' && page === 3) return { items: [targetRole], page: 3, size: 20, total: 41 }
      return { items: [previousRole], page, size: 20, total: 1 }
    })
    renderPage()

    expect(await screen.findByText('旧筛选角色')).toBeInTheDocument()
    window.history.pushState({}, '', '/roles?roles_keyword=target&roles_page=5')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(listRoles).toHaveBeenLastCalledWith({ keyword: 'target', status: '', page: 5, size: 20 }))
    expect(window.location.search).toContain('roles_page=5')

    resolveTargetPage({ items: [], page: 5, size: 20, total: 41 })
    expect(await screen.findByText('目标筛选角色')).toBeInTheDocument()
    await waitFor(() => expect(listRoles).toHaveBeenLastCalledWith({ keyword: 'target', status: '', page: 3, size: 20 }))
    expect(window.location.search).toContain('roles_page=3')
    expect(screen.getByText('第 3 / 3 页')).toBeInTheDocument()
  })

  it('响应浏览器前进后退恢复角色筛选条件', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    renderPage()

    window.history.replaceState({}, '', '/roles?roles_keyword=operator')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(screen.getByLabelText('角色名称或标识')).toHaveValue('operator'))
  })

  it('首次读取失败时仍显示列表操作工具栏', async () => {
    vi.spyOn(apiClient, 'listRoles').mockRejectedValue(new ApiError('服务暂时不可用', 503, 'service_unavailable'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取角色列表')
    expect(screen.getByRole('group', { name: '列表操作' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导出 Excel/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /新增角色/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: '删除角色（0）' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '刷新列表' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: '列表操作' })).getAllByRole('button').map((button) => button.textContent?.replace(/\s/g, '')))
      .toEqual(['新增角色', '导出Excel', '删除角色（0）', '刷新列表'])
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
    vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([])
    const createRole = vi.spyOn(apiClient, 'createRole').mockResolvedValue({ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] })
    renderPage()
    await screen.findByText('没有匹配的角色')
    fireEvent.click(screen.getByRole('button', { name: /新增角色/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('角色标识 *'), { target: { value: 'auditor' } })
    fireEvent.change(within(dialog).getByLabelText('角色名称 *'), { target: { value: '审计员' } })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存角色' })).toBeEnabled())
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

  it('权限目录读取失败时阻止保存，重试成功后允许提交', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    vi.spyOn(apiClient, 'listPermissionCatalog')
      .mockRejectedValueOnce(new ApiError('目录不可用', 503, 'service_unavailable'))
      .mockResolvedValue([])
    const createRole = vi.spyOn(apiClient, 'createRole')
    renderPage()

    await screen.findByText('没有匹配的角色')
    fireEvent.click(screen.getByRole('button', { name: '新增角色' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('角色权限目录读取失败')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '保存角色' })).toBeDisabled()
    expect(createRole).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '重试' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存角色' })).toBeEnabled())
  })

  it('角色已保存但权限保存失败时刷新列表并保留选择供重试', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    let finishRefresh!: (roles: typeof role[]) => void
    const pendingRefresh = new Promise<typeof role[]>((resolve) => { finishRefresh = resolve })
    const listRoles = vi.spyOn(apiClient, 'listRoles').mockResolvedValueOnce([]).mockImplementationOnce(() => pendingRefresh).mockResolvedValue([role])
    vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([
      { permission: 'user:read', resource: 'user', action: 'read', description: '读取用户', risk: 'low', registered: true, allowed: true },
    ])
    const createRole = vi.spyOn(apiClient, 'createRole').mockResolvedValue(role)
    const updateRole = vi.spyOn(apiClient, 'updateRole').mockResolvedValue(role)
    const updatePermissions = vi.spyOn(apiClient, 'updateRolePermissions')
      .mockRejectedValueOnce(new ApiError('暂不可用', 503, 'service_unavailable'))
      .mockResolvedValue({ updated: true })
    renderPage()

    await screen.findByText('没有匹配的角色')
    fireEvent.click(screen.getByRole('button', { name: '新增角色' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('角色标识 *'), { target: { value: role.code } })
    fireEvent.change(within(dialog).getByLabelText('角色名称 *'), { target: { value: role.name } })
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: /user:read/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '保存角色' }))

    expect(await within(dialog).findByText('角色权限保存失败')).toBeInTheDocument()
    await waitFor(() => expect(listRoles).toHaveBeenCalledTimes(2))
    expect(within(dialog).getByRole('checkbox', { name: /user:read/ })).toBeChecked()
    expect(within(dialog).getByRole('button', { name: /保存/ })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled()
    finishRefresh([role])
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存角色' })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole('button', { name: '保存角色' }))
    await waitFor(() => expect(updateRole).toHaveBeenCalledWith(role.id, expect.objectContaining({ name: role.name })))
    await waitFor(() => expect(updatePermissions).toHaveBeenNthCalledWith(2, role.id, ['user:read']))
    expect(createRole).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('查看角色成员并在确认后分配或取消分配', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    vi.spyOn(apiClient, 'listRoleMembers').mockImplementation(async (_roleId, allocated = true) => allocated ? [{ id: 'user-allocated', username: 'alice', displayName: '爱丽丝' }] : [{ id: 'user-available', username: null, displayName: null }])
    const assignRoleUsers = vi.spyOn(apiClient, 'assignRoleUsers').mockResolvedValue({ updated: true })
    const revokeRoleUsers = vi.spyOn(apiClient, 'revokeRoleUsers').mockResolvedValue({ updated: true })
    renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByRole('button', { name: '成员' }))
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByText('爱丽丝')).toBeInTheDocument()
    expect(screen.getByText('user-available')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '分配' }))
    await waitFor(() => expect(assignRoleUsers).toHaveBeenCalledWith(role.id, ['user-available']))
    fireEvent.click(screen.getByRole('button', { name: '取消分配' }))
    const dialog = await screen.findByRole('dialog', { name: '取消角色成员分配' })
    expect(dialog).toHaveTextContent('将从“审计员”移除此用户')
    expect(dialog).toHaveTextContent('alice（爱丽丝）')
    expect(revokeRoleUsers).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '取消角色成员分配' })).not.toBeInTheDocument()
    expect(revokeRoleUsers).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '取消分配' }))
    const confirmation = await screen.findByRole('dialog', { name: '取消角色成员分配' })
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认移除' }))
    await waitFor(() => expect(revokeRoleUsers).toHaveBeenCalledWith(role.id, ['user-allocated']))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '取消角色成员分配' })).not.toBeInTheDocument())
  })

  it('撤销成员失败后保留确认上下文并允许重试', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    let firstAttempt = true
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    vi.spyOn(apiClient, 'listRoleMembers').mockImplementation(async (_roleId, allocated = true) => (allocated ? (firstAttempt ? ['user-allocated'] : []) : ['user-available']).map((id) => ({ id, username: null, displayName: null })))
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
    fireEvent.click(within(dialog).getByRole('button', { name: '确认移除' }))

    expect(await within(dialog).findByText(/service_unavailable/)).toBeInTheDocument()
    expect(dialog).toHaveTextContent('requestId=role-revoke-1')
    expect(within(dialog).getByRole('button', { name: '确认移除' })).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('button', { name: '确认移除' }))

    await waitFor(() => expect(revokeRoleUsers).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '取消角色成员分配' })).not.toBeInTheDocument())
  })

  it('成员查询刷新后分别将两组列表页码钳制到有效页', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    let allocatedIds = Array.from({ length: 17 }, (_, index) => `allocated-${index + 1}`)
    let availableIds = Array.from({ length: 17 }, (_, index) => `available-${index + 1}`)
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    const listRoleUsers = vi.spyOn(apiClient, 'listRoleMembers').mockImplementation(async (_roleId, allocated = true) => (allocated ? allocatedIds : availableIds).map((id) => ({ id, username: null, displayName: null })))
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

    expect(await within(allocatedColumn).findByText('allocated-1')).toBeInTheDocument()
    expect(within(allocatedColumn).getByText('allocated-6')).toBeInTheDocument()
    expect(within(allocatedColumn).queryByText('allocated-17')).not.toBeInTheDocument()
    expect(within(allocatedColumn).queryByText(/第 \d+ \/ \d+ 页/)).not.toBeInTheDocument()
    expect(await within(availableColumn).findByText('available-1')).toBeInTheDocument()
    expect(within(availableColumn).getByText('available-6')).toBeInTheDocument()
    expect(within(availableColumn).queryByText('available-17')).not.toBeInTheDocument()
    expect(within(availableColumn).queryByText(/第 \d+ \/ \d+ 页/)).not.toBeInTheDocument()
  })

  it('保存角色失败时显示业务码诊断并保留表单', async () => {
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([])
    vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([])
    vi.spyOn(apiClient, 'createRole').mockRejectedValue(new ApiError('temporary failure', 503, 'service_unavailable', null, { requestId: 'role-save-1' }))
    renderPage()

    await screen.findByText('没有匹配的角色')
    fireEvent.click(screen.getByRole('button', { name: /新增角色/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('角色标识 *'), { target: { value: 'auditor' } })
    fireEvent.change(within(dialog).getByLabelText('角色名称 *'), { target: { value: '审计员' } })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存角色' })).toBeEnabled())
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

  it.each(['mfa_required', 'mfa_step_up_required'])('删除需要 %s 时验证后重试原操作', async (code) => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    const remove = vi.spyOn(apiClient, 'deleteRoles').mockRejectedValueOnce(new ApiError('MFA required', 403, code)).mockResolvedValueOnce({ deleted: 1 })
    const begin = vi.spyOn(apiClient, 'beginMfaStepUp').mockResolvedValue({ challengeId: 'test-challenge', clientId: 'web', expiresAt: '2030-01-01T00:00:00Z' })
    const verify = vi.spyOn(apiClient, 'verifyMfaStepUp').mockResolvedValue({ accessToken: 'test-token', expiresIn: 300, authenticationLevel: 'AAL2', amr: 'otp' })
    renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByLabelText('选择角色 auditor'))
    fireEvent.click(screen.getByRole('button', { name: '删除角色（1）' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))
    const dialog = await screen.findByRole('dialog', { name: '需要 MFA 二次验证' })
    fireEvent.change(within(dialog).getByLabelText('验证码或恢复码 *'), { target: { value: '123456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '验证并继续' }))

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2))
    expect(begin).toHaveBeenCalledOnce()
    expect(verify).toHaveBeenCalledWith('test-challenge', '123456')
    expect(remove).toHaveBeenLastCalledWith([role.id])
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '删除角色' })).not.toBeInTheDocument())
  })

  it('取消二次认证时不重试删除并保留已选角色', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    const remove = vi.spyOn(apiClient, 'deleteRoles').mockRejectedValue(new ApiError('MFA required', 403, 'mfa_required'))
    vi.spyOn(apiClient, 'beginMfaStepUp').mockResolvedValue({ challengeId: 'test-challenge', clientId: 'web', expiresAt: '2030-01-01T00:00:00Z' })
    renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByLabelText('选择角色 auditor'))
    fireEvent.click(screen.getByRole('button', { name: '删除角色（1）' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))
    const dialog = await screen.findByRole('dialog', { name: '需要 MFA 二次验证' })
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '需要 MFA 二次验证' })).not.toBeInTheDocument())
    expect(remove).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('选择角色 auditor')).toBeChecked()
  })

  it('验证码错误后允许重新验证，成功前不重试删除', async () => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    const remove = vi.spyOn(apiClient, 'deleteRoles').mockRejectedValueOnce(new ApiError('MFA required', 403, 'mfa_required')).mockResolvedValueOnce({ deleted: 1 })
    vi.spyOn(apiClient, 'beginMfaStepUp').mockResolvedValue({ challengeId: 'test-challenge', clientId: 'web', expiresAt: '2030-01-01T00:00:00Z' })
    const verify = vi.spyOn(apiClient, 'verifyMfaStepUp').mockRejectedValueOnce(new ApiError('invalid code', 401, 'mfa_invalid_code')).mockResolvedValueOnce({ accessToken: 'test-token', expiresIn: 300, authenticationLevel: 'AAL2', amr: 'otp' })
    renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByLabelText('选择角色 auditor'))
    fireEvent.click(screen.getByRole('button', { name: '删除角色（1）' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))
    const dialog = await screen.findByRole('dialog', { name: '需要 MFA 二次验证' })
    const input = within(dialog).getByLabelText('验证码或恢复码 *')
    fireEvent.change(input, { target: { value: '111111' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '验证并继续' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('验证码错误，请重试')
    expect(remove).toHaveBeenCalledOnce()
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: '222222' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '验证并继续' }))

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2))
    expect(verify).toHaveBeenLastCalledWith('test-challenge', '222222')
  })

  it.each([
    ['role_has_members', '角色存在用户，不能删除'],
    ['role_protected', '管理员角色不能删除'],
  ])('删除失败时显示 %s 并在取消后清除错误', async (code, message) => {
    const role = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'auditor', name: '审计员', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    vi.spyOn(apiClient, 'deleteRoles').mockRejectedValue(new ApiError(message, 422, code))
    renderPage()

    await screen.findByText('审计员')
    fireEvent.click(screen.getByLabelText('选择角色 auditor'))
    fireEvent.click(screen.getByRole('button', { name: '删除角色（1）' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除 1 条' }))
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent(message))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(code)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('选择角色 auditor')).toBeChecked()
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
