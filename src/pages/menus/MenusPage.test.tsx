import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenusPage } from './MenusPage'
import { apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MenusPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('MenusPage', () => {
  it('显示菜单树和权限标识', async () => {
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{
      menu: { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true },
      children: [{
        menu: { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'system:user', name: '用户管理', path: '/users', component: 'UsersPage', menuType: 'MENU', permission: 'user:read', sortOrder: 1, enabled: true },
        children: [],
      }],
    }])
    renderPage()
    expect(await screen.findByText('系统管理')).toBeInTheDocument()
    expect(screen.getByText('用户管理')).toBeInTheDocument()
    expect(screen.getByText('user:read')).toBeInTheDocument()
  })

  it('确认后删除菜单', async () => {
    const menu = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'system', name: '系统管理', path: '/system', component: 'SystemLayout', menuType: 'MENU', permission: null, sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listMenus').mockResolvedValue([{ menu, children: [] }])
    const deleteMenu = vi.spyOn(apiClient, 'deleteMenu').mockResolvedValue({ deleted: true })
    renderPage()

    await screen.findByText('系统管理')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('删除后不可恢复')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteMenu).toHaveBeenCalledWith(menu.id))
  })
})
