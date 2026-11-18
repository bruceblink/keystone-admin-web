import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient } from '../../shared/api/client'
import type { NativeRole } from '../../shared/api/schemas'
import { mockRoleCatalog, renderUsersPage as renderPage, roleCatalog, userPage } from './UsersPage.testSupport'

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('UsersPage', () => {
  it('从 URL 恢复筛选条件和分页', async () => {
    window.history.replaceState({}, '', '/users?users_username=alice&users_displayName=Alice&users_page=2')
    const listUsers = vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    renderPage()

    expect(screen.getByLabelText('用户名')).toHaveValue('alice')
    expect(screen.getByLabelText('展示名')).toHaveValue('Alice')
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ username: 'alice', displayName: 'Alice', page: 2, size: 20 }))
  })

  // 最后一页数据被删除后，应按新总数请求有效页并保留筛选条件。
  it('删除最后一页最后一条用户后回到最后有效页并保留筛选条件', async () => {
    window.history.replaceState({}, '', '/users?users_username=alice&users_displayName=Alice&users_page=2')
    const alice = { ...userPage.items[0], username: 'alice', displayName: 'Alice' }
    const listUsers = vi.spyOn(apiClient, 'listUsers')
      .mockResolvedValueOnce({ ...userPage, items: [alice], page: 2, total: 21 })
      .mockResolvedValueOnce({ ...userPage, items: [], page: 2, total: 20 })
      .mockResolvedValueOnce({ ...userPage, items: [alice], page: 1, total: 20 })
    const deleteUsers = vi.spyOn(apiClient, 'deleteUsers').mockResolvedValue({ deleted: 1 })
    renderPage()

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByLabelText('用户名')).toHaveValue('alice')
    expect(screen.getByLabelText('展示名')).toHaveValue('Alice')
    expect(listUsers).toHaveBeenLastCalledWith({ username: 'alice', displayName: 'Alice', page: 2, size: 20 })

    fireEvent.click(screen.getByLabelText('选择用户 alice'))
    fireEvent.click(screen.getByRole('button', { name: '删除用户（1）' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteUsers).toHaveBeenCalledWith([alice.id]))
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ username: 'alice', displayName: 'Alice', page: 1, size: 20 }))
    expect(window.location.search).toContain('users_username=alice')
    expect(window.location.search).toContain('users_displayName=Alice')
    expect(window.location.search).not.toContain('users_page=')
    expect(screen.getByLabelText('用户名')).toHaveValue('alice')
    expect(screen.getByLabelText('展示名')).toHaveValue('Alice')
  })

  // 失败响应不能被当作新总数，页码和用户输入条件都应保留。
  it('读取过期页失败时不改写页码或筛选条件', async () => {
    window.history.replaceState({}, '', '/users?users_username=alice&users_displayName=Alice&users_page=2')
    const listUsers = vi.spyOn(apiClient, 'listUsers').mockRejectedValue(new ApiError('暂时不可用', 503, 'service_unavailable'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取用户列表')
    expect(listUsers).toHaveBeenCalledTimes(1)
    expect(listUsers).toHaveBeenCalledWith({ username: 'alice', displayName: 'Alice', page: 2, size: 20 })
    expect(window.location.search).toContain('users_username=alice')
    expect(window.location.search).toContain('users_displayName=Alice')
    expect(window.location.search).toContain('users_page=2')
    expect(screen.getByLabelText('用户名')).toHaveValue('alice')
    expect(screen.getByLabelText('展示名')).toHaveValue('Alice')
  })

  it('显示 Native 用户并按筛选条件查询下一页', async () => {
    const listUsers = vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    expect(screen.getByText('2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce')).toBeInTheDocument()
    expect(screen.getByText('系统管理员')).toBeInTheDocument()
    const listCard = screen.getByRole('group', { name: '列表操作' }).closest('section')
    expect(listCard).toContainElement(screen.getByRole('heading', { name: '用户列表' }))
    expect(listCard).toContainElement(screen.getByRole('table'))

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'operator' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ username: 'operator', displayName: '', page: 1, size: 20 }))

    await screen.findByRole('button', { name: '下一页' })
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ username: 'operator', displayName: '', page: 2, size: 20 }))
  })

  it('显示空结果状态', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue({ ...userPage, items: [], total: 0 })
    renderPage()

    expect(await screen.findByText('没有匹配的用户')).toBeInTheDocument()
    expect(screen.getByText('调整筛选条件后重试，或清空筛选条件查看全部用户。')).toBeInTheDocument()
  })

  it('显示读取错误并提供重试入口', async () => {
    vi.spyOn(apiClient, 'listUsers').mockRejectedValue(new ApiError('权限不足', 403, 'permission_denied'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取用户列表')
    expect(screen.getByText('没有执行此操作的权限')).toBeInTheDocument()
    expect(screen.getByText(/诊断：permission_denied/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('首次读取失败时仍显示列表操作工具栏', async () => {
    vi.spyOn(apiClient, 'listUsers').mockRejectedValue(new ApiError('服务暂时不可用', 503, 'service_unavailable'))
    mockRoleCatalog()
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取用户列表')
    expect(screen.getByRole('group', { name: '列表操作' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新增用户/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /导入 Excel/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /导出 Excel/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /刷新列表/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: '删除用户（0）' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: '列表操作' })).getAllByRole('button').map((button) => button.textContent?.replace(/\s/g, '')))
      .toEqual(['新增用户', '导入Excel', '导出Excel', '删除用户（0）', '刷新列表'])
  })

  it('刷新已有用户数据失败时保留列表并提供重试入口', async () => {
    const listUsers = vi.spyOn(apiClient, 'listUsers')
      .mockResolvedValueOnce(userPage)
      .mockRejectedValueOnce(new ApiError('服务暂时不可用', 503, 'service_unavailable'))
    renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /刷新列表/ }))

    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(screen.getByText('系统服务暂时不可用，请稍后重试')).toBeInTheDocument()
    expect(screen.getByText('平台运维员')).toBeInTheDocument()
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  it('通过模态框提交新增用户', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    mockRoleCatalog()
    const createUser = vi.spyOn(apiClient, 'createUser').mockResolvedValue(userPage.items[0])
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /新增用户/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('用户名 *'), { target: { value: 'new-user' } })
    fireEvent.change(within(dialog).getByLabelText('初始密码 *'), { target: { value: 'Strong-password-123!' } })
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '新用户' } })
    fireEvent.click(await within(dialog).findByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'new-user', displayName: '新用户', roleCodes: [] })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('保存用户失败时显示业务码诊断并保留表单', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    mockRoleCatalog()
    vi.spyOn(apiClient, 'createUser').mockRejectedValue(new ApiError('temporary failure', 503, 'service_unavailable', null, { requestId: 'user-save-1' }))
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /新增用户/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('用户名 *'), { target: { value: 'new-user' } })
    fireEvent.change(within(dialog).getByLabelText('初始密码 *'), { target: { value: 'Strong-password-123!' } })
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '新用户' } })
    fireEvent.click(await within(dialog).findByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(within(dialog).getByText(/service_unavailable · 服务暂不可用/)).toBeInTheDocument())
    expect(within(dialog).getByLabelText('用户名 *')).toHaveValue('new-user')
    expect(within(dialog).getByText(/requestId=user-save-1/)).toBeInTheDocument()
  })

  it('编辑用户时保留空密码和角色字段语义', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    mockRoleCatalog()
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '更新名称' } })
    fireEvent.click(await within(dialog).findByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ displayName: '更新名称', password: undefined, deptId: 'dept-operations', clearDept: false, roleCodes: null })))
  })

  // 部门归属只允许保留、明确清空或改派，避免 clearDept 与 deptId 同时生效。
  it('编辑用户时勾选清除部门会清空输入并提交 null', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    mockRoleCatalog()
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = await screen.findByRole('dialog')
    const department = within(dialog).getByLabelText('部门 UUID')
    fireEvent.click(within(dialog).getByLabelText('清除部门归属'))

    expect(department).toHaveValue('')
    expect(department).toBeDisabled()
    await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ deptId: null, clearDept: true })))
  })

  it('取消清除部门后可重新选择部门并提交新 UUID', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    mockRoleCatalog()
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = await screen.findByRole('dialog')
    const clearDepartment = within(dialog).getByLabelText('清除部门归属')
    const department = within(dialog).getByLabelText('部门 UUID')
    fireEvent.click(clearDepartment)
    fireEvent.click(clearDepartment)
    fireEvent.change(department, { target: { value: 'dept-reassigned' } })
    await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ deptId: 'dept-reassigned', clearDept: false })))
  })

  it('从角色目录预选编辑用户角色并支持主动清空', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    mockRoleCatalog()
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = await screen.findByRole('dialog')
    const adminRole = await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    expect(adminRole).toBeChecked()
    fireEvent.click(adminRole)
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ roleCodes: [] })))
  })

  it('角色目录读取失败时显示错误并支持重试', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const listRoles = vi.spyOn(apiClient, 'listRoles')
      .mockRejectedValueOnce(new ApiError('角色目录不可用', 503, 'service_unavailable'))
      .mockResolvedValueOnce(roleCatalog)
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /新增用户/ }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('角色目录读取失败')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '重试角色目录' }))
    expect(await within(dialog).findByText('审计员')).toBeInTheDocument()
    expect(listRoles).toHaveBeenCalledTimes(2)
  })

  it('角色目录返回 403 时仍可保存基础资料并保留原角色', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    vi.spyOn(apiClient, 'listRoles').mockRejectedValue(new ApiError('权限不足', 403, 'permission_denied'))
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('角色目录不可用；本次保存会保留原有角色，不提交角色变更。')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '保存用户' })).toBeEnabled()
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '仅改基础资料' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ displayName: '仅改基础资料', roleCodes: null })))
  })

  it('选择角色后角色目录读取失败时不提交草稿角色变更', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const listRoles = vi.spyOn(apiClient, 'listRoles')
      .mockResolvedValueOnce(roleCatalog)
      .mockRejectedValueOnce(new ApiError('角色目录暂不可用', 503, 'service_unavailable'))
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    const { queryClient } = renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = await screen.findByRole('dialog')
    const administratorRole = await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    fireEvent.click(administratorRole)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /审计员/ }))

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-role-options'] })
    })

    expect(await within(dialog).findByText('角色目录不可用；本次保存会保留原有角色，不提交角色变更。')).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: /审计员/ })).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '目录失败后保存' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ displayName: '目录失败后保存', roleCodes: null })))
    expect(listRoles).toHaveBeenCalledTimes(2)
  })

  it('编辑用户重新读取角色期间锁定保存并保留草稿，成功后可提交', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    let resolveRoleReload: (roles: NativeRole[]) => void = () => undefined
    const roleReload = new Promise<NativeRole[]>((resolve) => { resolveRoleReload = resolve })
    vi.spyOn(apiClient, 'listRoles').mockResolvedValueOnce(roleCatalog).mockReturnValueOnce(roleReload)
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    const { queryClient } = renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = await screen.findByRole('dialog')
    const administratorRole = await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    fireEvent.click(administratorRole)

    let refetchPromise: Promise<void> = Promise.resolve()
    await act(async () => {
      refetchPromise = queryClient.invalidateQueries({ queryKey: ['user-role-options'] })
      await Promise.resolve()
    })

    expect(await within(dialog).findByText('正在读取角色目录…')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '读取角色中…' })).toBeDisabled()
    expect(updateUser).not.toHaveBeenCalled()

    await act(async () => {
      resolveRoleReload(roleCatalog)
      await refetchPromise
    })

    const reloadedAdministratorRole = await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    expect(reloadedAdministratorRole).not.toBeChecked()
    const saveButton = await within(dialog).findByRole('button', { name: '保存用户' })
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ roleCodes: [] })))
  })

  it('角色目录重试成功后恢复原角色并允许主动编辑角色', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const listRoles = vi.spyOn(apiClient, 'listRoles')
      .mockRejectedValueOnce(new ApiError('角色目录暂不可用', 503, 'service_unavailable'))
      .mockResolvedValueOnce(roleCatalog)
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('角色目录不可用；本次保存会保留原有角色，不提交角色变更。')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '重试角色目录' }))

    const administratorRole = await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    expect(administratorRole).toBeChecked()
    expect(within(dialog).getByRole('button', { name: '保存用户' })).toBeEnabled()
    fireEvent.click(administratorRole)
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ roleCodes: [] })))
    expect(listRoles).toHaveBeenCalledTimes(2)
  })

  it('新增用户必须先成功读取角色目录才能保存', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const listRoles = vi.spyOn(apiClient, 'listRoles')
      .mockRejectedValueOnce(new ApiError('角色目录暂不可用', 503, 'service_unavailable'))
      .mockResolvedValueOnce(roleCatalog)
    const createUser = vi.spyOn(apiClient, 'createUser').mockResolvedValue(userPage.items[0])
    renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /新增用户/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('用户名 *'), { target: { value: 'new-user' } })
    fireEvent.change(within(dialog).getByLabelText('初始密码 *'), { target: { value: 'Strong-password-123!' } })
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '新建账号' } })
    await within(dialog).findByText('创建用户前必须成功读取角色目录。请重试后再保存。')
    const saveButton = within(dialog).getByRole('button', { name: '保存用户' })
    expect(saveButton).toBeDisabled()
    fireEvent.click(saveButton)
    expect(createUser).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '重试角色目录' }))
    await within(dialog).findByRole('checkbox', { name: /系统管理员/ })
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)

    await waitFor(() => expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'new-user', displayName: '新建账号', roleCodes: [] })))
    expect(listRoles).toHaveBeenCalledTimes(2)
  })

  it('通过模态框选择 XLSX 并显示逐行导入结果', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const importUsers = vi.spyOn(apiClient, 'importUsers').mockResolvedValue({
      total: 2,
      success: 1,
      failed: [{ row: 3, username: 'blocked', reason: 'permission_denied' }],
    })
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /导入 Excel/ }))
    const dialog = screen.getByRole('dialog', { name: '导入用户' })
    const file = new File(['xlsx'], 'users.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(within(dialog).getByLabelText('选择 XLSX 文件'), { target: { files: [file] } })
    fireEvent.click(within(dialog).getByRole('button', { name: '开始导入' }))

    await waitFor(() => expect(importUsers).toHaveBeenCalledWith(file))
    expect(await within(dialog).findByRole('region', { name: '导入结果' })).toHaveTextContent('blocked')
    expect(within(dialog).getByText('permission_denied')).toBeInTheDocument()
  })

  it('拒绝用户导入的旧式 Excel 扩展名并提供可读错误', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const importUsers = vi.spyOn(apiClient, 'importUsers')
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /导入 Excel/ }))
    const dialog = screen.getByRole('dialog', { name: '导入用户' })
    fireEvent.change(within(dialog).getByLabelText('选择 XLSX 文件'), { target: { files: [new File(['xls'], 'users.xls')] } })

    expect(within(dialog).getByRole('alert')).toHaveTextContent('不支持 .xls 或 .csv')
    expect(importUsers).not.toHaveBeenCalled()
  })

  it('用户导入失败时显示业务码诊断', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    vi.spyOn(apiClient, 'importUsers').mockRejectedValue(new ApiError('导入服务不可用', 503, 'service_unavailable', null, { requestId: 'user-import-1' }))
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /导入 Excel/ }))
    const dialog = screen.getByRole('dialog', { name: '导入用户' })
    const file = new File(['xlsx'], 'users.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(within(dialog).getByLabelText('选择 XLSX 文件'), { target: { files: [file] } })
    fireEvent.click(within(dialog).getByRole('button', { name: '开始导入' }))

    expect(await within(dialog).findByText(/service_unavailable · 服务暂不可用/)).toBeInTheDocument()
    expect(within(dialog).getByText(/requestId=user-import-1/)).toBeInTheDocument()
  })

  it('确认后批量删除当前页用户', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const deleteUsers = vi.spyOn(apiClient, 'deleteUsers').mockResolvedValue({ deleted: 1 })
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByLabelText('选择用户 operator'))
    fireEvent.click(screen.getByRole('button', { name: '删除用户（1）' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/删除后不可恢复/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteUsers).toHaveBeenCalledWith([userPage.items[0].id]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('用户删除失败时显示业务码诊断', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    vi.spyOn(apiClient, 'deleteUsers').mockRejectedValue(new ApiError('用户仍被引用', 409, 'resource_conflict', null, { requestId: 'user-delete-1' }))
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByLabelText('选择用户 operator'))
    fireEvent.click(screen.getByRole('button', { name: '删除用户（1）' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除 1 条' }))

    expect(await within(dialog).findByText(/resource_conflict/)).toBeInTheDocument()
    expect(within(dialog).getByText(/requestId=user-delete-1/)).toBeInTheDocument()
  })
})
