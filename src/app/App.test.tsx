import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth } from './App'
import { useSessionStore } from '../shared/state/session'
import { AdminShell } from '../widgets/layout/AdminShell'
import { apiClient } from '../shared/api/client'
import type { useCapabilities } from '../shared/auth/useCapabilities'
import type { NativeCapabilities } from '../shared/api/schemas'
import { CapabilityPage, DefaultCapabilityPage } from '../shared/auth/CapabilitiesRoutes'

function LoginRedirectProbe() {
  const location = useLocation()
  return <output data-testid="login-return-location">{JSON.stringify(location.state?.from)}</output>
}

afterEach(() => {
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, message: null, authRevision: 0 })
})

const capabilities: NativeCapabilities = {
  permissions: ['user:read'],
  resources: {
    user: true, department: false, role: false, post: false, menu: false, config: false,
    dictionary: false, notice: false, job: false, audit: false, session: false,
    'api-key': false, profile: false,
  },
}
const noPageCapabilities: NativeCapabilities = {
  permissions: [],
  resources: {
    user: false, department: false, role: false, post: false, menu: false, config: false,
    dictionary: false, notice: false, job: false, audit: false, session: false,
    'api-key': false, profile: false,
  },
}

function capabilityQuery(data: NativeCapabilities, isError = false): ReturnType<typeof useCapabilities> {
  return { data, isError, isFetching: false, isLoading: false, refetch: vi.fn() } as unknown as ReturnType<typeof useCapabilities>
}

describe('RequireAuth', () => {
  // 未登录访问筛选深链时，守卫把完整站内地址交给登录页。
  it('重定向到登录页时保留路径、查询参数和锚点', () => {
    useSessionStore.setState({ user: null, isHydrated: true })

    render(
      <MemoryRouter initialEntries={['/dictionaries?dictionaries_keyword=notice#results']}>
        <Routes>
          <Route path="/login" element={<LoginRedirectProbe />} />
          <Route element={<RequireAuth />}>
            <Route path="*" element={<div>受保护页面</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('login-return-location')).toHaveTextContent(
      JSON.stringify({ pathname: '/dictionaries', search: '?dictionaries_keyword=notice', hash: '#results' }),
    )
  })

  it.each([
    {
      label: '能力读取失败', path: '/users', query: capabilityQuery(capabilities, true),
      route: <Route path="/users" element={<div>用户页面</div>} />, expected: '无法读取账号权限',
    },
    {
      label: '没有可访问页面', path: '/', query: capabilityQuery(noPageCapabilities),
      route: <Route index element={<DefaultCapabilityPage />} />, expected: '当前账号没有可访问的管理页面',
    },
    {
      label: '无权访问深链', path: '/roles', query: capabilityQuery(capabilities),
      route: <Route path="/roles" element={<CapabilityPage path="/roles"><div>角色页面</div></CapabilityPage>} />, expected: '当前账号无权访问此页面',
    },
  ])('$label 时仍可退出，清除会话后返回登录页', async ({ path, query, route, expected }) => {
    useSessionStore.setState({ user: { id: '', username: 'limited', displayName: '只读用户', role: '审计员' }, isHydrated: true, authRevision: 2 })
    vi.spyOn(apiClient, 'logout').mockResolvedValue()
    vi.spyOn(apiClient, 'listNotificationsPage').mockResolvedValue({ items: [], unreadCount: 0, page: 1, hasMore: false })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<div>登录页面</div>} />
            <Route element={<RequireAuth />}>
              <Route element={<AdminShell capabilitiesQuery={query} />}>
                {route}
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: expected })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    expect(await screen.findByText('登录页面')).toBeInTheDocument()
    expect(useSessionStore.getState().user).toBeNull()
    expect(apiClient.logout).toHaveBeenCalledOnce()
  })
})
