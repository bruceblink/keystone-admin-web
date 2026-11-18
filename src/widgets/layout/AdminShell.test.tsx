import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AdminShell } from './AdminShell'
import { apiClient } from '../../shared/api/client'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
    listNotificationsPage: vi.fn().mockResolvedValue({ items: [], unreadCount: 0, page: 1, hasMore: false }),
    readNotification: vi.fn(),
  },
}))

vi.mock('../../shared/state/session', () => ({
  useSessionStore: (selector: (state: { user: { username: string; displayName: string; role: string }; logout: () => Promise<void> }) => unknown) => selector({
    user: { username: 'operator', displayName: 'operator', role: '管理员' },
    logout: async () => undefined,
  }),
}))

describe('AdminShell', () => {
  it('keeps the Keystone context separator without the removed workbench title', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminShell />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(container.querySelector('.topbar-context .context-kicker')).toHaveTextContent('Keystone')
    expect(container.querySelector('.topbar-context .context-separator')).toHaveTextContent('/')
    expect(container.querySelector('.topbar-context')).not.toHaveTextContent('管理工作台')
    expect(container.querySelector('.logout-button')).toHaveAttribute('aria-label', '退出')
  })

  it('读取当前账号的通知并在查看时标记已读', async () => {
    const notice = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', type: 'api_key.created', title: '密钥已签发', content: '测试密钥已签发。', createdAt: '2026-11-18T01:00:00Z', readAt: null }
    let read = false
    vi.mocked(apiClient.listNotificationsPage).mockImplementation(async (page) => ({ items: [{ ...notice, readAt: read ? '2026-11-18T01:01:00Z' : null }], unreadCount: read ? 0 : 1, page, hasMore: false }))
    vi.mocked(apiClient.readNotification).mockImplementation(async () => { read = true; return { ...notice, readAt: '2026-11-18T01:01:00Z' } })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><AdminShell /></MemoryRouter></QueryClientProvider>)

    fireEvent.click(await screen.findByRole('button', { name: '通知，1 条未读' }))
    fireEvent.click(await screen.findByRole('button', { name: /密钥已签发/ }))
    expect(await screen.findByText('测试密钥已签发。')).toBeInTheDocument()
    await waitFor(() => expect(apiClient.readNotification).toHaveBeenCalledWith(notice.id))
    fireEvent.click(screen.getByRole('button', { name: '返回通知列表' }))
    await waitFor(() => expect(screen.queryByText(/未读/)).not.toBeInTheDocument())
  })

  it('已读请求返回网络错误后，即使刷新结果已标记已读仍可重试', async () => {
    const notice = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', type: 'api_key.created', title: '密钥已签发', content: '测试通知。', createdAt: '2026-11-18T01:00:00Z', readAt: null }
    vi.mocked(apiClient.listNotificationsPage).mockResolvedValue({ items: [notice], unreadCount: 1, page: 1, hasMore: false })
    vi.mocked(apiClient.readNotification).mockReset()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ...notice, readAt: '2026-11-18T01:01:00Z' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><AdminShell /></MemoryRouter></QueryClientProvider>)

    fireEvent.click(await screen.findByRole('button', { name: '通知，1 条未读' }))
    fireEvent.click(await screen.findByRole('button', { name: /密钥已签发/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法标记已读')
    queryClient.setQueryData(['notifications', 'operator', 1], { items: [{ ...notice, readAt: '2026-11-18T01:01:00Z' }], unreadCount: 0, page: 1, hasMore: false })
    await waitFor(() => expect(screen.getByRole('button', { name: '通知' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(apiClient.readNotification).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('通知已移除时可从详情刷新并回到最新列表', async () => {
    const notice = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', type: 'api_key.created', title: '已移除的通知', content: '原通知内容。', createdAt: '2026-11-18T01:00:00Z', readAt: null }
    vi.mocked(apiClient.listNotificationsPage).mockResolvedValue({ items: [notice], unreadCount: 1, page: 1, hasMore: false })
    vi.mocked(apiClient.readNotification).mockReset().mockRejectedValue(new Error('not found'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><AdminShell /></MemoryRouter></QueryClientProvider>)

    fireEvent.click(await screen.findByRole('button', { name: '通知，1 条未读' }))
    fireEvent.click(await screen.findByRole('button', { name: /已移除的通知/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法标记已读')
    vi.mocked(apiClient.listNotificationsPage).mockResolvedValue({ items: [], unreadCount: 0, page: 1, hasMore: false })
    fireEvent.click(screen.getByRole('button', { name: '刷新通知列表' }))
    expect(await screen.findByText('暂无站内通知')).toBeInTheDocument()
    expect(screen.queryByText('原通知内容。')).not.toBeInTheDocument()
  })

  it('通知列表可翻页，并在翻页后继续显示通知详情', async () => {
    const first = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', type: 'api_key.created', title: '第一页通知', content: '第一页内容。', createdAt: '2026-11-18T01:00:00Z', readAt: '2026-11-18T01:01:00Z' }
    const second = { ...first, id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', title: '第二页通知', content: '第二页内容。' }
    vi.mocked(apiClient.readNotification).mockReset()
    vi.mocked(apiClient.listNotificationsPage).mockImplementation(async (page) => ({ items: [page === 1 ? first : second], unreadCount: 3, page, hasMore: page === 1 }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><AdminShell /></MemoryRouter></QueryClientProvider>)

    fireEvent.click(await screen.findByRole('button', { name: '通知，3 条未读' }))
    expect(await screen.findByRole('button', { name: /第一页通知/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByRole('button', { name: /第二页通知/ })).toBeInTheDocument()
    await waitFor(() => expect(apiClient.listNotificationsPage).toHaveBeenLastCalledWith(2))

    fireEvent.click(screen.getByRole('button', { name: /第二页通知/ }))
    expect(await screen.findByText('第二页内容。')).toBeInTheDocument()
    expect(apiClient.readNotification).not.toHaveBeenCalled()
  })

  it('翻页加载期间保留铃铛未读数量和提示点，并在结果返回后更新', async () => {
    const first = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', type: 'api_key.created', title: '第一页未读通知', content: '第一页内容。', createdAt: '2026-11-18T01:00:00Z', readAt: null }
    const second = { ...first, id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', title: '第二页通知', content: '第二页内容。', readAt: '2026-11-18T01:01:00Z' }
    let resolveSecondPage!: (result: Awaited<ReturnType<typeof apiClient.listNotificationsPage>>) => void
    vi.mocked(apiClient.listNotificationsPage).mockImplementation((page) => page === 1
      ? Promise.resolve({ items: [first], unreadCount: 5, page: 1, hasMore: true })
      : new Promise((resolve) => { resolveSecondPage = resolve }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><AdminShell /></MemoryRouter></QueryClientProvider>)

    const bell = await screen.findByRole('button', { name: '通知，5 条未读' })
    expect(bell.querySelector('.notification-dot')).toBeInTheDocument()
    fireEvent.click(bell)
    expect(await screen.findByRole('button', { name: /第一页未读通知/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(resolveSecondPage).toBeDefined())

    expect(screen.getByRole('button', { name: '通知，5 条未读' })).toHaveClass('icon-button')
    expect(screen.getByRole('button', { name: '通知，5 条未读' }).querySelector('.notification-dot')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('正在读取通知')

    await act(async () => resolveSecondPage({ items: [second], unreadCount: 4, page: 2, hasMore: false }))
    expect(await screen.findByRole('button', { name: '通知，4 条未读' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '通知，4 条未读' }).querySelector('.notification-dot')).toBeInTheDocument()
  })

  it('翻页读取失败时显示重试并允许返回上一页', async () => {
    const notice = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', type: 'api_key.created', title: '当前通知', content: '内容。', createdAt: '2026-11-18T01:00:00Z', readAt: '2026-11-18T01:01:00Z' }
    vi.mocked(apiClient.listNotificationsPage).mockImplementation(async (page) => {
      if (page === 2) throw new Error('page failed')
      return { items: [notice], unreadCount: 0, page: 1, hasMore: true }
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><AdminShell /></MemoryRouter></QueryClientProvider>)

    fireEvent.click(await screen.findByRole('button', { name: '通知' }))
    expect(await screen.findByRole('button', { name: /当前通知/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取站内通知')
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '上一页' }))
    expect(await screen.findByRole('button', { name: /当前通知/ })).toBeInTheDocument()
    expect(screen.getByText('第 1 页')).toBeInTheDocument()
  })
})
