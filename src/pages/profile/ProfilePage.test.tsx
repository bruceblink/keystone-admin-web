import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from './ProfilePage'
import { ApiError, apiClient } from '../../shared/api/client'

const profile = {
  id: 'profile-1', username: 'operator', displayName: '平台运维员', roles: ['系统管理员'],
  mustChangePassword: false, deptId: null, postId: null, email: 'operator@example.com',
  phoneNumber: null, sex: null, avatar: null, loginIp: null, loginAt: null, remark: null,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><ProfilePage /></QueryClientProvider>)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

afterEach(() => vi.restoreAllMocks())

describe('ProfilePage', () => {
  it('资料保存失败时显示业务码诊断并保留表单内容', async () => {
    vi.spyOn(apiClient, 'getProfile').mockResolvedValue(profile)
    vi.spyOn(apiClient, 'updateProfile').mockRejectedValue(new ApiError('internal detail', 409, 'resource_conflict', null, { requestId: 'profile-save-1' }))
    renderPage()

    await screen.findByDisplayValue('平台运维员')
    fireEvent.change(screen.getByLabelText('展示名 *'), { target: { value: '新的展示名' } })
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('当前资源状态不允许此操作')
    expect(alert).toHaveTextContent('resource_conflict')
    expect(alert).toHaveTextContent('requestId=profile-save-1')
    expect(screen.getByLabelText('展示名 *')).toHaveValue('新的展示名')
  })

  it('资料错误反馈可以关闭', async () => {
    vi.spyOn(apiClient, 'getProfile').mockResolvedValue(profile)
    vi.spyOn(apiClient, 'updateProfile').mockRejectedValue(new Error('保存失败'))
    renderPage()

    await screen.findByDisplayValue('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('刷新资料失败时显示安全错误并保留旧资料', async () => {
    vi.spyOn(apiClient, 'getProfile').mockResolvedValueOnce(profile).mockRejectedValueOnce(new ApiError('internal detail', 503, 'service_unavailable'))
    renderPage()

    await screen.findByDisplayValue('平台运维员')
    fireEvent.click(screen.getByRole('button', { name: /刷新资料/ }))

    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(screen.getByText('系统服务暂时不可用，请稍后重试')).toBeInTheDocument()
    expect(screen.getByDisplayValue('平台运维员')).toBeInTheDocument()
  })

  it('刷新时保留未保存修改，保存后重新启用服务器资料同步', async () => {
    const getProfile = vi.spyOn(apiClient, 'getProfile')
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce({ ...profile, email: 'server-refresh@example.com' })
      .mockResolvedValueOnce({ ...profile, displayName: '已保存的展示名' })
      .mockResolvedValueOnce({ ...profile, displayName: '刷新后的展示名' })
    vi.spyOn(apiClient, 'updateProfile').mockResolvedValue({ ...profile, displayName: '已保存的展示名' })
    renderPage()

    await screen.findByDisplayValue('平台运维员')
    fireEvent.change(screen.getByLabelText('展示名 *'), { target: { value: '未保存的展示名' } })
    fireEvent.click(screen.getByRole('button', { name: /刷新资料/ }))

    expect(await screen.findByText('资料已重新读取；未保存的修改仍保留。')).toBeInTheDocument()
    expect(screen.getByLabelText('展示名 *')).toHaveValue('未保存的展示名')
    expect(screen.getByLabelText('邮箱')).toHaveValue('operator@example.com')
    expect(getProfile).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: '保存资料' }))
    expect(await screen.findByText('个人资料已保存')).toBeInTheDocument()
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(3))
    fireEvent.click(screen.getByRole('button', { name: /刷新资料/ }))

    expect(await screen.findByDisplayValue('刷新后的展示名')).toBeInTheDocument()
    expect(await screen.findByText('个人资料已刷新。')).toBeInTheDocument()
    expect(screen.queryByText('资料已重新读取；未保存的修改仍保留。')).not.toBeInTheDocument()
    expect(getProfile).toHaveBeenCalledTimes(4)
  })

  it('资料保存期间锁定资料字段，但密码表单仍可编辑', async () => {
    vi.spyOn(apiClient, 'getProfile').mockResolvedValue(profile)
    const save = deferred<typeof profile>()
    const updateProfile = vi.spyOn(apiClient, 'updateProfile').mockReturnValue(save.promise)
    renderPage()

    await screen.findByDisplayValue('平台运维员')
    fireEvent.change(screen.getByLabelText('新密码 *'), { target: { value: '备用密码!123' } })
    fireEvent.change(screen.getByLabelText('展示名 *'), { target: { value: '提交中的名称' } })
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ displayName: '提交中的名称' })))
    expect(screen.getByLabelText('展示名 *')).toBeDisabled()
    expect(screen.getByLabelText('邮箱')).toBeDisabled()
    expect(screen.getByLabelText('联系电话')).toBeDisabled()
    expect(screen.getByLabelText('头像地址')).toBeDisabled()
    expect(screen.getByLabelText('性别')).toBeDisabled()
    expect(screen.getByLabelText('新密码 *')).toBeEnabled()
    expect(screen.getByRole('button', { name: '更新密码' })).toBeEnabled()

    save.resolve({ ...profile, displayName: '提交中的名称' })
    expect(await screen.findByText('个人资料已保存')).toBeInTheDocument()
  })

  it('密码更新期间锁定密码字段，但资料表单仍可编辑', async () => {
    vi.spyOn(apiClient, 'getProfile').mockResolvedValue(profile)
    const updatePassword = deferred<{ updated: boolean }>()
    const updateProfilePassword = vi.spyOn(apiClient, 'updateProfilePassword').mockReturnValue(updatePassword.promise)
    renderPage()

    await screen.findByDisplayValue('平台运维员')
    fireEvent.change(screen.getByLabelText('新密码 *'), { target: { value: 'Strong!123' } })
    fireEvent.click(screen.getByRole('button', { name: '更新密码' }))

    await waitFor(() => expect(updateProfilePassword).toHaveBeenCalledWith('Strong!123'))
    expect(screen.getByLabelText('新密码 *')).toBeDisabled()
    expect(screen.getByLabelText('展示名 *')).toBeEnabled()
    expect(screen.getByLabelText('邮箱')).toBeEnabled()
    expect(screen.getByRole('button', { name: '保存资料' })).toBeEnabled()

    updatePassword.resolve({ updated: true })
    expect(await screen.findByText('密码已更新，请使用新密码重新登录')).toBeInTheDocument()
    expect(screen.getByLabelText('新密码 *')).toHaveValue('')
  })
})
