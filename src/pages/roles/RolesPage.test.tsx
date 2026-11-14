import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RolesPage } from './RolesPage'
import { apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><RolesPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('RolesPage', () => {
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
})
