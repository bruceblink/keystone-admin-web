import { useEffect, useState } from 'react'
import { Download, Pencil, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { formatApiError } from '../../shared/api/errors'
import { MfaStepUpModal } from '../../shared/auth/MfaStepUpModal'
import { useMfaStepUp } from '../../shared/auth/useMfaStepUp'
import type { NativeRole, NativeRolesPage, NativeRoleWriteInput } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, Spinner, StaleQueryError } from '../../shared/ui'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'
import { RoleFormModal } from './RoleFormModal'

const PAGE_SIZE = 20
type RoleFilters = { keyword: string; status: string }
const emptyFilters: RoleFilters = { keyword: '', status: 'all' }
const urlDefaults = { keyword: '', status: 'all', page: 1 }
const urlOptions = { namespace: 'roles' }

export function RolesPage() {
  const queryClient = useQueryClient()
  const stepUp = useMfaStepUp()
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { keyword: appliedKeyword, status: appliedStatus, page } = urlState
  const [formFilters, setFormFilters] = useState<RoleFilters>(() => ({ keyword: appliedKeyword, status: appliedStatus }))
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingRole, setEditingRole] = useState<NativeRole | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>(null)
  const query = useQuery({ queryKey: ['roles', appliedKeyword, appliedStatus, page], queryFn: () => apiClient.listRoles({ keyword: appliedKeyword, status: appliedStatus === 'all' ? '' : appliedStatus, page, size: PAGE_SIZE }), staleTime: 10_000, placeholderData: (previousData) => previousData })
  const permissionCatalogQuery = useQuery({ queryKey: ['permission-catalog'], queryFn: () => apiClient.listPermissionCatalog(), staleTime: 60_000, enabled: modalMode !== null })
  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: NativeRoleWriteInput }) => stepUp.run(() => id ? apiClient.updateRole(id, input) : apiClient.createRole(input)),
  })
  const permissionMutation = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) => stepUp.run(() => apiClient.updateRolePermissions(id, permissions)),
  })
  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => stepUp.run(() => apiClient.deleteRoles(ids)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roles'] })
      setUrlState({ page: 1 })
      setSelectedIds([])
      setDeleteOpen(false)
    },
  })
  const rolePage = normalizeRolePage(query.data, page)
  const roles = rolePage.items
  const total = rolePage.total
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allSelected = roles.length > 0 && roles.every((role) => selectedIds.includes(role.id))

  useEffect(() => {
    setSelectedIds([])
  }, [appliedKeyword, appliedStatus, page])

  useEffect(() => {
    setFormFilters({ keyword: appliedKeyword, status: appliedStatus })
  }, [appliedKeyword, appliedStatus])

  useEffect(() => {
    if (query.data && page > totalPages) setUrlState({ page: totalPages })
  }, [page, query.data, setUrlState, totalPages])

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ keyword: formFilters.keyword.trim(), status: formFilters.status || 'all', page: 1 })
  }

  function resetFilters() {
    setFormFilters(emptyFilters)
    setUrlState(urlDefaults)
  }

  function refresh() {
    void query.refetch()
  }

  function openCreate() { saveMutation.reset(); permissionMutation.reset(); setEditingRole(null); setModalMode('create') }
  function openEdit(role: NativeRole) { saveMutation.reset(); permissionMutation.reset(); setEditingRole(role); setModalMode('edit') }
  function closeModal() { if (saveMutation.isPending || permissionMutation.isPending) return; setModalMode(null); setEditingRole(null) }
  async function submitRole(input: NativeRoleWriteInput, permissions: string[]) {
    try {
      const saved = await saveMutation.mutateAsync({ id: editingRole?.id, input })
      // 保存角色后先保留新 ID，权限更新失败时用户可以在同一表单重试而不会重复创建角色。
      setEditingRole({ ...saved, permissions })
      setModalMode('edit')
      await permissionMutation.mutateAsync({ id: saved.id, permissions })
      await queryClient.invalidateQueries({ queryKey: ['roles'] })
      setUrlState({ page: 1 })
      setModalMode(null)
      setEditingRole(null)
    } catch {
      // 模态框保留错误和用户输入，供用户修正或重试。
    }
  }
  function toggleRole(id: string, checked: boolean) { setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)) }
  function toggleAllRoles(checked: boolean) { setSelectedIds(checked ? roles.map((role) => role.id) : []) }
  function openDelete() { deleteMutation.reset(); setDeleteOpen(true) }
  function closeDelete() { if (!deleteMutation.isPending) setDeleteOpen(false) }

  async function exportRoles() {
    setExportError(null)
    setExporting(true)
    try {
      const result = await apiClient.exportRoles()
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      setExportError(error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="roles-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS / ROLES</p>
          <h1>角色管理</h1>
          <p className="page-description">查询角色状态、数据范围和权限数量。新增和编辑在模态框中完成。</p>
        </div>
        <div className="heading-actions"><Button variant="secondary" size="sm" onClick={() => void exportRoles()} disabled={exporting || query.isFetching}><Download size={15} className={exporting ? 'spin' : ''} />{exporting ? '导出中' : '导出 Excel'}</Button><Button variant="danger" size="sm" onClick={openDelete} disabled={selectedIds.length === 0 || deleteMutation.isPending}>删除角色（{selectedIds.length}）</Button><Button size="sm" onClick={openCreate}><Plus size={15} /> 新增角色</Button><Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表</Button></div>
      </div>

      <ActionError title="角色导出失败" error={exportError} />
      <ActionError title="角色删除失败" error={deleteMutation.error} />

      <Card className="roles-filter-card">
        <form className="roles-filter-form" onSubmit={submitFilters}>
          <label><span>角色名称或标识</span><input value={formFilters.keyword} onChange={(event) => setFormFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="按角色名称或编码筛选" autoComplete="off" /></label>
          <label><span>角色状态</span><select value={formFilters.status} onChange={(event) => setFormFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
          <div className="roles-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={resetFilters}>重置</Button></div>
        </form>
      </Card>

      {query.isLoading ? <div className="loading-panel roles-loading"><Spinner label="正在读取角色列表" /></div> : null}
      {query.isError && !query.data ? <InitialQueryError title="无法读取角色列表" message="角色列表读取失败，请重试" error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
      {query.isError && query.data ? <StaleQueryError message={formatApiError(query.error, '角色列表刷新失败，请重试')} error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
      {query.data ? <Card className="roles-table-card">
        <CardHeader title="角色列表" description={`共 ${total.toLocaleString('zh-CN')} 个匹配角色`} action={<Badge tone="info">系统 API</Badge>} />
        {roles.length > 0 ? <div className="roles-table-wrap"><table className="roles-table"><thead><tr><th scope="col"><input type="checkbox" aria-label="选择当前角色" checked={allSelected} onChange={(event) => toggleAllRoles(event.target.checked)} disabled={deleteMutation.isPending} /></th><th scope="col">角色</th><th scope="col">数据范围</th><th scope="col">组织范围</th><th scope="col">权限数</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{roles.map((role) => <RoleRow key={role.id} role={role} selected={selectedIds.includes(role.id)} pending={deleteMutation.isPending} onSelect={toggleRole} onEdit={openEdit} />)}</tbody></table></div> : <div className="roles-empty" role="status"><span className="roles-empty-icon"><ShieldCheck size={20} /></span><strong>没有匹配的角色</strong><p>调整筛选条件后重试，或清空筛选条件查看全部角色。</p></div>}
        {totalPages > 1 ? <div className="roles-pagination"><span>第 {page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setUrlState({ page: page - 1 })}>上一页</Button><Button variant="secondary" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => setUrlState({ page: page + 1 })}>下一页</Button></div></div> : null}
      </Card> : null}
      <RoleFormModal open={modalMode !== null} mode={modalMode ?? 'create'} role={editingRole} pending={saveMutation.isPending || permissionMutation.isPending} error={saveMutation.error} permissionsError={permissionMutation.error} permissionEntries={permissionCatalogQuery.data ?? []} permissionsLoading={permissionCatalogQuery.isLoading || permissionCatalogQuery.isFetching} permissionsErrorState={permissionCatalogQuery.error} onRetryPermissions={() => void permissionCatalogQuery.refetch()} onClose={closeModal} onSubmit={submitRole} />
      <DeleteConfirmModal open={deleteOpen} resourceLabel="角色" count={selectedIds.length} pending={deleteMutation.isPending} error={deleteMutation.error} onClose={closeDelete} onConfirm={() => void deleteMutation.mutateAsync(selectedIds).catch(() => undefined)} />
      <MfaStepUpModal {...stepUp.modal} />
    </div>
  )
}

// 兼容旧数组响应，保证旧后端或测试数据仍可在分页页面中展示。
function normalizeRolePage(data: NativeRole[] | NativeRolesPage | undefined, page: number): NativeRolesPage {
  if (Array.isArray(data)) return { items: data, page, size: PAGE_SIZE, total: data.length }
  return data ?? { items: [], page, size: PAGE_SIZE, total: 0 }
}

function RoleRow({ role, selected, pending, onSelect, onEdit }: { role: NativeRole; selected: boolean; pending: boolean; onSelect: (id: string, checked: boolean) => void; onEdit: (role: NativeRole) => void }) {
  return <tr><td><input type="checkbox" aria-label={`选择角色 ${role.code}`} checked={selected} onChange={(event) => onSelect(role.id, event.target.checked)} disabled={pending} /></td><td><div className="role-cell"><span className="role-cell-icon"><ShieldCheck size={16} /></span><div><strong>{role.name}</strong><small>{role.code}</small></div></div></td><td><Badge tone="neutral">{formatScope(role.dataScope)}</Badge></td><td>{role.deptScope || '—'}</td><td>{role.permissions.length}</td><td><Badge tone={role.enabled ? 'success' : 'warning'}>{role.enabled ? '启用' : '停用'}</Badge></td><td><Button variant="ghost" size="sm" onClick={() => onEdit(role)} disabled={pending}><Pencil size={14} /> 编辑</Button></td></tr>
}

// 只转换展示文字，实际范围标识继续使用 Native 返回值。
function formatScope(scope: string) {
  const labels: Record<string, string> = { ALL: '全部数据', TENANT: '当前租户', DEPARTMENT: '本部门', DEPARTMENT_AND_CHILDREN: '本部门及下级', CUSTOM: '自定义', SELF: '本人', OWNER: '所属数据', MEMBER: '成员数据' }
  return labels[scope] ?? scope
}
