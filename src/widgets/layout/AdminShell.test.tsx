import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AdminShell } from './AdminShell'

vi.mock('../../shared/api/client', () => ({
  apiClient: { listPublicNotices: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../../shared/state/session', () => ({
  useSessionStore: (selector: (state: { user: { displayName: string; role: string }; logout: () => Promise<void> }) => unknown) => selector({
    user: { displayName: 'operator', role: '管理员' },
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
})
