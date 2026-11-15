import { useMemo, useState } from 'react'
import { Building2, Pencil, Plus, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeDepartment, NativeDepartmentWriteInput } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, DeleteConfirmModal, Spinner } from '../../shared/ui'
import { DepartmentFormModal } from './DepartmentFormModal'

type DepartmentRow = NativeDepartment & { level: number }

export function DepartmentsPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingDepartment, setEditingDepartment] = useState<NativeDepartment | null>(null)
  const [deletingDepartment, setDeletingDepartment] = useState<NativeDepartment | null>(null)
  const query = useQuery({ queryKey: ['departments'], queryFn: () => apiClient.listDepartments(), staleTime: 10_000 })
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
  const rows = useMemo(() => {
    const allRows = flattenDepartments(query.data ?? [])
    const normalized = appliedKeyword.toLocaleLowerCase()
    if (!normalized) return allRows
    const matchingIds = new Set(allRows.filter((row) => `${row.code} ${row.name}`.toLocaleLowerCase().includes(normalized)).map((row) => row.id))
    return allRows.filter((row) => matchingIds.has(row.id) || (row.parentId && matchingIds.has(row.parentId)))
  }, [appliedKeyword, query.data])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedKeyword(keyword.trim())
  }

  function reset() {
    setKeyword('')
    setAppliedKeyword('')
  }

  function refresh() {
    void query.refetch()
  }
  function openCreate() { saveMutation.reset(); setEditingDepartment(null); setModalMode('create') }
  function openEdit(department: NativeDepartment) { saveMutation.reset(); setEditingDepartment(department); setModalMode('edit') }
  function closeModal() { if (saveMutation.isPending) return; setModalMode(null); setEditingDepartment(null) }
  async function submitDepartment(input: NativeDepartmentWriteInput) { try { await saveMutation.mutateAsync({ id: editingDepartment?.id, input }) } catch { /* 模态框保留错误和用户输入。 */ } }
  function openDelete(department: NativeDepartment) { deleteMutation.reset(); setDeletingDepartment(department) }
  function closeDelete() { if (!deleteMutation.isPending) setDeletingDepartment(null) }

  return (
    <div className="departments-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZATION / STRUCTURE</p>
          <h1>组织结构</h1>
          <p className="page-description">按层级查看部门、组织编码和启用状态。新增和编辑在模态框中完成。</p>
        </div>
        <div className="heading-actions"><Button size="sm" onClick={openCreate}><Plus size={15} /> 新增组织</Button><Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新结构</Button></div>
      </div>

      <Card className="departments-filter-card">
        <form className="departments-filter-form" onSubmit={submit}>
          <label><span>组织名称或编码</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按组织名称或编码筛选" autoComplete="off" /></label>
          <div className="departments-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div>
        </form>
      </Card>

      {query.isLoading ? <div className="loading-panel departments-loading"><Spinner label="正在读取组织结构" /></div> : null}
      {query.isError && !query.data ? <DepartmentError message={query.error instanceof Error ? query.error.message : '组织结构读取失败'} onRetry={refresh} /> : null}
      {query.data ? <Card className="departments-table-card">
        <CardHeader title="组织结构" description={`共 ${rows.length.toLocaleString('zh-CN')} 个组织节点`} action={<Badge tone="info">系统 API</Badge>} />
        {rows.length > 0 ? <div className="departments-table-wrap"><table className="departments-table"><thead><tr><th scope="col">组织名称</th><th scope="col">组织编码</th><th scope="col">排序</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{rows.map((row) => <DepartmentRow key={row.id} row={row} pending={deleteMutation.isPending} onEdit={openEdit} onDelete={openDelete} />)}</tbody></table></div> : <div className="departments-empty" role="status"><span className="departments-empty-icon"><Building2 size={20} /></span><strong>没有匹配的组织</strong><p>调整筛选条件后重试，或清空筛选条件查看完整组织结构。</p></div>}
      </Card> : null}
      <DepartmentFormModal open={modalMode !== null} mode={modalMode ?? 'create'} department={editingDepartment} departments={query.data ?? []} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : null} onClose={closeModal} onSubmit={submitDepartment} />
      <DeleteConfirmModal open={deletingDepartment !== null} resourceLabel="组织" count={1} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : null} onClose={closeDelete} onConfirm={() => { if (deletingDepartment) void deleteMutation.mutateAsync(deletingDepartment.id).catch(() => undefined) }} />
    </div>
  )
}

function DepartmentRow({ row, pending, onEdit, onDelete }: { row: DepartmentRow; pending: boolean; onEdit: (department: NativeDepartment) => void; onDelete: (department: NativeDepartment) => void }) {
  return <tr><td><div className="department-cell" style={{ paddingLeft: `${row.level * 22}px` }}><span className="department-marker"><Building2 size={15} /></span><strong>{row.name}</strong></div></td><td className="department-code">{row.code}</td><td>{row.sortOrder}</td><td><Badge tone={row.enabled ? 'success' : 'warning'}>{row.enabled ? '启用' : '停用'}</Badge></td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={() => onEdit(row)} disabled={pending}><Pencil size={14} /> 编辑</Button><Button variant="ghost" size="sm" onClick={() => onDelete(row)} disabled={pending}>删除</Button></div></td></tr>
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

function DepartmentError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel departments-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取组织结构</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
