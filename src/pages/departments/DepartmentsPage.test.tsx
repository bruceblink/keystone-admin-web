import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('通过模态框提交新增组织', async () => {
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([])
    const createDepartment = vi.spyOn(apiClient, 'createDepartment').mockResolvedValue({ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: null, code: 'OPS', name: '运营部', sortOrder: 1, enabled: true })
    renderPage()
    await screen.findByText('没有匹配的组织')
    fireEvent.click(screen.getByRole('button', { name: /新增组织/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('组织编码 *'), { target: { value: 'OPS' } })
    fireEvent.change(within(dialog).getByLabelText('组织名称 *'), { target: { value: '运营部' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存组织' }))
    await waitFor(() => expect(createDepartment).toHaveBeenCalledWith({ code: 'OPS', name: '运营部', parentId: null, sortOrder: 1, enabled: true }))
  })
})
