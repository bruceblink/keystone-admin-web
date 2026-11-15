import { useMemo, useState } from 'react'
import { ListTree, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeMenu, NativeMenuNode, NativeMenuWriteInput } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, DeleteConfirmModal, Spinner } from '../../shared/ui'
import { MenuFormModal } from './MenuFormModal'

type MenuRow = NativeMenuNode & { level: number }

export function MenusPage() {
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingMenu, setEditingMenu] = useState<NativeMenu | null>(null)
  const [deletingMenu, setDeletingMenu] = useState<NativeMenu | null>(null)
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['menus'], queryFn: () => apiClient.listMenus(), staleTime: 10_000 })
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: () => apiClient.listRoles(), staleTime: 10_000 })
  const menuRolesQuery = useQuery({ queryKey: ['menu-roles', editingMenu?.id], queryFn: () => apiClient.listRolesForMenu(editingMenu!.id), enabled: modalMode === 'edit' && editingMenu !== null, staleTime: 10_000 })
  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: NativeMenuWriteInput }) => id ? apiClient.updateMenu(id, input) : apiClient.createMenu(input),
  })
  const roleAssignmentMutation = useMutation({ mutationFn: ({ id, roleCodes }: { id: string; roleCodes: string[] }) => apiClient.assignMenuRoles(id, roleCodes) })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteMenu(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['menus'] })
      setDeletingMenu(null)
    },
  })
  const rows = useMemo(() => {
    const allRows = flattenMenus(query.data ?? [])
    const normalized = appliedKeyword.toLocaleLowerCase()
    if (!normalized) return allRows
    const matching = new Set(allRows.filter((row) => `${row.menu.code} ${row.menu.name} ${row.menu.permission ?? ''}`.toLocaleLowerCase().includes(normalized)).map((row) => row.menu.id))
    return allRows.filter((row) => matching.has(row.menu.id) || (row.menu.parentId && matching.has(row.menu.parentId)))
  }, [appliedKeyword, query.data])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedKeyword(keyword.trim())
  }

  function reset() {
    setKeyword('')
    setAppliedKeyword('')
  }

  function openCreate() { saveMutation.reset(); roleAssignmentMutation.reset(); setEditingMenu(null); setModalMode('create') }
  function openEdit(menu: NativeMenu) { saveMutation.reset(); roleAssignmentMutation.reset(); setEditingMenu(menu); setModalMode('edit') }
  function closeModal() { if (saveMutation.isPending || roleAssignmentMutation.isPending) return; setModalMode(null); setEditingMenu(null) }
  async function submitMenu(input: NativeMenuWriteInput, roleCodes: string[]) {
    const saved = await saveMutation.mutateAsync({ id: editingMenu?.id, input })
    // 创建成功后保留新 ID，角色绑定失败时用户可以在同一表单重试而不会重复创建。
    setEditingMenu(saved)
    setModalMode('edit')
    await roleAssignmentMutation.mutateAsync({ id: saved.id, roleCodes })
    await queryClient.invalidateQueries({ queryKey: ['menus'] })
    await queryClient.invalidateQueries({ queryKey: ['menu-roles', saved.id] })
    setModalMode(null)
    setEditingMenu(null)
  }
  function openDelete(menu: NativeMenu) { deleteMutation.reset(); setDeletingMenu(menu) }
  function closeDelete() { if (!deleteMutation.isPending) setDeletingMenu(null) }

  return (
    <div className="menus-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS / MENUS</p>
          <h1>菜单与权限</h1>
          <p className="page-description">查询菜单层级、路由和权限标识。新增和编辑在模态框中完成，删除操作需要确认。</p>
        </div>
        <div className="heading-actions"><Button size="sm" onClick={openCreate}>新增菜单</Button><Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新菜单</Button></div>
      </div>

      <Card className="menus-filter-card">
        <form className="menus-filter-form" onSubmit={submit}>
          <label><span>菜单名称、编码或权限</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按名称、编码或权限筛选" autoComplete="off" /></label>
          <div className="menus-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div>
        </form>
      </Card>

      {query.isLoading ? <div className="loading-panel menus-loading"><Spinner label="正在读取菜单结构" /></div> : null}
      {query.isError && !query.data ? <MenuError message={query.error instanceof Error ? query.error.message : '菜单结构读取失败'} onRetry={() => void query.refetch()} /> : null}
      {query.data ? <Card className="menus-table-card">
        <CardHeader title="菜单目录" description={`共 ${rows.length.toLocaleString('zh-CN')} 个菜单节点`} action={<Badge tone="info">系统 API</Badge>} />
        {rows.length > 0 ? <div className="menus-table-wrap"><table className="menus-table"><thead><tr><th scope="col">菜单名称</th><th scope="col">编码</th><th scope="col">路由</th><th scope="col">权限标识</th><th scope="col">类型</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{rows.map((row) => <MenuRowView key={row.menu.id} row={row} pending={deleteMutation.isPending} onEdit={openEdit} onDelete={openDelete} />)}</tbody></table></div> : <div className="menus-empty" role="status"><span className="menus-empty-icon"><ListTree size={20} /></span><strong>没有匹配的菜单</strong><p>调整筛选条件后重试，或清空筛选条件查看完整菜单。</p></div>}
      </Card> : null}
      <MenuFormModal open={modalMode !== null} mode={modalMode ?? 'create'} menu={editingMenu} menus={flattenMenus(query.data ?? []).map((row) => row.menu)} roles={rolesQuery.data ?? []} roleCodes={menuRolesQuery.data?.roleCodes ?? []} rolesLoading={rolesQuery.isLoading || menuRolesQuery.isFetching} pending={saveMutation.isPending || roleAssignmentMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : roleAssignmentMutation.error instanceof Error ? roleAssignmentMutation.error.message : null} onClose={closeModal} onSubmit={submitMenu} />
      <DeleteConfirmModal open={deletingMenu !== null} resourceLabel="菜单" count={1} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : null} onClose={closeDelete} onConfirm={() => { if (deletingMenu) void deleteMutation.mutateAsync(deletingMenu.id).catch(() => undefined) }} />
    </div>
  )
}

function MenuRowView({ row, pending, onEdit, onDelete }: { row: MenuRow; pending: boolean; onEdit: (menu: NativeMenu) => void; onDelete: (menu: NativeMenu) => void }) {
  const { menu } = row
  return <tr><td><div className="menu-cell" style={{ paddingLeft: `${row.level * 22}px` }}><span className="menu-marker"><ListTree size={15} /></span><strong>{menu.name}</strong></div></td><td className="menu-code">{menu.code}</td><td className="menu-path">{menu.path || '—'}</td><td className="menu-permission">{menu.permission || '—'}</td><td><Badge tone="neutral">{menu.menuType}</Badge></td><td><Badge tone={menu.enabled ? 'success' : 'warning'}>{menu.enabled ? '启用' : '停用'}</Badge></td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={() => onEdit(menu)} disabled={pending}>编辑</Button><Button variant="ghost" size="sm" onClick={() => onDelete(menu)} disabled={pending}>删除</Button></div></td></tr>
}

function flattenMenus(nodes: NativeMenuNode[]): MenuRow[] {
  const rows: MenuRow[] = []
  function visit(items: NativeMenuNode[], level: number) {
    for (const node of items) {
      rows.push({ ...node, level })
      visit(node.children, level + 1)
    }
  }
  visit(nodes, 0)
  return rows
}

function MenuError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel menus-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取菜单结构</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
