import { useMemo, useState } from 'react'
import { Pencil, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeRole, NativeRoleWriteInput } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, Spinner } from '../../shared/ui'
import { RoleFormModal } from './RoleFormModal'

type RoleFilters = { keyword: string }
const emptyFilters: RoleFilters = { keyword: '' }

export function RolesPage() {
  const queryClient = useQueryClient()
  const [formFilters, setFormFilters] = useState<RoleFilters>(emptyFilters)
  const [filters, setFilters] = useState<RoleFilters>(emptyFilters)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingRole, setEditingRole] = useState<NativeRole | null>(null)
  const query = useQuery({ queryKey: ['roles'], queryFn: () => apiClient.listRoles(), staleTime: 10_000 })
  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: NativeRoleWriteInput }) => id ? apiClient.updateRole(id, input) : apiClient.createRole(input),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['roles'] }); setModalMode(null); setEditingRole(null) },
  })
  const roles = useMemo(() => {
    const keyword = filters.keyword.toLocaleLowerCase()
    return (query.data ?? []).filter((role) => !keyword || `${role.code} ${role.name}`.toLocaleLowerCase().includes(keyword))
  }, [filters.keyword, query.data])

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters({ keyword: formFilters.keyword.trim() })
  }

  function resetFilters() {
    setFormFilters(emptyFilters)
    setFilters(emptyFilters)
  }

  function refresh() {
    void query.refetch()
  }

  function openCreate() { saveMutation.reset(); setEditingRole(null); setModalMode('create') }
  function openEdit(role: NativeRole) { saveMutation.reset(); setEditingRole(role); setModalMode('edit') }
  function closeModal() { if (saveMutation.isPending) return; setModalMode(null); setEditingRole(null) }
  async function submitRole(input: NativeRoleWriteInput) { try { await saveMutation.mutateAsync({ id: editingRole?.id, input }) } catch { /* 模态框保留错误和用户输入。 */ } }

  return (
    <div className="roles-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS / ROLES</p>
          <h1>角色管理</h1>
          <p className="page-description">查询角色状态、数据范围和权限数量。新增和编辑在模态框中完成。</p>
        </div>
        <div className="heading-actions"><Button size="sm" onClick={openCreate}><Plus size={15} /> 新增角色</Button><Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表</Button></div>
      </div>

      <Card className="roles-filter-card">
        <form className="roles-filter-form" onSubmit={submitFilters}>
          <label><span>角色名称或标识</span><input value={formFilters.keyword} onChange={(event) => setFormFilters({ keyword: event.target.value })} placeholder="按角色名称或编码筛选" autoComplete="off" /></label>
          <div className="roles-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={resetFilters}>重置</Button></div>
        </form>
      </Card>

      {query.isLoading ? <div className="loading-panel roles-loading"><Spinner label="正在读取角色列表" /></div> : null}
      {query.isError && !query.data ? <RoleError message={query.error instanceof Error ? query.error.message : '角色列表读取失败'} onRetry={refresh} /> : null}
      {query.data ? <Card className="roles-table-card">
        <CardHeader title="角色列表" description={`共 ${roles.length.toLocaleString('zh-CN')} 个匹配角色`} action={<Badge tone="info">Native API</Badge>} />
        {roles.length > 0 ? <div className="roles-table-wrap"><table className="roles-table"><thead><tr><th scope="col">角色</th><th scope="col">数据范围</th><th scope="col">组织范围</th><th scope="col">权限数</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{roles.map((role) => <RoleRow key={role.id} role={role} onEdit={openEdit} />)}</tbody></table></div> : <div className="roles-empty" role="status"><span className="roles-empty-icon"><ShieldCheck size={20} /></span><strong>没有匹配的角色</strong><p>调整筛选条件后重试，或清空筛选条件查看全部角色。</p></div>}
      </Card> : null}
      <RoleFormModal open={modalMode !== null} mode={modalMode ?? 'create'} role={editingRole} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : null} onClose={closeModal} onSubmit={submitRole} />
    </div>
  )
}

function RoleRow({ role, onEdit }: { role: NativeRole; onEdit: (role: NativeRole) => void }) {
  return <tr><td><div className="role-cell"><span className="role-cell-icon"><ShieldCheck size={16} /></span><div><strong>{role.name}</strong><small>{role.code}</small></div></div></td><td><Badge tone="neutral">{formatScope(role.dataScope)}</Badge></td><td>{role.deptScope || '—'}</td><td>{role.permissions.length}</td><td><Badge tone={role.enabled ? 'success' : 'warning'}>{role.enabled ? '启用' : '停用'}</Badge></td><td><Button variant="ghost" size="sm" onClick={() => onEdit(role)}><Pencil size={14} /> 编辑</Button></td></tr>
}

// 只转换展示文字，实际范围标识继续使用 Native 返回值。
function formatScope(scope: string) {
  const labels: Record<string, string> = { ALL: '全部数据', TENANT: '当前租户', DEPARTMENT: '本部门', DEPARTMENT_AND_CHILDREN: '本部门及下级', CUSTOM: '自定义', SELF: '本人', OWNER: '所属数据', MEMBER: '成员数据' }
  return labels[scope] ?? scope
}

function RoleError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel roles-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取角色列表</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
