import { useEffect, useMemo, useState } from 'react'
import { Building2, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCapabilityQuery } from '../../shared/auth/CapabilityAvailability'
import { apiClient } from '../../shared/api/client'
import { formatApiError } from '../../shared/api/errors'
import { useCapabilities } from '../../shared/auth/useCapabilities'
import type { NativeCapabilities, NativeDepartment, NativeDepartmentWriteInput } from '../../shared/api/schemas'
import { InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, ListToolbar, Spinner, StaleQueryError } from '../../shared/ui'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'
import { DepartmentFormModal } from './DepartmentFormModal'

type DepartmentRow = NativeDepartment & { level: number }
const urlDefaults = { keyword: '' }
const urlOptions = { namespace: 'departments' }

export function DepartmentsPage() {
  const capabilitiesQuery = useCapabilities()
  const capabilities = capabilitiesQuery.data
  const canReadDepartments = capabilities?.resources.department === true
    && hasPermission(capabilities, 'department:read')
  const canCreateDepartment = canReadDepartments && hasPermission(capabilities, 'department:create')
  const canUpdateDepartment = canReadDepartments && hasPermission(capabilities, 'department:update')
  const canDeleteDepartment = canReadDepartments && hasPermission(capabilities, 'department:delete')
  const queryClient = useQueryClient()
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { keyword: appliedKeyword } = urlState
  const [keyword, setKeyword] = useState(appliedKeyword)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingDepartment, setEditingDepartment] = useState<NativeDepartment | null>(null)
  const [deletingDepartment, setDeletingDepartment] = useState<NativeDepartment | null>(null)
  const query = useCapabilityQuery({ queryKey: ['departments'], queryFn: () => apiClient.listDepartments(), staleTime: 10_000, enabled: canReadDepartments })
  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: NativeDepartmentWriteInput }) => id ? apiClient.updateDepartment(id, input) : apiClient.createDepartment(input),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['departments'] }); setModalMode(null); setEditingDepartment(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteDepartment(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['departments'] })
      setDeletingDepartment(null)
    },
  })
  useEffect(() => {
    setKeyword(appliedKeyword)
  }, [appliedKeyword])

  useEffect(() => {
    if (!canDeleteDepartment) setDeletingDepartment(null)
  }, [canDeleteDepartment])
  const rows = useMemo(() => {
    const allRows = flattenDepartments(query.data ?? [])
    const normalized = appliedKeyword.toLocaleLowerCase()
    if (!normalized) return allRows
    const byId = new Map(allRows.map((row) => [row.id, row]))
    const matchingRows = allRows.filter((row) => `${row.code} ${row.name}`.toLocaleLowerCase().includes(normalized))
    const visibleIds = new Set<string>()
    for (const row of matchingRows) {
      // 搜索命中深层组织时保留完整祖先链，避免层级路径断裂。
      let current: DepartmentRow | undefined = row
      const seen = new Set<string>()
      while (current && !seen.has(current.id)) {
        seen.add(current.id)
        visibleIds.add(current.id)
        current = current.parentId ? byId.get(current.parentId) : undefined
      }
    }
    return allRows.filter((row) => visibleIds.has(row.id))
  }, [appliedKeyword, query.data])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ keyword: keyword.trim() }, { history: 'push' })
  }

  function reset() {
    setKeyword('')
    setUrlState(urlDefaults, { history: 'push' })
  }

  function refresh() {
    void query.refetch()
  }
  function openCreate() {
    if (!canCreateDepartment) return
    saveMutation.reset()
    setEditingDepartment(null)
    setModalMode('create')
  }
  function openEdit(department: NativeDepartment) {
    if (!canUpdateDepartment) return
    saveMutation.reset()
    setEditingDepartment(department)
    setModalMode('edit')
  }
  function closeModal() { if (saveMutation.isPending) return; setModalMode(null); setEditingDepartment(null) }
  async function submitDepartment(input: NativeDepartmentWriteInput) {
    if (editingDepartment ? !canUpdateDepartment : !canCreateDepartment) return
    try { await saveMutation.mutateAsync({ id: editingDepartment?.id, input }) } catch { /* 模态框保留错误和用户输入。 */ }
  }
  function openDelete(department: NativeDepartment) {
    if (!canDeleteDepartment) return
    deleteMutation.reset()
    setDeletingDepartment(department)
  }
  function closeDelete() { if (!deleteMutation.isPending) setDeletingDepartment(null) }

  return (
    <div className="departments-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZATION / STRUCTURE</p>
          <h1>组织结构</h1>
          <p className="page-description">按层级查看部门、组织编码和启用状态。新增和编辑在模态框中完成。</p>
        </div>
      </div>

      <Card className="departments-filter-card">
        <form className="departments-filter-form" onSubmit={submit}>
          <label><span>组织名称或编码</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按组织名称或编码筛选" autoComplete="off" /></label>
          <div className="departments-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div>
        </form>
      </Card>

      <Card className="departments-table-card">
        <ListToolbar>
          {canCreateDepartment ? <Button size="sm" onClick={openCreate}><Plus size={15} /> 新增组织</Button> : null}
          <Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新结构</Button>
        </ListToolbar>
        <CardHeader title="组织结构" description={query.data ? `共 ${rows.length.toLocaleString('zh-CN')} 个组织节点` : undefined} action={<Badge tone="info">系统 API</Badge>} />
        {!canReadDepartments && capabilitiesQuery.isLoading ? <div className="loading-panel departments-loading"><Spinner label="正在读取组织权限" /></div> : null}
        {query.isLoading ? <div className="loading-panel departments-loading"><Spinner label="正在读取组织结构" /></div> : null}
        {query.isError && !query.data ? <InitialQueryError title="无法读取组织结构" message="组织结构读取失败，请重试" error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
        {query.isError && query.data ? <StaleQueryError message={formatApiError(query.error, '组织结构刷新失败，请重试')} error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
        {query.data ? <>
        {rows.length > 0 ? <div className="departments-table-wrap"><table className="departments-table"><thead><tr><th scope="col">组织名称</th><th scope="col">组织编码</th><th scope="col">排序</th><th scope="col">状态</th>{canUpdateDepartment || canDeleteDepartment ? <th scope="col">操作</th> : null}</tr></thead><tbody>{rows.map((row) => <DepartmentRow key={row.id} row={row} pending={deleteMutation.isPending} editable={canUpdateDepartment} deletable={canDeleteDepartment} onEdit={openEdit} onDelete={openDelete} />)}</tbody></table></div> : <div className="departments-empty" role="status"><span className="departments-empty-icon"><Building2 size={20} /></span><strong>没有匹配的组织</strong><p>调整筛选条件后重试，或清空筛选条件查看完整组织结构。</p></div>}
        </> : null}
      </Card>
      <DepartmentFormModal open={modalMode !== null} mode={modalMode ?? 'create'} department={editingDepartment} departments={query.data ?? []} pending={saveMutation.isPending} canSubmit={modalMode === 'create' ? canCreateDepartment : modalMode === 'edit' && canUpdateDepartment} error={saveMutation.error} onClose={closeModal} onSubmit={submitDepartment} />
      {canDeleteDepartment ? <DeleteConfirmModal open={deletingDepartment !== null} resourceLabel="组织" count={1} pending={deleteMutation.isPending} error={deleteMutation.error} onClose={closeDelete} onConfirm={() => { if (canDeleteDepartment && deletingDepartment) void deleteMutation.mutateAsync(deletingDepartment.id).catch(() => undefined) }} /> : null}
    </div>
  )
}

function DepartmentRow({ row, pending, editable, deletable, onEdit, onDelete }: { row: DepartmentRow; pending: boolean; editable: boolean; deletable: boolean; onEdit: (department: NativeDepartment) => void; onDelete: (department: NativeDepartment) => void }) {
  return <tr><td><div className="department-cell" style={{ paddingLeft: `${row.level * 22}px` }}><span className="department-marker"><Building2 size={15} /></span><strong>{row.name}</strong></div></td><td className="department-code">{row.code}</td><td>{row.sortOrder}</td><td><Badge tone={row.enabled ? 'success' : 'warning'}>{row.enabled ? '启用' : '停用'}</Badge></td>{editable || deletable ? <td><div className="table-actions">{editable ? <Button variant="ghost" size="sm" onClick={() => onEdit(row)} disabled={pending}><Pencil size={14} /> 编辑</Button> : null}{deletable ? <Button variant="ghost" size="sm" onClick={() => onDelete(row)} disabled={pending}>删除</Button> : null}</div></td> : null}</tr>
}

// 页面范围只决定能否读取组织树；每次写入仍由服务端核验具体目标和父节点。
function hasPermission(capabilities: NativeCapabilities | undefined, permission: string) {
  return capabilities?.permissions.includes(permission) ?? false
}

// 先按父子关系构建稳定顺序，避免接口返回顺序改变时页面跳动。
function flattenDepartments(departments: NativeDepartment[]): DepartmentRow[] {
  const children = new Map<string | null, NativeDepartment[]>()
  for (const department of departments) {
    const list = children.get(department.parentId) ?? []
    list.push(department)
    children.set(department.parentId, list)
  }
  for (const list of children.values()) list.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))

  const rows: DepartmentRow[] = []
  const visited = new Set<string>()
  function visit(parentId: string | null, level: number) {
    for (const department of children.get(parentId) ?? []) {
      if (visited.has(department.id)) continue
      visited.add(department.id)
      rows.push({ ...department, level })
      visit(department.id, level + 1)
    }
  }
  visit(null, 0)
  for (const department of departments) {
    if (!visited.has(department.id)) rows.push({ ...department, level: 0 })
  }
  return rows
}
