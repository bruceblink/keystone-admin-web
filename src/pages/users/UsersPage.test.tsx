import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UsersPage } from './UsersPage'
import { ApiError, apiClient } from '../../shared/api/client'
import type { NativeUsersPage } from '../../shared/api/schemas'

const userPage: NativeUsersPage = {
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><UsersPage /></QueryClientProvider>)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UsersPage', () => {
  it('显示 Native 用户并按筛选条件查询下一页', async () => {
    const listUsers = vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    expect(screen.getByText('2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce')).toBeInTheDocument()
    expect(screen.getByText('系统管理员')).toBeInTheDocument()

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
    expect(screen.getByText('权限不足')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('刷新已有用户数据失败时保留列表并提供重试入口', async () => {
    const listUsers = vi.spyOn(apiClient, 'listUsers')
      .mockResolvedValueOnce(userPage)
      .mockRejectedValueOnce(new ApiError('服务暂时不可用', 503, 'service_unavailable'))
    renderPage()

    expect(await screen.findByText('平台运维员')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /刷新列表/ }))

    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(screen.getByText('服务暂时不可用')).toBeInTheDocument()
    expect(screen.getByText('平台运维员')).toBeInTheDocument()
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  it('通过模态框提交新增用户', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const createUser = vi.spyOn(apiClient, 'createUser').mockResolvedValue(userPage.items[0])
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /新增用户/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('用户名 *'), { target: { value: 'new-user' } })
    fireEvent.change(within(dialog).getByLabelText('初始密码 *'), { target: { value: 'Strong-password-123!' } })
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '新用户' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'new-user', displayName: '新用户', roleCodes: [] })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('编辑用户时保留空密码和角色字段语义', async () => {
    vi.spyOn(apiClient, 'listUsers').mockResolvedValue(userPage)
    const updateUser = vi.spyOn(apiClient, 'updateUser').mockResolvedValue(userPage.items[0])
    renderPage()

    await screen.findByText('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('展示名 *'), { target: { value: '更新名称' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存用户' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(userPage.items[0].id, expect.objectContaining({ displayName: '更新名称', password: undefined, roleCodes: null })))
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
})
