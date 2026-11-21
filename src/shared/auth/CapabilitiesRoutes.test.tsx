import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { useSessionStore } from '../state/session'
import { useCapabilities } from './useCapabilities'
import { CapabilitiesBoundary, CapabilityPage, DefaultCapabilityPage } from './CapabilitiesRoutes'

/** 通过页面状态验证权限路由、重试及账号缓存隔离。 */
const capabilities = {
  permissions: ['user:read'],
  resources: {
    user: true, department: false, role: false, post: false, menu: false, config: false,
    dictionary: false, notice: false, job: false, audit: false, session: false,
    'api-key': false, profile: false,
  },
}

function renderRoutes(initialPath: string, routes: ReactNode, state?: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[state === undefined ? initialPath : { pathname: initialPath, state }]}><Routes>{routes}</Routes></MemoryRouter>
    </QueryClientProvider>,
  )
}

function CapabilityProbe() {
  const query = useCapabilities()
  return <output>{query.data?.permissions.join(',') ?? (query.isError ? '读取失败' : '正在读取')}</output>
}

afterEach(() => {
  vi.restoreAllMocks()
  focusManager.setFocused(undefined)
  useSessionStore.setState({ user: null, isHydrated: false, message: null, authRevision: 0 })
})

describe('CapabilitiesRoutes', () => {
  it('无权限直达路由时显示拒绝状态，并可前往首个可访问页面', async () => {
    useSessionStore.setState({ user: { id: '', username: 'limited', displayName: '只读用户', role: '审计员' }, isHydrated: true, authRevision: 3 })
    vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue(capabilities)
    renderRoutes('/roles', (
      <Route element={<CapabilitiesBoundary />}>
        <Route path="/roles" element={<CapabilityPage path="/roles"><div>角色页面</div></CapabilityPage>} />
        <Route path="/users" element={<div>用户页面</div>} />
      </Route>
    ))

    expect(await screen.findByRole('heading', { name: '当前账号无权访问此页面' })).toBeInTheDocument()
    expect(screen.getByText(/无法打开“角色管理”/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开首个可访问页面' }))
    expect(await screen.findByText('用户页面')).toBeInTheDocument()
  })

  it('根路径跳转到第一个可访问页面', async () => {
    useSessionStore.setState({ user: { id: '', username: 'limited', displayName: '只读用户', role: '审计员' }, isHydrated: true, authRevision: 4 })
    vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue(capabilities)
    renderRoutes('/', (
      <Route element={<CapabilitiesBoundary />}>
        <Route index element={<DefaultCapabilityPage />} />
        <Route path="/users" element={<div>用户页面</div>} />
      </Route>
    ))

    expect(await screen.findByText('用户页面')).toBeInTheDocument()
  })

  it('登录返回地址无权访问时自动进入首个可访问页面', async () => {
    useSessionStore.setState({ user: { id: '', username: 'limited', displayName: '只读用户', role: '审计员' }, isHydrated: true, authRevision: 9 })
    vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue(capabilities)
    renderRoutes('/roles', (
      <Route element={<CapabilitiesBoundary />}>
        <Route path="/roles" element={<CapabilityPage path="/roles"><div>角色页面</div></CapabilityPage>} />
        <Route path="/users" element={<div>用户页面</div>} />
      </Route>
    ), 'after-authentication')

    expect(await screen.findByText('用户页面')).toBeInTheDocument()
    expect(screen.queryByText('角色页面')).not.toBeInTheDocument()
  })

  it('能力接口失败时不开放页面，重试成功后恢复', async () => {
    useSessionStore.setState({ user: { id: '', username: 'limited', displayName: '只读用户', role: '审计员' }, isHydrated: true, authRevision: 5 })
    const fetchCapabilities = vi.spyOn(apiClient, 'getCapabilities')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(capabilities)
    renderRoutes('/users', (
      <Route element={<CapabilitiesBoundary />}>
        <Route path="/users" element={<div>用户页面</div>} />
      </Route>
    ))

    expect(await screen.findByRole('heading', { name: '无法读取账号权限' })).toBeInTheDocument()
    expect(screen.queryByText('用户页面')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('用户页面')).toBeInTheDocument()
    expect(fetchCapabilities).toHaveBeenCalledTimes(2)
  })

  it('切换账号时不复用前一账号的能力缓存', async () => {
    useSessionStore.setState({ user: { id: '', username: 'account-a', displayName: '账号 A', role: 'A' }, isHydrated: true, authRevision: 6 })
    let resolveSecond!: (value: typeof capabilities) => void
    const fetchCapabilities = vi.spyOn(apiClient, 'getCapabilities')
      .mockResolvedValueOnce(capabilities)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><CapabilityProbe /></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('user:read')).toBeInTheDocument()
    act(() => useSessionStore.setState({ user: { id: '', username: 'account-b', displayName: '账号 B', role: 'B' }, authRevision: 7 }))
    expect(await screen.findByText('正在读取')).toBeInTheDocument()
    expect(screen.queryByText('user:read')).not.toBeInTheDocument()
    await act(async () => resolveSecond({ ...capabilities, permissions: ['role:read'] }))
    expect(await screen.findByText('role:read')).toBeInTheDocument()
    expect(fetchCapabilities).toHaveBeenCalledTimes(2)
  })

  it('浏览器恢复焦点时重新从服务端读取权限', async () => {
    useSessionStore.setState({ user: { id: '', username: 'account-a', displayName: '账号 A', role: 'A' }, isHydrated: true, authRevision: 8 })
    const fetchCapabilities = vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue(capabilities)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><CapabilityProbe /></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('user:read')).toBeInTheDocument()
    act(() => focusManager.setFocused(false))
    act(() => focusManager.setFocused(true))
    await waitFor(() => expect(fetchCapabilities).toHaveBeenCalledTimes(2))
  })

  // 权限刷新期间把焦点移到状态提示，恢复后返回原有页面控件。
  it('权限重新确认完成后恢复页面焦点', async () => {
    useSessionStore.setState({ user: { id: '', username: 'account-a', displayName: '账号 A', role: 'A' }, isHydrated: true, authRevision: 10 })
    let resolveRefresh!: (value: typeof capabilities) => void
    const pendingRefresh = new Promise<typeof capabilities>((resolve) => { resolveRefresh = resolve })
    const fetchCapabilities = vi.spyOn(apiClient, 'getCapabilities')
      .mockResolvedValueOnce(capabilities)
      .mockImplementationOnce(() => pendingRefresh)
    renderRoutes('/users', (
      <Route element={<CapabilitiesBoundary />}>
        <Route path="/users" element={<button type="button">用户筛选框</button>} />
      </Route>
    ))

    const filter = await screen.findByRole('button', { name: '用户筛选框' })
    filter.focus()
    expect(filter).toHaveFocus()
    act(() => useSessionStore.setState({ authRevision: 11 }))
    await waitFor(() => expect(fetchCapabilities).toHaveBeenCalledTimes(2))
    expect(document.querySelector('.capability-status-page')).toHaveFocus()

    await act(async () => resolveRefresh(capabilities))
    await waitFor(() => expect(filter).toHaveFocus())
  })
})
