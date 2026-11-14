import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartmentsPage } from './DepartmentsPage'
import { apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><DepartmentsPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('DepartmentsPage', () => {
  it('按组织层级显示根部门和子部门', async () => {
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([
      { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'HQ', name: '总部', sortOrder: 1, enabled: true },
      { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', code: 'OPS', name: '运营部', sortOrder: 1, enabled: true },
    ])
    renderPage()
    expect(await screen.findByText('总部')).toBeInTheDocument()
    expect(screen.getByText('运营部')).toBeInTheDocument()
    expect(screen.getByText('OPS')).toBeInTheDocument()
  })
})
