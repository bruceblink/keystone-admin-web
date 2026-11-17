import { useEffect, useState } from 'react'
import { AlertTriangle, Download, Pencil, Plus, RefreshCw, Search, ShieldCheck, UsersRound, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { formatApiError } from '../../shared/api/errors'
import { MfaStepUpModal } from '../../shared/auth/MfaStepUpModal'
import { useMfaStepUp } from '../../shared/auth/useMfaStepUp'
import type { NativeRole, NativeRoleMember, NativeRolesPage, NativeRoleWriteInput } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, ListToolbar, Modal, Spinner, StaleQueryError } from '../../shared/ui'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'
import { RoleFormModal } from './RoleFormModal'

const PAGE_SIZE = 20
const MEMBER_PAGE_SIZE = 8
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
  const [memberRole, setMemberRole] = useState<NativeRole | null>(null)
  const [memberPages, setMemberPages] = useState({ allocated: 1, available: 1 })
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null)
  const [memberFeedback, setMemberFeedback] = useState<string | null>(null)
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
  const allocatedMembersQuery = useQuery({
    queryKey: ['role-users', memberRole?.id, 'allocated'],
    queryFn: () => apiClient.listRoleMembers(memberRole!.id, true),
    enabled: memberRole !== null,
    staleTime: 10_000,
  })
  const availableMembersQuery = useQuery({
    queryKey: ['role-users', memberRole?.id, 'available'],
    queryFn: () => apiClient.listRoleMembers(memberRole!.id, false),
    enabled: memberRole !== null,
    staleTime: 10_000,
  })
  // 刷新后的同一次渲染先钳制展示页，避免旧页码短暂显示空列表。
  const visibleMemberPages = {
    allocated: Math.min(memberPages.allocated, Math.max(1, Math.ceil((allocatedMembersQuery.data?.length ?? 0) / MEMBER_PAGE_SIZE))),
    available: Math.min(memberPages.available, Math.max(1, Math.ceil((availableMembersQuery.data?.length ?? 0) / MEMBER_PAGE_SIZE))),
  }
  // 确认框显示被移除的用户名称，写操作仍使用稳定的用户 ID。
  const revokingMember = allocatedMembersQuery.data?.find((member) => member.id === revokingUserId)
  useEffect(() => {
    // 刷新或其他管理员修改成员后，页码必须落在新列表范围内。
    setMemberPages((current) => {
      const allocated = Math.min(current.allocated, Math.max(1, Math.ceil((allocatedMembersQuery.data?.length ?? 0) / MEMBER_PAGE_SIZE)))
      const available = Math.min(current.available, Math.max(1, Math.ceil((availableMembersQuery.data?.length ?? 0) / MEMBER_PAGE_SIZE)))
      return allocated === current.allocated && available === current.available ? current : { allocated, available }
    })
  }, [allocatedMembersQuery.data, availableMembersQuery.data])
  const memberMutation = useMutation({
    mutationFn: ({ userId, allocated }: { userId: string; allocated: boolean }) => stepUp.run(() => allocated
      ? apiClient.revokeRoleUsers(memberRole!.id, [userId])
      : apiClient.assignRoleUsers(memberRole!.id, [userId])),
    onSuccess: async (_result, variables) => {
      setMemberFeedback(variables.allocated ? '角色成员已取消分配' : '角色成员已分配')
      if (variables.allocated) setRevokingUserId(null)
      setMemberPages({ allocated: 1, available: 1 })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['role-users', memberRole?.id, 'allocated'] }),
        queryClient.invalidateQueries({ queryKey: ['role-users', memberRole?.id, 'available'] }),
      ])
    },
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
  function openMembers(role: NativeRole) {
    memberMutation.reset()
    setMemberRole(role)
    setMemberPages({ allocated: 1, available: 1 })
    setMemberFeedback(null)
  }
  function closeMembers() {
    if (memberMutation.isPending) return
    setMemberRole(null)
    setMemberFeedback(null)
  }
  function requestMemberRevocation(userId: string) {
    memberMutation.reset()
    setMemberFeedback(null)
    setRevokingUserId(userId)
  }
  function closeMemberRevocation() {
    if (memberMutation.isPending) return
    setRevokingUserId(null)
    memberMutation.reset()
  }
  function changeRoleMember(userId: string, allocated: boolean) {
    if (allocated) {
      requestMemberRevocation(userId)
      return
    }
    memberMutation.reset()
    setMemberFeedback(null)
    void memberMutation.mutateAsync({ userId, allocated: false }).catch(() => undefined)
  }
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
  function closeDelete() { if (!deleteMutation.isPending) { setDeleteOpen(false); deleteMutation.reset() } }

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
      </div>

      <ActionError title="角色导出失败" error={exportError} />

      <Card className="roles-filter-card">
        <form className="roles-filter-form" onSubmit={submitFilters}>
          <label><span>角色名称或标识</span><input value={formFilters.keyword} onChange={(event) => setFormFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="按角色名称或编码筛选" autoComplete="off" /></label>
          <label><span>角色状态</span><select value={formFilters.status} onChange={(event) => setFormFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
          <div className="roles-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={resetFilters}>重置</Button></div>
        </form>
      </Card>

      {/* 操作入口独立于查询结果，首次加载和初查失败时仍可使用。 */}
      <ListToolbar>
        <Button size="sm" onClick={openCreate}><Plus size={15} /> 新增角色</Button>
        <Button variant="secondary" size="sm" onClick={() => void exportRoles()} disabled={exporting || query.isFetching}><Download size={15} className={exporting ? 'spin' : ''} />{exporting ? '导出中' : '导出 Excel'}</Button>
        <Button variant="danger" size="sm" onClick={openDelete} disabled={selectedIds.length === 0 || deleteMutation.isPending}>删除角色（{selectedIds.length}）</Button>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表</Button>
      </ListToolbar>

      {query.isLoading ? <div className="loading-panel roles-loading"><Spinner label="正在读取角色列表" /></div> : null}
      {query.isError && !query.data ? <InitialQueryError title="无法读取角色列表" message="角色列表读取失败，请重试" error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
      {query.isError && query.data ? <StaleQueryError message={formatApiError(query.error, '角色列表刷新失败，请重试')} error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
      {query.data ? <Card className="roles-table-card">
        <CardHeader title="角色列表" description={`共 ${total.toLocaleString('zh-CN')} 个匹配角色`} action={<Badge tone="info">系统 API</Badge>} />
        {roles.length > 0 ? <div className="roles-table-wrap"><table className="roles-table"><thead><tr><th scope="col"><input type="checkbox" aria-label="选择当前角色" checked={allSelected} onChange={(event) => toggleAllRoles(event.target.checked)} disabled={deleteMutation.isPending} /></th><th scope="col">角色</th><th scope="col">数据范围</th><th scope="col">组织范围</th><th scope="col">权限数</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{roles.map((role) => <RoleRow key={role.id} role={role} selected={selectedIds.includes(role.id)} pending={deleteMutation.isPending} onSelect={toggleRole} onEdit={openEdit} onMembers={openMembers} />)}</tbody></table></div> : <div className="roles-empty" role="status"><span className="roles-empty-icon"><ShieldCheck size={20} /></span><strong>没有匹配的角色</strong><p>调整筛选条件后重试，或清空筛选条件查看全部角色。</p></div>}
        {totalPages > 1 ? <div className="roles-pagination"><span>第 {page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setUrlState({ page: page - 1 })}>上一页</Button><Button variant="secondary" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => setUrlState({ page: page + 1 })}>下一页</Button></div></div> : null}
      </Card> : null}
      {memberRole ? <RoleMembersPanel
        role={memberRole}
        allocatedMembers={allocatedMembersQuery.data ?? []}
        availableMembers={availableMembersQuery.data ?? []}
        allocatedLoading={allocatedMembersQuery.isLoading}
        availableLoading={availableMembersQuery.isLoading}
        allocatedError={allocatedMembersQuery.error}
        availableError={availableMembersQuery.error}
        allocatedFetching={allocatedMembersQuery.isFetching}
        availableFetching={availableMembersQuery.isFetching}
        allocatedPage={visibleMemberPages.allocated}
        availablePage={visibleMemberPages.available}
        feedback={memberFeedback}
        pending={memberMutation.isPending}
        error={revokingUserId ? null : memberMutation.error}
        onClose={closeMembers}
        onRetryAllocated={() => void allocatedMembersQuery.refetch()}
        onRetryAvailable={() => void availableMembersQuery.refetch()}
        onPageChange={(kind, pageNumber) => setMemberPages((current) => ({ ...current, [kind]: pageNumber }))}
        onChange={changeRoleMember}
      /> : null}
      <Modal
        open={revokingUserId !== null}
        title="取消角色成员分配"
        description="请确认是否移除此用户的角色分配。"
        onClose={closeMemberRevocation}
        footer={(
          <>
            <Button variant="ghost" onClick={closeMemberRevocation} disabled={memberMutation.isPending}>取消</Button>
            <Button variant="danger" onClick={() => { if (revokingUserId) void memberMutation.mutateAsync({ userId: revokingUserId, allocated: true }).catch(() => undefined) }} disabled={memberMutation.isPending}>{memberMutation.isPending ? '处理中…' : '确认移除'}</Button>
          </>
        )}
      >
        <div className="delete-confirm-panel">
          <div className="delete-confirm-icon"><AlertTriangle size={21} /></div>
          <div>
            <strong>将从“{memberRole?.name ?? '当前角色'}”移除此用户</strong>
            <p>确认后，该用户将不再拥有此角色关联的权限。</p>
            {revokingMember?.username || revokingMember?.displayName ? <p>{revokingMember.username || revokingMember.displayName}{revokingMember.username && revokingMember.displayName && revokingMember.username !== revokingMember.displayName ? `（${revokingMember.displayName}）` : ''}</p> : null}
            {revokingUserId ? <code>{revokingUserId}</code> : null}
          </div>
        </div>
        <ActionError title="角色成员更新失败" error={memberMutation.error} />
      </Modal>
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

function RoleRow({ role, selected, pending, onSelect, onEdit, onMembers }: { role: NativeRole; selected: boolean; pending: boolean; onSelect: (id: string, checked: boolean) => void; onEdit: (role: NativeRole) => void; onMembers: (role: NativeRole) => void }) {
  return <tr><td><input type="checkbox" aria-label={`选择角色 ${role.code}`} checked={selected} onChange={(event) => onSelect(role.id, event.target.checked)} disabled={pending} /></td><td><div className="role-cell"><span className="role-cell-icon"><ShieldCheck size={16} /></span><div><strong>{role.name}</strong><small>{role.code}</small></div></div></td><td><Badge tone="neutral">{formatScope(role.dataScope)}</Badge></td><td>{role.deptScope || '—'}</td><td>{role.permissions.length}</td><td><Badge tone={role.enabled ? 'success' : 'warning'}>{role.enabled ? '启用' : '停用'}</Badge></td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={() => onMembers(role)} disabled={pending}><UsersRound size={14} /> 成员</Button><Button variant="ghost" size="sm" onClick={() => onEdit(role)} disabled={pending}><Pencil size={14} /> 编辑</Button></div></td></tr>
}

type RoleMembersPanelProps = {
  role: NativeRole
  allocatedMembers: NativeRoleMember[]
  availableMembers: NativeRoleMember[]
  allocatedLoading: boolean
  availableLoading: boolean
  allocatedError: unknown
  availableError: unknown
  allocatedFetching: boolean
  availableFetching: boolean
  allocatedPage: number
  availablePage: number
  feedback: string | null
  pending: boolean
  error: unknown
  onClose: () => void
  onRetryAllocated: () => void
  onRetryAvailable: () => void
  onPageChange: (kind: 'allocated' | 'available', page: number) => void
  onChange: (userId: string, allocated: boolean) => void
}

function RoleMembersPanel(props: RoleMembersPanelProps) {
  const allocatedPages = Math.max(1, Math.ceil(props.allocatedMembers.length / MEMBER_PAGE_SIZE))
  const availablePages = Math.max(1, Math.ceil(props.availableMembers.length / MEMBER_PAGE_SIZE))
  return <Card className="role-members-card">
    <CardHeader title={`角色成员：${props.role.name}`} description="管理当前角色的用户分配。" action={<Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.pending}><X size={15} /> 关闭</Button>} />
    {props.feedback ? <p className="action-success" role="status">{props.feedback}</p> : null}
    <ActionError title="角色成员更新失败" error={props.error} />
    <div className="role-members-grid">
      <RoleMemberList title="已分配用户" members={props.allocatedMembers} page={props.allocatedPage} totalPages={allocatedPages} loading={props.allocatedLoading} fetching={props.allocatedFetching} error={props.allocatedError} actionLabel="取消分配" actionTone="danger" onRetry={props.onRetryAllocated} onPageChange={(page) => props.onPageChange('allocated', page)} onChange={(id) => props.onChange(id, true)} pending={props.pending} />
      <RoleMemberList title="可分配用户" members={props.availableMembers} page={props.availablePage} totalPages={availablePages} loading={props.availableLoading} fetching={props.availableFetching} error={props.availableError} actionLabel="分配" actionTone="secondary" onRetry={props.onRetryAvailable} onPageChange={(page) => props.onPageChange('available', page)} onChange={(id) => props.onChange(id, false)} pending={props.pending} />
    </div>
  </Card>
}

function RoleMemberList({ title, members, page, totalPages, loading, fetching, error, actionLabel, actionTone, onRetry, onPageChange, onChange, pending }: { title: string; members: NativeRoleMember[]; page: number; totalPages: number; loading: boolean; fetching: boolean; error: unknown; actionLabel: string; actionTone: 'danger' | 'secondary'; onRetry: () => void; onPageChange: (page: number) => void; onChange: (id: string) => void; pending: boolean }) {
  // 新接口显示用户名和展示名；旧接口缺少名称时保留 ID 以支持成员操作。
  const visibleMembers = members.slice((page - 1) * MEMBER_PAGE_SIZE, page * MEMBER_PAGE_SIZE)
  const initialError = Boolean(error && members.length === 0)
  return <section className="role-members-column" aria-labelledby={`${actionTone}-role-members-title`}>
    <div className="role-members-column-heading"><div><h3 id={`${actionTone}-role-members-title`}>{title}</h3><span>{members.length} 个用户</span></div>{fetching ? <Spinner label="刷新中" /> : null}</div>
    {loading ? <div className="loading-panel"><Spinner label="正在读取角色成员" /></div> : null}
    {initialError ? <InitialQueryError title={`${title}读取失败`} message="角色成员读取失败，请重试" error={error} onRetry={onRetry} retrying={fetching} /> : null}
    {!loading && !initialError && error ? <StaleQueryError message={formatApiError(error, `${title}刷新失败，请重试`)} error={error} onRetry={onRetry} retrying={fetching} /> : null}
    {!loading && !initialError && visibleMembers.length === 0 ? <div className="role-members-empty" role="status">暂无用户</div> : null}
    {visibleMembers.length > 0 ? <div className="role-members-table-wrap"><table className="role-members-table"><thead><tr><th scope="col">用户</th><th scope="col">操作</th></tr></thead><tbody>{visibleMembers.map((member) => <tr key={member.id}><td>{member.username || member.displayName ? <><strong>{member.username || member.displayName}</strong>{member.username && member.displayName && member.username !== member.displayName ? <div>{member.displayName}</div> : null}</> : <code>{member.id}</code>}</td><td><Button variant={actionTone} size="sm" onClick={() => onChange(member.id)} disabled={pending}>{actionLabel}</Button></td></tr>)}</tbody></table></div> : null}
    {totalPages > 1 ? <div className="role-members-pagination"><span>第 {page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1 || fetching || pending}>上一页</Button><Button variant="secondary" size="sm" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages || fetching || pending}>下一页</Button></div></div> : null}
  </section>
}

// 只转换展示文字，实际范围标识继续使用 Native 返回值。
function formatScope(scope: string) {
  const labels: Record<string, string> = { ALL: '全部数据', TENANT: '当前租户', DEPARTMENT: '本部门', DEPARTMENT_AND_CHILDREN: '本部门及下级', CUSTOM: '自定义', SELF: '本人', OWNER: '所属数据', MEMBER: '成员数据' }
  return labels[scope] ?? scope
}
