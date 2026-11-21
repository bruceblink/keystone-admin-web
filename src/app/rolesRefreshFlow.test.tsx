import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RolesPage } from '../pages/roles/RolesPage'
import { apiClient } from '../shared/api/client'
import { ApiError } from '../shared/api/errors'
import type { NativeCapabilities } from '../shared/api/schemas'
import { CapabilitiesBoundary, CapabilityPage } from '../shared/auth/CapabilitiesRoutes'
import { useSessionStore } from '../shared/state/session'

const roleCapabilities: NativeCapabilities = {
  permissions: ['role:read', 'role:update'],
  resources: {
    user: false, department: false, role: true, post: false, menu: false, config: false,
    dictionary: false, notice: false, job: false, audit: false, session: false,
    'api-key': false, profile: false,
  },
}

afterEach(() => {
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, authRevision: 0, sessionRevision: 0, pendingActionNotice: null })
})

describe('角色写入与会话刷新', () => {
  // 同一认证代次也可能重新确认出更窄的数据范围，旧角色不能作为新请求的占位数据。
  it('同一会话权限重新确认后，在新角色列表返回前隐藏旧范围记录', async () => {
    useSessionStore.setState({ user: { id: 'user-1', username: 'role-admin', displayName: '管理员', role: 'admin' }, isHydrated: true, authRevision: 1 })
    const oldRole = { id: 'role-old', code: 'old', name: '旧范围角色', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    const newRole = { ...oldRole, id: 'role-new', code: 'new', name: '新范围角色' }
    let resolveNewRoles!: (value: typeof newRole[]) => void
    const newRoles = new Promise<typeof newRole[]>((resolve) => { resolveNewRoles = resolve })
    const capabilities = vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue(roleCapabilities)
    const listRoles = vi.spyOn(apiClient, 'listRoles').mockResolvedValueOnce([oldRole]).mockImplementationOnce(() => newRoles)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/roles']}><Routes>
      <Route element={<CapabilitiesBoundary />}>
        <Route path="/roles" element={<CapabilityPage path="/roles"><RolesPage /></CapabilityPage>} />
      </Route>
    </Routes></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('旧范围角色')).toBeInTheDocument()
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['auth', 'capabilities'] }) })
    await waitFor(() => expect(listRoles).toHaveBeenCalledTimes(2))

    expect(capabilities).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('旧范围角色')).not.toBeInTheDocument()
    expect(screen.getByText('正在读取角色列表')).toBeInTheDocument()

    await act(async () => resolveNewRoles([newRole]))
    expect(await screen.findByText('新范围角色')).toBeInTheDocument()
    expect(screen.queryByText('旧范围角色')).not.toBeInTheDocument()
  })

  // 写请求完成前刷新令牌，权限重新读取后仍应显示真实失败结果和输入。
  it('保留写请求失败结果，直到同一账号的权限重新读取完成', async () => {
    useSessionStore.setState({ user: { id: 'user-1', username: 'role-admin', displayName: '管理员', role: 'admin' }, isHydrated: true, authRevision: 1 })
    const role = { id: 'role-1', code: 'operator', name: '原角色', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    let resolveCapabilities!: (value: NativeCapabilities) => void
    const pendingCapabilities = new Promise<NativeCapabilities>((resolve) => { resolveCapabilities = resolve })
    const capabilities = vi.spyOn(apiClient, 'getCapabilities').mockImplementation(() => useSessionStore.getState().authRevision === 1 ? Promise.resolve(roleCapabilities) : pendingCapabilities)
    const listRoles = vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    let rejectUpdate!: (reason: Error) => void
    const update = vi.spyOn(apiClient, 'updateRole').mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectUpdate = reject }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/roles']}><Routes>
      <Route element={<CapabilitiesBoundary />}>
        <Route path="/roles" element={<CapabilityPage path="/roles"><RolesPage /></CapabilityPage>} />
      </Route>
    </Routes></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('原角色')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('角色名称 *'), { target: { value: '待保存角色' } })
    fireEvent.click(screen.getByRole('button', { name: '保存角色' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())

    act(() => useSessionStore.setState({ authRevision: 2 }))
    await waitFor(() => expect(capabilities.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(document.querySelector('.capabilities-outlet')).toHaveAttribute('inert')
    expect(listRoles).toHaveBeenCalledOnce()
    const hiddenDraft = screen.queryByDisplayValue('待保存角色')
    if (hiddenDraft) expect(hiddenDraft).not.toBeVisible()
    await act(async () => rejectUpdate(new ApiError('角色更新失败', 503, 'service_unavailable')))
    await act(async () => resolveCapabilities(roleCapabilities))

    expect(await screen.findByRole('alert')).toHaveTextContent('系统服务暂时不可用')
    expect(screen.getByLabelText('角色名称 *')).toHaveValue('待保存角色')
    await waitFor(() => expect(listRoles).toHaveBeenCalledTimes(2))
  })

  // MFA 请求和角色表单由页面宿主持有；遮罩隐藏时验证码与验证流程都应暂停但保留。
  it('权限刷新期间保留 MFA 请求、验证码输入和表单草稿', async () => {
    useSessionStore.setState({ user: { id: 'user-1', username: 'role-admin', displayName: '管理员', role: 'admin' }, isHydrated: true, authRevision: 1 })
    const role = { id: 'role-1', code: 'operator', name: '原角色', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    let resolveCapabilities!: (value: NativeCapabilities) => void
    const pendingCapabilities = new Promise<NativeCapabilities>((resolve) => { resolveCapabilities = resolve })
    const capabilities = vi.spyOn(apiClient, 'getCapabilities').mockImplementation(() => useSessionStore.getState().authRevision === 1 ? Promise.resolve(roleCapabilities) : pendingCapabilities)
    const listRoles = vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    const update = vi.spyOn(apiClient, 'updateRole')
      .mockRejectedValueOnce(new ApiError('需要 MFA 二次验证', 403, 'mfa_step_up_required'))
      .mockResolvedValue(role)
    vi.spyOn(apiClient, 'beginMfaStepUp').mockResolvedValue({ challengeId: 'challenge-1', clientId: 'web', expiresAt: '2030-01-01T00:00:00Z' })
    const verify = vi.spyOn(apiClient, 'verifyMfaStepUp').mockResolvedValue({ accessToken: 'aal2-token', expiresIn: 300, authenticationLevel: 'AAL2', amr: 'otp' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/roles']}><Routes>
      <Route element={<CapabilitiesBoundary />}>
        <Route path="/roles" element={<CapabilityPage path="/roles"><RolesPage /></CapabilityPage>} />
      </Route>
    </Routes></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('原角色')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('角色名称 *'), { target: { value: 'MFA 草稿角色' } })
    fireEvent.click(screen.getByRole('button', { name: '保存角色' }))
    const codeField = await screen.findByLabelText('验证码或恢复码 *')
    fireEvent.change(codeField, { target: { value: '123456' } })

    act(() => useSessionStore.setState({ authRevision: 2 }))
    await waitFor(() => expect(capabilities.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(document.querySelector('.capabilities-outlet')).toHaveAttribute('inert')
    expect(document.body.style.overflow).not.toBe('hidden')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(listRoles).toHaveBeenCalledOnce()

    await act(async () => resolveCapabilities(roleCapabilities))
    await waitFor(() => expect(listRoles).toHaveBeenCalledTimes(2))
    expect(await screen.findByLabelText('验证码或恢复码 *')).toHaveValue('123456')
    expect(screen.getByLabelText('角色名称 *')).toHaveValue('MFA 草稿角色')
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))

    await waitFor(() => expect(verify).toHaveBeenCalledWith('challenge-1', '123456'))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(screen.queryByLabelText('角色名称 *')).not.toBeInTheDocument()
    expect(document.body.style.overflow).not.toBe('hidden')
    await waitFor(() => expect(listRoles).toHaveBeenCalledTimes(3))
  })

  // 新能力不再允许访问角色页时，旧表单和旧列表必须销毁，不能随刷新恢复。
  it('权限被撤销后不再显示旧角色页面', async () => {
    useSessionStore.setState({ user: { id: 'user-1', username: 'role-admin', displayName: '管理员', role: 'admin' }, isHydrated: true, authRevision: 1 })
    const role = { id: 'role-1', code: 'operator', name: '原角色', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    const revokedCapabilities: NativeCapabilities = { permissions: [], resources: { ...roleCapabilities.resources, role: false } }
    let resolveCapabilities!: (value: NativeCapabilities) => void
    const pendingCapabilities = new Promise<NativeCapabilities>((resolve) => { resolveCapabilities = resolve })
    const capabilities = vi.spyOn(apiClient, 'getCapabilities').mockImplementation(() => useSessionStore.getState().authRevision === 1 ? Promise.resolve(roleCapabilities) : pendingCapabilities)
    const listRoles = vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/roles']}><Routes>
      <Route element={<CapabilitiesBoundary />}>
        <Route path="/roles" element={<CapabilityPage path="/roles"><RolesPage /></CapabilityPage>} />
      </Route>
    </Routes></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('原角色')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('角色名称 *'), { target: { value: '不可再显示的草稿' } })
    act(() => useSessionStore.setState({ authRevision: 2 }))
    await waitFor(() => expect(capabilities.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(document.querySelector('.capabilities-outlet')).toHaveAttribute('inert')
    expect(listRoles).toHaveBeenCalledOnce()

    await act(async () => resolveCapabilities(revokedCapabilities))
    expect(await screen.findByRole('heading', { name: '当前账号无权访问此页面' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('不可再显示的草稿')).not.toBeInTheDocument()
    expect(screen.queryByText('原角色')).not.toBeInTheDocument()
  })

  // 登出会卸载管理外壳；同名账号重新登录也必须先拿到新会话权限。
  it('同名账号重新登录期间不复用旧权限和旧页面', async () => {
    useSessionStore.setState({ user: { id: 'user-1', username: 'role-admin', displayName: '管理员', role: 'admin' }, isHydrated: true, authRevision: 1 })
    const noRoleCapabilities: NativeCapabilities = { permissions: [], resources: { ...roleCapabilities.resources, role: false } }
    const role = { id: 'role-1', code: 'operator', name: '旧会话角色', enabled: true, dataScope: 'ALL', deptScope: null, permissions: [] }
    let resolveCapabilities!: (value: NativeCapabilities) => void
    const pendingCapabilities = new Promise<NativeCapabilities>((resolve) => { resolveCapabilities = resolve })
    const capabilities = vi.spyOn(apiClient, 'getCapabilities').mockImplementation(() => {
      return useSessionStore.getState().authRevision === 1 ? Promise.resolve(roleCapabilities) : pendingCapabilities
    })
    vi.spyOn(apiClient, 'listRoles').mockResolvedValue([role])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const routes = <Route element={<CapabilitiesBoundary />}><Route path="/roles" element={<CapabilityPage path="/roles"><RolesPage /></CapabilityPage>} /></Route>
    const view = render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/roles']}><Routes>{routes}</Routes></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('旧会话角色')).toBeInTheDocument()
    act(() => useSessionStore.setState({ user: null, authRevision: 2 }))
    expect(screen.queryByText('旧会话角色')).not.toBeInTheDocument()
    view.unmount()

    useSessionStore.setState({ user: { id: 'user-2', username: 'role-admin', displayName: '管理员乙', role: 'operator' }, isHydrated: true, authRevision: 3 })
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/roles']}><Routes>{routes}</Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('正在读取账号权限')).toBeInTheDocument()
    expect(screen.queryByText('旧会话角色')).not.toBeInTheDocument()

    await act(async () => resolveCapabilities(noRoleCapabilities))
    expect(await screen.findByRole('heading', { name: '当前账号无权访问此页面' })).toBeInTheDocument()
    expect(screen.queryByText('旧会话角色')).not.toBeInTheDocument()
  })
})
