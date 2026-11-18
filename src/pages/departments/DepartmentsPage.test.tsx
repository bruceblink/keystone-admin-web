import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartmentsPage } from './DepartmentsPage'
import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import type { NativeCapabilities } from '../../shared/api/schemas'
import { useSessionStore } from '../../shared/state/session'

const allDepartmentCapabilities: NativeCapabilities = {
  permissions: ['department:read', 'department:create', 'department:update', 'department:delete'],
  resources: {
    user: true, department: true, role: true, post: true, menu: true, config: true,
    dictionary: true, notice: true, job: true, audit: true, session: true,
    'api-key': true, profile: true,
  },
}

function renderPage(permissions = allDepartmentCapabilities.permissions, departmentScope = true) {
  useSessionStore.setState({ user: { id: 'test-user', username: 'department-operator', displayName: '组织管理员', role: 'operator' }, isHydrated: true, authRevision: 4 })
  vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue({
    ...allDepartmentCapabilities,
    permissions,
    resources: { ...allDepartmentCapabilities.resources, department: departmentScope },
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<BrowserRouter><QueryClientProvider client={queryClient}><DepartmentsPage /></QueryClientProvider></BrowserRouter>)
}

afterEach(() => {
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, authRevision: 0 })
  window.history.replaceState({}, '', '/')
})

describe('DepartmentsPage', () => {
  it('从 URL 恢复组织树筛选条件并同步查询参数', async () => {
    window.history.replaceState({}, '', '/departments?departments_keyword=OPS')
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([])
    renderPage()

    expect(screen.getByLabelText('组织名称或编码')).toHaveValue('OPS')
    fireEvent.change(screen.getByLabelText('组织名称或编码'), { target: { value: 'HQ' } })
    fireEvent.submit(screen.getByRole('button', { name: '查询' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(window.location.search).toContain('departments_keyword=HQ'))
  })

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

  it('只读取组织权限时保留查询，但隐藏所有写入口', async () => {
    const department = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: null, code: 'OPS', name: '运营部', sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([department])
    const createDepartment = vi.spyOn(apiClient, 'createDepartment')
    const updateDepartment = vi.spyOn(apiClient, 'updateDepartment')
    const deleteDepartment = vi.spyOn(apiClient, 'deleteDepartment')
    renderPage(['department:read'])

    expect(await screen.findByText('运营部')).toBeInTheDocument()
    expect(screen.getByLabelText('组织名称或编码')).toBeEnabled()
    expect(screen.queryByRole('button', { name: '新增组织' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument()
    expect(createDepartment).not.toHaveBeenCalled()
    expect(updateDepartment).not.toHaveBeenCalled()
    expect(deleteDepartment).not.toHaveBeenCalled()
  })

  it('有读取和新增权限时仅显示新增，并且不会请求部门导出', async () => {
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([])
    const createDepartment = vi.spyOn(apiClient, 'createDepartment').mockResolvedValue({ id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: null, code: 'OPS', name: '运营部', sortOrder: 1, enabled: true })
    const updateDepartment = vi.spyOn(apiClient, 'updateDepartment')
    const deleteDepartment = vi.spyOn(apiClient, 'deleteDepartment')
    renderPage(['department:read', 'department:create'])

    await screen.findByText('没有匹配的组织')
    expect(screen.getByRole('button', { name: '新增组织' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '导出 Excel' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新增组织' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('组织编码 *'), { target: { value: 'OPS' } })
    fireEvent.change(within(dialog).getByLabelText('组织名称 *'), { target: { value: '运营部' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存组织' }))

    await waitFor(() => expect(createDepartment).toHaveBeenCalledWith({ code: 'OPS', name: '运营部', parentId: null, sortOrder: 1, enabled: true }))
    expect(updateDepartment).not.toHaveBeenCalled()
    expect(deleteDepartment).not.toHaveBeenCalled()
  })

  it('department 数据范围不可读时不请求部门列表', async () => {
    const listDepartments = vi.spyOn(apiClient, 'listDepartments')
    renderPage(['department:read', 'department:create'], false)

    await waitFor(() => expect(apiClient.getCapabilities).toHaveBeenCalledOnce())
    expect(listDepartments).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '新增组织' })).not.toBeInTheDocument()
  })

  it('首次读取失败时仍显示列表操作工具栏', async () => {
    vi.spyOn(apiClient, 'listDepartments').mockRejectedValue(new ApiError('服务暂时不可用', 503, 'service_unavailable'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取组织结构')
    expect(screen.getByRole('group', { name: '列表操作' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新增组织/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: '刷新结构' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
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

  it('筛选三级组织时保留全部祖先节点', async () => {
    const root = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', parentId: null, code: 'HQ', name: '总部', sortOrder: 1, enabled: true } as const
    const child = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: root.id, code: 'OPS', name: '运营部', sortOrder: 1, enabled: true } as const
    const grandchild = { id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', parentId: child.id, code: 'AUDIT', name: '审计组', sortOrder: 1, enabled: true } as const
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([root, child, grandchild])
    renderPage()

    await screen.findByText('审计组')
    fireEvent.change(screen.getByLabelText('组织名称或编码'), { target: { value: 'AUDIT' } })
    fireEvent.click(screen.getByRole('button', { name: '查询' }))

    expect(screen.getByText('总部')).toBeInTheDocument()
    expect(screen.getByText('运营部')).toBeInTheDocument()
    expect(screen.getByText('审计组')).toBeInTheDocument()
    expect(screen.getByText('共 3 个组织节点')).toBeInTheDocument()
  })

  it('确认后删除组织', async () => {
    const department = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: null, code: 'OPS', name: '运营部', sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([department])
    const deleteDepartment = vi.spyOn(apiClient, 'deleteDepartment').mockResolvedValue({ deleted: true })
    renderPage()

    await screen.findByText('运营部')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('删除后不可恢复')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(deleteDepartment).toHaveBeenCalledWith(department.id))
  })

  it('组织保存失败时显示业务码诊断并保留表单', async () => {
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([])
    vi.spyOn(apiClient, 'createDepartment').mockRejectedValue(new ApiError('组织已存在', 409, 'resource_conflict', null, { requestId: 'dept-save-1' }))
    renderPage()

    await screen.findByText('没有匹配的组织')
    fireEvent.click(screen.getByRole('button', { name: /新增组织/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('组织编码 *'), { target: { value: 'OPS' } })
    fireEvent.change(within(dialog).getByLabelText('组织名称 *'), { target: { value: '运营部' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存组织' }))

    expect(await within(dialog).findByText(/resource_conflict · 资源状态或唯一约束发生冲突/)).toBeInTheDocument()
    expect(within(dialog).getByText(/requestId=dept-save-1/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('组织名称 *')).toHaveValue('运营部')
  })

  it('服务端拒绝无写入范围的部门时保留编辑内容并显示错误码', async () => {
    const department = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: null, code: 'OPS', name: '运营部', sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([department])
    vi.spyOn(apiClient, 'updateDepartment').mockRejectedValue(new ApiError('没有此部门的数据权限', 403, 'data_scope_denied', null, { requestId: 'dept-scope-1' }))
    renderPage(['department:read', 'department:update'])

    await screen.findByText('运营部')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('组织名称 *'), { target: { value: '改名后的组织' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存组织' }))

    expect(await within(dialog).findByText(/data_scope_denied/)).toBeInTheDocument()
    expect(within(dialog).getByText(/requestId=dept-scope-1/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('组织名称 *')).toHaveValue('改名后的组织')
  })

  it('组织删除失败时显示业务码诊断', async () => {
    const department = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: null, code: 'OPS', name: '运营部', sortOrder: 1, enabled: true }
    vi.spyOn(apiClient, 'listDepartments').mockResolvedValue([department])
    vi.spyOn(apiClient, 'deleteDepartment').mockRejectedValue(new ApiError('组织仍被引用', 409, 'resource_conflict', null, { requestId: 'dept-delete-1' }))
    renderPage()

    await screen.findByText('运营部')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除 1 条' }))

    expect(await within(dialog).findByText(/resource_conflict/)).toBeInTheDocument()
    expect(within(dialog).getByText(/requestId=dept-delete-1/)).toBeInTheDocument()
  })

  it('刷新失败时保留已有组织树并提供重试入口', async () => {
    const department = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', parentId: null, code: 'OPS', name: '运营部', sortOrder: 1, enabled: true }
    const listDepartments = vi.spyOn(apiClient, 'listDepartments')
      .mockResolvedValueOnce([department])
      .mockRejectedValueOnce(new ApiError('服务暂时不可用', 503, 'service_unavailable'))
      .mockResolvedValueOnce([department])
    renderPage()

    expect(await screen.findByText('运营部')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新结构' }))
    expect(await screen.findByText('数据刷新失败')).toBeInTheDocument()
    expect(screen.getByText(/service_unavailable · 服务暂不可用/)).toBeInTheDocument()
    expect(screen.getByText('运营部')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(listDepartments).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByText('数据刷新失败')).not.toBeInTheDocument())
  })
})
