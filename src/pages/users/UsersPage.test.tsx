import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
