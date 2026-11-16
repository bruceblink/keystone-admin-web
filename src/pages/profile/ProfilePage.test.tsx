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
})
