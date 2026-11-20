import { useEffect, useState } from 'react'
import { AlertTriangle, Download, Pencil, Plus, RefreshCw, Search, ShieldCheck, UsersRound, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { formatApiError } from '../../shared/api/errors'
import { MfaStepUpModal } from '../../shared/auth/MfaStepUpModal'
import { useMfaStepUp } from '../../shared/auth/useMfaStepUp'
import { useCapabilities } from '../../shared/auth/useCapabilities'
import type { NativeCapabilities, NativeRole, NativeRoleMember, NativeRoleMembersResult, NativeRolesPage, NativeRoleWriteInput } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, ListToolbar, Modal, Spinner, StaleQueryError } from '../../shared/ui'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'
import { RoleFormModal, type RoleFormSubmission } from './RoleFormModal'

const PAGE_SIZE = 20
const MEMBER_PAGE_SIZE = 8
type RoleFilters = { keyword: string; status: string }
const emptyFilters: RoleFilters = { keyword: '', status: 'all' }
const urlDefaults = { keyword: '', status: 'all', page: 1 }
const urlOptions = { namespace: 'roles' }

export function RolesPage() {
  const capabilitiesQuery = useCapabilities()
  const capabilities = capabilitiesQuery.data
  const hasRoleScope = capabilities?.resources.role === true
  const canReadRoles = hasRoleScope && hasPermission(capabilities, 'role:read')
  const canCreateRole = hasRoleScope && hasPermission(capabilities, 'role:create')
  const canUpdateRole = hasRoleScope && hasPermission(capabilities, 'role:update')
  const canDeleteRoles = hasRoleScope && hasPermission(capabilities, 'role:delete')
  const canExportRoles = hasRoleScope && hasPermission(capabilities, 'role:export')
  const canManageRolePermissions = hasRoleScope && hasPermission(capabilities, 'role:manage')
  const canAssignRoleMembers = hasRoleScope && hasPermission(capabilities, 'role:assign')
  const queryClient = useQueryClient()
  const stepUp = useMfaStepUp()
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { keyword: appliedKeyword, status: appliedStatus, page } = urlState
  const [formFilters, setFormFilters] = useState<RoleFilters>(() => ({ keyword: appliedKeyword, status: appliedStatus }))
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'permissions' | null>(null)
  const [roleSubmitPending, setRoleSubmitPending] = useState(false)
  const [partialSaveNotice, setPartialSaveNotice] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState<NativeRole | null>(null)
  const [memberRole, setMemberRole] = useState<NativeRole | null>(null)
  const [memberPages, setMemberPages] = useState({ allocated: 1, available: 1 })
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null)
  const [memberFeedback, setMemberFeedback] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>(null)
  const query = useQuery({ queryKey: ['roles', appliedKeyword, appliedStatus, page], queryFn: () => apiClient.listRoles({ keyword: appliedKeyword, status: appliedStatus === 'all' ? '' : appliedStatus, page, size: PAGE_SIZE }), staleTime: 10_000, placeholderData: (previousData) => previousData, enabled: canReadRoles })
  const permissionCatalogQuery = useQuery({ queryKey: ['permission-catalog'], queryFn: () => apiClient.listPermissionCatalog(), staleTime: 60_000, enabled: modalMode !== null && canManageRolePermissions })
  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: NativeRoleWriteInput }) => stepUp.run(() => id ? apiClient.updateRole(id, input) : apiClient.createRole(input)),
  })
  const permissionMutation = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) => stepUp.run(() => apiClient.updateRolePermissions(id, permissions)),
  })
  const allocatedMembersQuery = useQuery({
    queryKey: ['role-users', memberRole?.id, 'allocated', memberPages.allocated, MEMBER_PAGE_SIZE],
    queryFn: () => apiClient.listRoleMembers(memberRole!.id, true, { page: memberPages.allocated, size: MEMBER_PAGE_SIZE }),
    enabled: memberRole !== null,
    staleTime: 10_000,
  })
  const availableMembersQuery = useQuery({
    queryKey: ['role-users', memberRole?.id, 'available', memberPages.available, MEMBER_PAGE_SIZE],
    queryFn: () => apiClient.listRoleMembers(memberRole!.id, false, { page: memberPages.available, size: MEMBER_PAGE_SIZE }),
    enabled: memberRole !== null,
    staleTime: 10_000,
  })
  const allocatedMembers = roleMemberItems(allocatedMembersQuery.data)
  const availableMembers = roleMemberItems(availableMembersQuery.data)
  const allocatedPages = roleMemberPageCount(allocatedMembersQuery.data)
  const availablePages = roleMemberPageCount(availableMembersQuery.data)
  const visibleMemberPages = {
    allocated: Math.min(memberPages.allocated, allocatedPages),
    available: Math.min(memberPages.available, availablePages),
  }
  const allocatedPageOutOfRange = Boolean(allocatedMembersQuery.data && memberPages.allocated > allocatedPages)
  const availablePageOutOfRange = Boolean(availableMembersQuery.data && memberPages.available > availablePages)
  // 确认框显示被移除的用户名称，写操作仍使用稳定的用户 ID。
  const revokingMember = allocatedMembers.find((member) => member.id === revokingUserId)
  useEffect(() => {
    // 新总数使当前页失效时，先标记该列表缓存过期，再读取校正后的目标页。
    if (memberRole && allocatedPageOutOfRange) {
      void queryClient.invalidateQueries({ queryKey: ['role-users', memberRole.id, 'allocated'], refetchType: 'none' })
    }
    if (memberRole && availablePageOutOfRange) {
      void queryClient.invalidateQueries({ queryKey: ['role-users', memberRole.id, 'available'], refetchType: 'none' })
    }
    setMemberPages((current) => {
      const allocated = allocatedMembersQuery.data ? Math.min(current.allocated, allocatedPages) : current.allocated
      const available = availableMembersQuery.data ? Math.min(current.available, availablePages) : current.available
      return allocated === current.allocated && available === current.available ? current : { allocated, available }
    })
  }, [allocatedMembersQuery.data, allocatedPages, allocatedPageOutOfRange, availableMembersQuery.data, availablePages, availablePageOutOfRange, memberRole, queryClient])
  const memberMutation = useMutation({
    mutationFn: ({ roleId, userId, allocated }: { roleId: string; userId: string; allocated: boolean }) => stepUp.run(() => allocated
      ? apiClient.revokeRoleUsers(roleId, [userId])
      : apiClient.assignRoleUsers(roleId, [userId])),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'capabilities'] })
      // mutation 影响的角色缓存应失效，即使当前面板已经切换到其他角色。
      queryClient.removeQueries({ queryKey: ['role-users', variables.roleId, 'allocated'] })
      queryClient.removeQueries({ queryKey: ['role-users', variables.roleId, 'available'] })
      // mutation 只能更新发起请求的角色，避免成功状态写入其他角色面板。
      if (memberRole?.id === variables.roleId) {
        setMemberFeedback(variables.allocated ? '角色成员已取消分配' : '角色成员已分配')
        if (variables.allocated) setRevokingUserId(null)
        // 重置后必须读取服务器最新第一页。
        setMemberPages({ allocated: 1, available: 1 })
      }
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => stepUp.run(() => apiClient.deleteRoles(ids)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['auth', 'capabilities'] }),
      ])
      setUrlState({ page: 1 })
      setSelectedIds([])
      setDeleteOpen(false)
    },
  })
  const rolePage = normalizeRolePage(query.data, page)
  const roles = rolePage.items
  const total = rolePage.total
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const roleListPending = query.isPlaceholderData
  const allSelected = roles.length > 0 && roles.every((role) => selectedIds.includes(role.id))

  useEffect(() => {
    setSelectedIds([])
  }, [appliedKeyword, appliedStatus, page])

  useEffect(() => {
    if (!canDeleteRoles) {
      setSelectedIds([])
      setDeleteOpen(false)
    }
  }, [canDeleteRoles])

  useEffect(() => {
    if (!canAssignRoleMembers) setRevokingUserId(null)
  }, [canAssignRoleMembers])

  useEffect(() => {
    setFormFilters({ keyword: appliedKeyword, status: appliedStatus })
  }, [appliedKeyword, appliedStatus])

  useEffect(() => {
    // placeholderData 属于上一组筛选或页码；等当前请求成功后再校正深链接页码。
    if (query.isSuccess && !query.isFetching && !query.isPlaceholderData && page > totalPages) {
      setUrlState({ page: totalPages })
    }
  }, [page, query.isFetching, query.isPlaceholderData, query.isSuccess, setUrlState, totalPages])

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ keyword: formFilters.keyword.trim(), status: formFilters.status || 'all', page: 1 }, { history: 'push' })
  }

  function resetFilters() {
    setFormFilters(emptyFilters)
    setUrlState(urlDefaults, { history: 'push' })
  }

  function refresh() {
    void query.refetch()
  }

  function openCreate() {
    if (!canCreateRole) return
    saveMutation.reset()
    permissionMutation.reset()
    setPartialSaveNotice(null)
    setEditingRole(null)
    setModalMode('create')
  }
  function openEdit(role: NativeRole) {
    if (!canUpdateRole) return
    saveMutation.reset()
    permissionMutation.reset()
    setPartialSaveNotice(null)
    setEditingRole(role)
    setModalMode('edit')
  }
  function openRolePermissions(role: NativeRole) {
    if (!canManageRolePermissions || canUpdateRole) return
    saveMutation.reset()
    permissionMutation.reset()
    setPartialSaveNotice(null)
    setEditingRole(role)
    setModalMode('permissions')
  }
  function closeModal() {
    if (roleSubmitPending) return
    if (partialSaveNotice) void queryClient.invalidateQueries({ queryKey: ['auth', 'capabilities'] })
    setModalMode(null)
    setEditingRole(null)
    setPartialSaveNotice(null)
  }
  function openMembers(role: NativeRole) {
    if (memberMutation.isPending) return
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
    if (!canAssignRoleMembers) return
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
    if (!canAssignRoleMembers || !memberRole || memberMutation.isPending) return
    if (allocated) {
      requestMemberRevocation(userId)
      return
    }
    memberMutation.reset()
    setMemberFeedback(null)
    void memberMutation.mutateAsync({ roleId: memberRole.id, userId, allocated: false }).catch(() => undefined)
  }
  async function submitRole(submission: RoleFormSubmission) {
    if (roleSubmitPending) return
    if (submission.kind === 'permissions' && (!canManageRolePermissions || !editingRole)) return
    if (submission.kind === 'role' && !(modalMode === 'create' ? canCreateRole : canUpdateRole)) return
    setRoleSubmitPending(true)
    try {
      if (submission.kind === 'permissions') {
        permissionMutation.reset()
        await permissionMutation.mutateAsync({ id: editingRole!.id, permissions: submission.permissions })
        await finishRoleWrite()
        return
      }

      let savedRole: NativeRole
      try {
        savedRole = await saveMutation.mutateAsync({ id: editingRole?.id, input: submission.input })
      } catch {
        return
      }

      if (canManageRolePermissions && submission.permissions) {
        permissionMutation.reset()
        try {
          await permissionMutation.mutateAsync({ id: savedRole.id, permissions: submission.permissions })
        } catch {
          // 基本资料已成功；切到权限专用模式，后续重试不会重复创建或更新角色。
          setEditingRole({ ...savedRole, permissions: submission.permissions })
          setModalMode('permissions')
          setPartialSaveNotice(`角色“${savedRole.name}”资料已保存，但权限保存失败。重试只会保存角色权限。`)
          await queryClient.invalidateQueries({ queryKey: ['roles'] })
          return
        }
      }

      await finishRoleWrite()
    } catch {
      // mutation 保留接口错误，模态框展示错误并保留用户输入供重试。
    } finally {
      setRoleSubmitPending(false)
    }
  }
  async function finishRoleWrite() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['roles'] }),
      queryClient.invalidateQueries({ queryKey: ['auth', 'capabilities'] }),
    ])
    setUrlState({ page: 1 })
    setModalMode(null)
    setEditingRole(null)
    setPartialSaveNotice(null)
  }
  function toggleRole(id: string, checked: boolean) {
    if (!canDeleteRoles) return
    setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))
  }
  function toggleAllRoles(checked: boolean) {
    if (!canDeleteRoles) return
    setSelectedIds(checked ? roles.map((role) => role.id) : [])
  }
  function openDelete() {
    if (!canDeleteRoles) return
    deleteMutation.reset()
    setDeleteOpen(true)
  }
  function closeDelete() { if (!deleteMutation.isPending) { setDeleteOpen(false); deleteMutation.reset() } }

  async function exportRoles() {
    if (!canExportRoles) return
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
          <div className="roles-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={resetFilters} disabled={query.isFetching}>重置</Button></div>
        </form>
      </Card>

      <Card className="roles-table-card">
        <ListToolbar>
          {canCreateRole ? <Button size="sm" onClick={openCreate}><Plus size={15} /> 新增角色</Button> : null}
          {canExportRoles ? <Button variant="secondary" size="sm" onClick={() => void exportRoles()} disabled={exporting || query.isFetching}><Download size={15} className={exporting ? 'spin' : ''} />{exporting ? '导出中' : '导出 Excel'}</Button> : null}
          {canDeleteRoles ? <Button variant="danger" size="sm" onClick={openDelete} disabled={selectedIds.length === 0 || deleteMutation.isPending || roleListPending}>删除角色（{selectedIds.length}）</Button> : null}
          <Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表</Button>
        </ListToolbar>
        <CardHeader title="角色列表" description={roleListPending ? '正在读取新的查询结果…' : query.data ? `共 ${total.toLocaleString('zh-CN')} 个匹配角色` : undefined} action={<Badge tone="info">系统 API</Badge>} />
        {roleListPending ? <p className="form-help" role="status">当前显示上一查询结果；加载完成前，行操作和批量操作会暂时停用。</p> : null}
        {!canReadRoles && capabilitiesQuery.isLoading ? <div className="loading-panel roles-loading"><Spinner label="正在读取角色权限" /></div> : null}
        {query.isLoading ? <div className="loading-panel roles-loading"><Spinner label="正在读取角色列表" /></div> : null}
        {query.isError && !query.data ? <InitialQueryError title="无法读取角色列表" message="角色列表读取失败，请重试" error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
        {query.isError && query.data ? <StaleQueryError message={formatApiError(query.error, '角色列表刷新失败，请重试')} error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
        {query.data ? <>
        {roles.length > 0 ? <div className="roles-table-wrap"><table className="roles-table"><thead><tr>{canDeleteRoles ? <th scope="col"><input type="checkbox" aria-label="选择当前角色" checked={allSelected} onChange={(event) => toggleAllRoles(event.target.checked)} disabled={deleteMutation.isPending || roleListPending} /></th> : null}<th scope="col">角色</th><th scope="col">数据范围</th><th scope="col">组织范围</th><th scope="col">权限数</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{roles.map((role) => <RoleRow key={role.id} role={role} selectable={canDeleteRoles} editable={canUpdateRole} manageable={canManageRolePermissions} selected={selectedIds.includes(role.id)} pending={deleteMutation.isPending || roleListPending} membersPending={memberMutation.isPending} onSelect={toggleRole} onEdit={openEdit} onPermissions={openRolePermissions} onMembers={openMembers} />)}</tbody></table></div> : <div className="roles-empty" role="status"><span className="roles-empty-icon"><ShieldCheck size={20} /></span><strong>没有匹配的角色</strong><p>调整筛选条件后重试，或清空筛选条件查看全部角色。</p></div>}
        {totalPages > 1 ? <div className="roles-pagination"><span>第 {rolePage.page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={rolePage.page <= 1 || query.isFetching} onClick={() => setUrlState({ page: page - 1 }, { history: 'push' })}>上一页</Button><Button variant="secondary" size="sm" disabled={rolePage.page >= totalPages || query.isFetching} onClick={() => setUrlState({ page: page + 1 }, { history: 'push' })}>下一页</Button></div></div> : null}
        </> : null}
      </Card>
      {memberRole ? <RoleMembersPanel
        role={memberRole}
        allocatedMembers={allocatedMembersQuery.data}
        availableMembers={availableMembersQuery.data}
        allocatedLoading={allocatedMembersQuery.isLoading}
        availableLoading={availableMembersQuery.isLoading}
        allocatedError={allocatedMembersQuery.error}
        availableError={availableMembersQuery.error}
        allocatedFetching={allocatedMembersQuery.isFetching}
        availableFetching={availableMembersQuery.isFetching}
        allocatedPage={visibleMemberPages.allocated}
        availablePage={visibleMemberPages.available}
        canAssign={canAssignRoleMembers}
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
        open={revokingUserId !== null && canAssignRoleMembers}
        title="取消角色成员分配"
        description="请确认是否移除此用户的角色分配。"
        onClose={closeMemberRevocation}
        footer={(
          <>
            <Button variant="ghost" onClick={closeMemberRevocation} disabled={memberMutation.isPending}>取消</Button>
            <Button variant="danger" onClick={() => { if (canAssignRoleMembers && memberRole && revokingUserId) void memberMutation.mutateAsync({ roleId: memberRole.id, userId: revokingUserId, allocated: true }).catch(() => undefined) }} disabled={memberMutation.isPending || !canAssignRoleMembers}>{memberMutation.isPending ? '处理中…' : '确认移除'}</Button>
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
      <RoleFormModal open={modalMode !== null} mode={modalMode ?? 'create'} role={editingRole} pending={roleSubmitPending || saveMutation.isPending || permissionMutation.isPending} canSaveMetadata={modalMode === 'create' ? canCreateRole : modalMode === 'edit' && canUpdateRole} canManagePermissions={canManageRolePermissions} partialSaveNotice={partialSaveNotice} error={saveMutation.error} permissionsError={permissionMutation.error} permissionEntries={permissionCatalogQuery.data ?? []} permissionsLoading={permissionCatalogQuery.isLoading || permissionCatalogQuery.isFetching} permissionsErrorState={permissionCatalogQuery.error} onRetryPermissions={() => void permissionCatalogQuery.refetch()} onClose={closeModal} onSubmit={submitRole} />
      {canDeleteRoles ? <DeleteConfirmModal open={deleteOpen} resourceLabel="角色" count={selectedIds.length} pending={deleteMutation.isPending} error={deleteMutation.error} onClose={closeDelete} onConfirm={() => { if (!canDeleteRoles) return; void deleteMutation.mutateAsync(selectedIds).catch(() => undefined) }} /> : null}
      <MfaStepUpModal {...stepUp.modal} />
    </div>
  )
}

// 兼容旧数组响应，保证旧后端或测试数据仍可在分页页面中展示。
function normalizeRolePage(data: NativeRole[] | NativeRolesPage | undefined, page: number): NativeRolesPage {
  if (Array.isArray(data)) return { items: data, page, size: PAGE_SIZE, total: data.length }
  return data ?? { items: [], page, size: PAGE_SIZE, total: 0 }
}

function RoleRow({ role, selectable, editable, manageable, selected, pending, membersPending, onSelect, onEdit, onPermissions, onMembers }: { role: NativeRole; selectable: boolean; editable: boolean; manageable: boolean; selected: boolean; pending: boolean; membersPending: boolean; onSelect: (id: string, checked: boolean) => void; onEdit: (role: NativeRole) => void; onPermissions: (role: NativeRole) => void; onMembers: (role: NativeRole) => void }) {
  return <tr>{selectable ? <td><input type="checkbox" aria-label={`选择角色 ${role.code}`} checked={selected} onChange={(event) => onSelect(role.id, event.target.checked)} disabled={pending} /></td> : null}<td><div className="role-cell"><span className="role-cell-icon"><ShieldCheck size={16} /></span><div><strong>{role.name}</strong><small>{role.code}</small></div></div></td><td><Badge tone="neutral">{formatScope(role.dataScope)}</Badge></td><td>{role.deptScope || '—'}</td><td>{role.permissions.length}</td><td><Badge tone={role.enabled ? 'success' : 'warning'}>{role.enabled ? '启用' : '停用'}</Badge></td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={() => onMembers(role)} disabled={pending || membersPending}><UsersRound size={14} /> 成员</Button>{editable ? <Button variant="ghost" size="sm" onClick={() => onEdit(role)} disabled={pending}><Pencil size={14} /> 编辑</Button> : manageable ? <Button variant="ghost" size="sm" onClick={() => onPermissions(role)} disabled={pending}>权限</Button> : null}</div></td></tr>
}

type RoleMembersPanelProps = {
  role: NativeRole
  allocatedMembers: NativeRoleMembersResult | undefined
  availableMembers: NativeRoleMembersResult | undefined
  allocatedLoading: boolean
  availableLoading: boolean
  allocatedError: unknown
  availableError: unknown
  allocatedFetching: boolean
  availableFetching: boolean
  allocatedPage: number
  availablePage: number
  canAssign: boolean
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
  return <Card className="role-members-card">
    <CardHeader title={`角色成员：${props.role.name}`} description="管理当前角色的用户分配。" action={<Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.pending}><X size={15} /> 关闭</Button>} />
    {!props.canAssign ? <p className="form-help" role="status">当前账号没有成员分配权限，仅可查看成员。</p> : null}
    {props.feedback ? <p className="action-success" role="status">{props.feedback}</p> : null}
    <ActionError title="角色成员更新失败" error={props.error} />
    <div className="role-members-grid">
      <RoleMemberList title="已分配用户" members={props.allocatedMembers} page={props.allocatedPage} loading={props.allocatedLoading} fetching={props.allocatedFetching} error={props.allocatedError} actionLabel="取消分配" actionTone="danger" canAssign={props.canAssign} onRetry={props.onRetryAllocated} onPageChange={(page) => props.onPageChange('allocated', page)} onChange={(id) => props.onChange(id, true)} pending={props.pending} />
      <RoleMemberList title="可分配用户" members={props.availableMembers} page={props.availablePage} loading={props.availableLoading} fetching={props.availableFetching} error={props.availableError} actionLabel="分配" actionTone="secondary" canAssign={props.canAssign} onRetry={props.onRetryAvailable} onPageChange={(page) => props.onPageChange('available', page)} onChange={(id) => props.onChange(id, false)} pending={props.pending} />
    </div>
  </Card>
}

function RoleMemberList({ title, members, page, loading, fetching, error, actionLabel, actionTone, canAssign, onRetry, onPageChange, onChange, pending }: { title: string; members: NativeRoleMembersResult | undefined; page: number; loading: boolean; fetching: boolean; error: unknown; actionLabel: string; actionTone: 'danger' | 'secondary'; canAssign: boolean; onRetry: () => void; onPageChange: (page: number) => void; onChange: (id: string) => void; pending: boolean }) {
  const memberRows = roleMemberItems(members)
  const total = roleMemberTotal(members)
  const totalPages = roleMemberPageCount(members)
  // 旧接口返回完整数组时本地切片；分页响应已只包含当前页。
  const visibleMembers = Array.isArray(members) ? memberRows.slice((page - 1) * MEMBER_PAGE_SIZE, page * MEMBER_PAGE_SIZE) : memberRows
  const initialError = Boolean(error && members === undefined)
  return <section className="role-members-column" aria-labelledby={`${actionTone}-role-members-title`}>
    <div className="role-members-column-heading"><div><h3 id={`${actionTone}-role-members-title`}>{title}</h3><span>{total} 个用户</span></div>{fetching ? <Spinner label="刷新中" /> : null}</div>
    {loading ? <div className="loading-panel"><Spinner label="正在读取角色成员" /></div> : null}
    {initialError ? <InitialQueryError title={`${title}读取失败`} message="角色成员读取失败，请重试" error={error} onRetry={onRetry} retrying={fetching} /> : null}
    {!loading && !initialError && error ? <StaleQueryError message={formatApiError(error, `${title}刷新失败，请重试`)} error={error} onRetry={onRetry} retrying={fetching} /> : null}
    {!loading && !initialError && visibleMembers.length === 0 ? <div className="role-members-empty" role="status">暂无用户</div> : null}
    {visibleMembers.length > 0 ? <div className="role-members-table-wrap" role="region" tabIndex={0} aria-label={`${title}列表`}><table className="role-members-table"><caption className="sr-only">{title}</caption><thead><tr><th scope="col">用户</th>{canAssign ? <th scope="col">操作</th> : null}</tr></thead><tbody>{visibleMembers.map((member) => <tr key={member.id}><td>{member.username || member.displayName ? <><strong>{member.username || member.displayName}</strong>{member.username && member.displayName && member.username !== member.displayName ? <div>{member.displayName}</div> : null}</> : <code>{member.id}</code>}</td>{canAssign ? <td><Button variant={actionTone} size="sm" onClick={() => onChange(member.id)} disabled={pending || fetching}>{actionLabel}</Button></td> : null}</tr>)}</tbody></table></div> : null}
    {totalPages > 1 ? <div className="role-members-pagination"><span>第 {Math.min(page, totalPages)} / {totalPages} 页</span><div><Button variant="ghost" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1 || fetching || pending}>上一页</Button><Button variant="secondary" size="sm" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages || fetching || pending}>下一页</Button></div></div> : null}
  </section>
}

// 统一从旧数组和新分页响应中读取当前行、总数与边界页数。
function roleMemberItems(result: NativeRoleMembersResult | undefined): NativeRoleMember[] {
  if (!result) return []
  return Array.isArray(result) ? result : result.items
}

function roleMemberTotal(result: NativeRoleMembersResult | undefined): number {
  if (!result) return 0
  return Array.isArray(result) ? result.length : result.total
}

function roleMemberPageCount(result: NativeRoleMembersResult | undefined): number {
  if (!result) return 1
  const size = Array.isArray(result) ? MEMBER_PAGE_SIZE : result.size
  return Math.max(1, Math.ceil(roleMemberTotal(result) / size))
}

// 只转换展示文字，实际范围标识继续使用 Native 返回值。
function formatScope(scope: string) {
  const labels: Record<string, string> = { ALL: '全部数据', TENANT: '当前租户', DEPARTMENT: '本部门', DEPARTMENT_AND_CHILDREN: '本部门及下级', CUSTOM: '自定义', SELF: '本人', OWNER: '所属数据', MEMBER: '成员数据' }
  return labels[scope] ?? scope
}

// 未成功读取能力时按无权限处理，不显示角色操作入口。
function hasPermission(capabilities: NativeCapabilities | undefined, permission: string) {
  return capabilities?.permissions.includes(permission) ?? false
}
