import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeCapabilities } from '../api/schemas'
import { useSessionStore } from '../state/session'
import { CapabilityAvailabilityContext, capabilitiesCacheScope, capabilityScopedQueryKey, sessionCapabilityScope, useCapabilityQuery } from './CapabilityAvailability'

const capabilities: NativeCapabilities = {
  permissions: ['user:read'],
  resources: {
    user: true, department: false, role: false, post: false, menu: false, config: false,
    dictionary: false, notice: false, job: false, audit: false, session: false,
    'api-key': false, profile: false,
  },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

function ScopedRows({ loadRows }: { loadRows: () => Promise<string[]> }) {
  const query = useCapabilityQuery({ queryKey: ['scope-test-rows'], queryFn: loadRows, staleTime: 60_000 })
  return <output>{query.data?.join(',') ?? '正在读取记录'}</output>
}

afterEach(() => {
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, message: null, authRevision: 0 })
})

describe('权限版本隔离的资源查询', () => {
  it('权限内容相同但重新确认数据范围后重新查询，并忽略旧请求的迟到结果', async () => {
    useSessionStore.setState({
      user: { id: 'scope-user', username: 'scope-admin', displayName: '范围管理员', role: 'admin' },
      isHydrated: true,
      authRevision: 7,
    })

    const oldRows = deferred<string[]>()
    const narrowedRows = deferred<string[]>()
    const loadRows = vi.fn()
      .mockImplementationOnce(() => oldRows.promise)
      .mockImplementationOnce(() => narrowedRows.promise)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })

    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <CapabilityAvailabilityContext.Provider value={{ available: true, cacheScope: capabilitiesCacheScope(capabilities, 100) }}>
          <ScopedRows loadRows={loadRows} />
        </CapabilityAvailabilityContext.Provider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(loadRows).toHaveBeenCalledTimes(1))

    // 服务端可在权限响应内容不变时收窄数据范围；新的确认时间必须隔离旧资源查询键。
    rendered.rerender(
      <QueryClientProvider client={queryClient}>
        <CapabilityAvailabilityContext.Provider value={{ available: true, cacheScope: capabilitiesCacheScope(capabilities, 200) }}>
          <ScopedRows loadRows={loadRows} />
        </CapabilityAvailabilityContext.Provider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(loadRows).toHaveBeenCalledTimes(2))
    await act(async () => narrowedRows.resolve(['仅当前范围可见的记录']))
    expect(await screen.findByText('仅当前范围可见的记录')).toBeInTheDocument()

    // 旧授权请求在新范围结果之后返回时，只能落入已隔离的旧缓存键。
    await act(async () => oldRows.resolve(['旧范围记录']))
    expect(screen.getByText('仅当前范围可见的记录')).toBeInTheDocument()
    expect(screen.queryByText('旧范围记录')).not.toBeInTheDocument()
    const currentKey = capabilityScopedQueryKey(
      ['scope-test-rows'],
      sessionCapabilityScope('scope-admin', 7, capabilitiesCacheScope(capabilities, 200)),
    )
    expect(queryClient.getQueryData(currentKey)).toEqual(['仅当前范围可见的记录'])
    rendered.unmount()
  })
})
