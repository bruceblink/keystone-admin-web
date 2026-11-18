import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Pencil, Plus, RefreshCw, Search, Upload, UsersRound } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { formatApiError } from '../../shared/api/errors'
import { MfaStepUpModal } from '../../shared/auth/MfaStepUpModal'
import { useMfaStepUp } from '../../shared/auth/useMfaStepUp'
import type { NativeCapabilities, NativeUser, NativeUserImportResult, NativeUserWriteInput } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, ListToolbar, Spinner, StaleQueryError } from '../../shared/ui'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'
import { UserFormModal } from './UserFormModal'
import { UserImportModal } from './UserImportModal'

const PAGE_SIZE = 20

type UserFilters = {
  username: string
  displayName: string
}

const emptyFilters: UserFilters = { username: '', displayName: '' }
const urlDefaults = { username: '', displayName: '', page: 1 }
const urlOptions = { namespace: 'users' }

export function UsersPage({ capabilities }: { capabilities: NativeCapabilities }) {
  // 用户操作必须同时满足用户数据范围和具体操作权限。
  const hasUserScope = capabilities.resources.user
  const canCreateUser = hasUserScope && capabilities.permissions.includes('user:create')
  const canImportUsers = hasUserScope && capabilities.permissions.includes('user:import')
  const canExportUsers = hasUserScope && capabilities.permissions.includes('user:export')
  const canDeleteUsers = hasUserScope && capabilities.permissions.includes('user:delete')
  const canUpdateUsers = hasUserScope && capabilities.permissions.includes('user:update')
  // 只有具备角色读取、分配权限和角色数据范围时，才读取目录并允许改角色。
  const canAssignRoles = capabilities.resources.role
    && capabilities.permissions.includes('role:read')
    && capabilities.permissions.includes('role:assign')
  const queryClient = useQueryClient()
  const stepUp = useMfaStepUp()
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { page, username, displayName } = urlState
  const filters: UserFilters = { username, displayName }
  const [formFilters, setFormFilters] = useState<UserFilters>(() => filters)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingUser, setEditingUser] = useState<NativeUser | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importResult, setImportResult] = useState<NativeUserImportResult | null>(null)
  const [exportError, setExportError] = useState<unknown>(null)
  const [exporting, setExporting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const rolesQuery = useQuery({
    queryKey: ['user-role-options'],
    queryFn: () => apiClient.listRoles(),
    staleTime: 60_000,
    enabled: modalMode !== null && canAssignRoles,
  })
  const importMutation = useMutation({
    mutationFn: (file: File) => stepUp.run(() => apiClient.importUsers(file)),
    onSuccess: async (result) => {
      setImportResult(result)
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
  const query = useQuery({
    queryKey: ['users', filters, page],
    queryFn: () => apiClient.listUsers({ ...filters, page, size: PAGE_SIZE }),
    staleTime: 10_000,
  })
  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: NativeUserWriteInput }) => stepUp.run(() => id ? apiClient.updateUser(id, input) : apiClient.createUser(input)),
    onSuccess: async () => {
      // 用户角色可能被修改；重新读取当前账号能力，及时收起已失效的页面入口。
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: ['auth', 'capabilities'] }),
      ])
      setModalMode(null)
      setEditingUser(null)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => stepUp.run(() => apiClient.deleteUsers(ids)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      setSelectedIds([])
      setDeleteOpen(false)
    },
  })
  const users = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allSelected = users.length > 0 && users.every((user) => selectedIds.includes(user.id))

  useEffect(() => {
    setSelectedIds([])
  }, [username, displayName, page])

  useEffect(() => {
    if (!canDeleteUsers) setSelectedIds([])
  }, [canDeleteUsers])

  useEffect(() => {
    setFormFilters({ username, displayName })
  }, [username, displayName])

  useEffect(() => {
    // 只在当前页请求成功结束后修正过期页码，避免用旧数据或失败响应改写深链。
    if (query.isSuccess && !query.isFetching && page > totalPages) setUrlState({ page: totalPages })
  }, [page, query.isFetching, query.isSuccess, setUrlState, totalPages])

  const resultDescription = useMemo(() => {
    if (query.isLoading) return '正在读取系统 API'
    if (query.isError) return '读取失败，请检查服务连接'
    return `共 ${total.toLocaleString('zh-CN')} 个用户`
  }, [query.isError, query.isLoading, total])

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ username: formFilters.username.trim(), displayName: formFilters.displayName.trim(), page: 1 }, { history: 'push' })
  }

  function resetFilters() {
    setFormFilters(emptyFilters)
    setUrlState(urlDefaults, { history: 'push' })
  }

  function refresh() {
    void query.refetch()
  }

  function openCreate() {
    saveMutation.reset()
    setEditingUser(null)
    setModalMode('create')
  }

  function openImport() {
    importMutation.reset()
    setImportResult(null)
    setImportOpen(true)
  }

  function closeImport() {
    if (importMutation.isPending) return
    setImportOpen(false)
    importMutation.reset()
    setImportResult(null)
  }

  async function submitImport(file: File) {
    try {
      await importMutation.mutateAsync(file)
    } catch {
      // 模态框显示 mutation.error，保留文件选择和错误上下文供用户处理。
    }
  }

  async function exportUsers() {
    if (!canExportUsers) return
    setExportError(null)
    setExporting(true)
    try {
      const result = await apiClient.exportUsers(filters)
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

  function openEdit(user: NativeUser) {
    saveMutation.reset()
    setEditingUser(user)
    setModalMode('edit')
  }

  function toggleUser(id: string, checked: boolean) {
    if (!canDeleteUsers) return
    setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))
  }

  function toggleAllUsers(checked: boolean) {
    if (!canDeleteUsers) return
    setSelectedIds(checked ? users.map((user) => user.id) : [])
  }

  function openDelete() {
    deleteMutation.reset()
    setDeleteOpen(true)
  }

  function closeDelete() {
    if (!deleteMutation.isPending) setDeleteOpen(false)
  }

  function submitDelete() {
    if (!canDeleteUsers) return
    void deleteMutation.mutateAsync(selectedIds).catch(() => undefined)
  }

  function closeModal() {
    if (saveMutation.isPending) return
    setModalMode(null)
    setEditingUser(null)
  }

  async function submitUser(input: NativeUserWriteInput) {
    if (editingUser ? !canUpdateUsers : !canCreateUser) return
    try {
      await saveMutation.mutateAsync({ id: editingUser?.id, input })
    } catch {
      // 模态框显示 mutation.error，保留表单内容供用户修正。
    }
  }

  return (
    <div className="users-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">IDENTITY / USERS</p>
          <h1>用户管理</h1>
          <p className="page-description">查询用户身份、组织归属和授权角色。新增和编辑在模态框中完成。</p>
        </div>
      </div>

      <ActionError title="用户导出失败" error={exportError} />

      <Card className="users-filter-card">
        <form className="users-filter-form" onSubmit={submitFilters}>
          <label>
            <span>用户名</span>
            <input
              value={formFilters.username}
              onChange={(event) => setFormFilters((current) => ({ ...current, username: event.target.value }))}
              placeholder="按用户名筛选"
              autoComplete="off"
            />
          </label>
          <label>
            <span>展示名</span>
            <input
              value={formFilters.displayName}
              onChange={(event) => setFormFilters((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="按展示名筛选"
              autoComplete="off"
            />
          </label>
          <div className="users-filter-actions">
            <Button type="submit" size="sm" disabled={query.isFetching}>
              <Search size={15} /> 查询
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters} disabled={query.isFetching && !query.data}>
              重置
            </Button>
          </div>
        </form>
      </Card>

      <Card className="users-table-card">
        <ListToolbar>
          {canCreateUser ? <Button size="sm" onClick={openCreate}><Plus size={15} /> 新增用户</Button> : null}
          {canImportUsers ? <Button variant="secondary" size="sm" onClick={openImport} disabled={importMutation.isPending || exporting}><Upload size={15} />导入 Excel</Button> : null}
          {canExportUsers ? <Button variant="secondary" size="sm" onClick={() => void exportUsers()} disabled={exporting || importMutation.isPending}>
            <Download size={15} className={exporting ? 'spin' : ''} />{exporting ? '导出中' : '导出 Excel'}
          </Button> : null}
          {canDeleteUsers ? <Button variant="danger" size="sm" onClick={openDelete} disabled={selectedIds.length === 0 || deleteMutation.isPending}>删除用户（{selectedIds.length}）</Button> : null}
          <Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}>
            <RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表
          </Button>
        </ListToolbar>
        <CardHeader title="用户列表" description={query.data ? resultDescription : undefined} action={<Badge tone="info">系统 API</Badge>} />
        {query.isLoading ? <div className="loading-panel users-loading"><Spinner label="正在读取用户列表" /></div> : null}
        {query.isError && !query.data ? <InitialQueryError title="无法读取用户列表" message="用户列表读取失败，请重试" error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
        {query.isError && query.data ? <StaleQueryError message={formatApiError(query.error, '用户列表刷新失败，请重试')} error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
        {query.data ? <>
          {users.length > 0 ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    {canDeleteUsers ? <th scope="col"><input type="checkbox" aria-label="选择当前页用户" checked={allSelected} onChange={(event) => toggleAllUsers(event.target.checked)} disabled={deleteMutation.isPending} /></th> : null}
                    <th scope="col">用户</th>
                    <th scope="col">UUID</th>
                    <th scope="col">部门</th>
                    <th scope="col">岗位</th>
                    <th scope="col">角色</th>
                    <th scope="col">状态</th>
                    {canUpdateUsers ? <th scope="col">操作</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => <UserRow key={user.id} user={user} selectable={canDeleteUsers} editable={canUpdateUsers} selected={selectedIds.includes(user.id)} pending={deleteMutation.isPending} onSelect={toggleUser} onEdit={openEdit} />)}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="users-empty" role="status">
              <span className="users-empty-icon"><UsersRound size={20} /></span>
              <strong>没有匹配的用户</strong>
              <p>调整筛选条件后重试，或清空筛选条件查看全部用户。</p>
            </div>
          )}
          <div className="users-pagination">
            <span>第 {query.data.page} / {totalPages} 页</span>
            <div>
              <Button variant="ghost" size="sm" onClick={() => setUrlState({ page: Math.max(1, page - 1) }, { history: 'push' })} disabled={page <= 1 || query.isFetching}>上一页</Button>
              <Button variant="secondary" size="sm" onClick={() => setUrlState({ page: Math.min(totalPages, page + 1) }, { history: 'push' })} disabled={page >= totalPages || query.isFetching}>下一页</Button>
            </div>
          </div>
        </> : null}
      </Card>
      <UserImportModal
        open={importOpen && canImportUsers}
        pending={importMutation.isPending}
        result={importResult}
        error={importMutation.error}
        onClose={closeImport}
        onSubmit={submitImport}
      />
      {canDeleteUsers ? <DeleteConfirmModal open={deleteOpen} resourceLabel="用户" count={selectedIds.length} pending={deleteMutation.isPending} error={deleteMutation.error} onClose={closeDelete} onConfirm={submitDelete} /> : null}
      <UserFormModal
        open={modalMode !== null}
        mode={modalMode ?? 'create'}
        user={editingUser}
        pending={saveMutation.isPending}
        error={saveMutation.error}
        canSubmit={modalMode === 'create' ? canCreateUser : canUpdateUsers}
        canAssignRoles={canAssignRoles}
        roles={rolesQuery.data ?? []}
        rolesLoading={rolesQuery.isLoading || rolesQuery.isFetching}
        rolesError={rolesQuery.error}
        onRetryRoles={() => void rolesQuery.refetch()}
        onClose={closeModal}
        onSubmit={submitUser}
      />
      <MfaStepUpModal {...stepUp.modal} />
    </div>
  )
}

function UserRow({ user, selectable, editable, selected, pending, onSelect, onEdit }: { user: NativeUser; selectable: boolean; editable: boolean; selected: boolean; pending: boolean; onSelect: (id: string, checked: boolean) => void; onEdit: (user: NativeUser) => void }) {
  return (
    <tr>
      {selectable ? <td><input type="checkbox" aria-label={`选择用户 ${user.username}`} checked={selected} onChange={(event) => onSelect(user.id, event.target.checked)} disabled={pending} /></td> : null}
      <td>
        <div className="user-cell">
          <span className="user-cell-avatar">{user.displayName.slice(0, 1) || user.username.slice(0, 1)}</span>
          <span><strong>{user.displayName}</strong><small>{user.username}</small></span>
        </div>
      </td>
      <td><code className="user-uuid">{user.id}</code></td>
      <td>{user.deptId ?? '—'}</td>
      <td>{user.postId ?? '—'}</td>
      <td>{user.roles.length > 0 ? user.roles.join('、') : '—'}</td>
      <td><Badge tone={user.enabled ? 'success' : 'neutral'}>{user.enabled ? '启用' : '停用'}</Badge></td>
      {editable ? <td><Button variant="ghost" size="sm" onClick={() => onEdit(user)}><Pencil size={14} /> 编辑</Button></td> : null}
    </tr>
  )
}
