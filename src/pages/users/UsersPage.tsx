import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, RefreshCw, Search, ShieldAlert, UsersRound } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import type { NativeUser, NativeUserWriteInput } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, Spinner } from '../../shared/ui'
import { UserFormModal } from './UserFormModal'

const PAGE_SIZE = 20

type UserFilters = {
  username: string
  displayName: string
}

const emptyFilters: UserFilters = { username: '', displayName: '' }

export function UsersPage() {
  const queryClient = useQueryClient()
  const [formFilters, setFormFilters] = useState<UserFilters>(emptyFilters)
  const [filters, setFilters] = useState<UserFilters>(emptyFilters)
  const [page, setPage] = useState(1)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingUser, setEditingUser] = useState<NativeUser | null>(null)
  const query = useQuery({
    queryKey: ['users', filters, page],
    queryFn: () => apiClient.listUsers({ ...filters, page, size: PAGE_SIZE }),
    staleTime: 10_000,
  })
  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: NativeUserWriteInput }) => id ? apiClient.updateUser(id, input) : apiClient.createUser(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      setModalMode(null)
      setEditingUser(null)
    },
  })
  const users = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const resultDescription = useMemo(() => {
    if (query.isLoading) return '正在读取 Native API'
    if (query.isError) return '读取失败，请检查服务连接'
    return `共 ${total.toLocaleString('zh-CN')} 个用户`
  }, [query.isError, query.isLoading, total])

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters({ username: formFilters.username.trim(), displayName: formFilters.displayName.trim() })
    setPage(1)
  }

  function resetFilters() {
    setFormFilters(emptyFilters)
    setFilters(emptyFilters)
    setPage(1)
  }

  function refresh() {
    void query.refetch()
  }

  function openCreate() {
    saveMutation.reset()
    setEditingUser(null)
    setModalMode('create')
  }

  function openEdit(user: NativeUser) {
    saveMutation.reset()
    setEditingUser(user)
    setModalMode('edit')
  }

  function closeModal() {
    if (saveMutation.isPending) return
    setModalMode(null)
    setEditingUser(null)
  }

  async function submitUser(input: NativeUserWriteInput) {
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
        <div className="heading-actions">
          <Button size="sm" onClick={openCreate}><Plus size={15} /> 新增用户</Button>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}>
            <RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表
          </Button>
        </div>
      </div>

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

      {query.isLoading ? <div className="loading-panel users-loading"><Spinner label="正在读取用户列表" /></div> : null}
      {query.isError && !query.data ? <UsersError message={query.error instanceof Error ? query.error.message : '用户列表读取失败'} onRetry={refresh} /> : null}

      {query.data ? (
        <Card className="users-table-card">
          <CardHeader title="用户列表" description={resultDescription} action={<Badge tone="info">Native API</Badge>} />
          {users.length > 0 ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th scope="col">用户</th>
                    <th scope="col">UUID</th>
                    <th scope="col">部门</th>
                    <th scope="col">岗位</th>
                    <th scope="col">角色</th>
                    <th scope="col">状态</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => <UserRow key={user.id} user={user} onEdit={openEdit} />)}
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
              <Button variant="ghost" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || query.isFetching}>上一页</Button>
              <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || query.isFetching}>下一页</Button>
            </div>
          </div>
        </Card>
      ) : null}
      <UserFormModal open={modalMode !== null} mode={modalMode ?? 'create'} user={editingUser} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : null} onClose={closeModal} onSubmit={submitUser} />
    </div>
  )
}

function UserRow({ user, onEdit }: { user: NativeUser; onEdit: (user: NativeUser) => void }) {
  return (
    <tr>
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
      <td><Button variant="ghost" size="sm" onClick={() => onEdit(user)}><Pencil size={14} /> 编辑</Button></td>
    </tr>
  )
}

function UsersError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-panel users-error" role="alert">
      <ShieldAlert size={20} />
      <div><strong>无法读取用户列表</strong><p>{message}</p></div>
      <Button variant="secondary" size="sm" onClick={onRetry}>重试</Button>
    </div>
  )
}
