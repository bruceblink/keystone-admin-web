import { useMemo, useState } from 'react'
import { Download, Pencil, Plus, RefreshCw, Search, ShieldAlert, BriefcaseBusiness } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativePost, NativePostWriteInput } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, DeleteConfirmModal, Spinner } from '../../shared/ui'
import { PostFormModal } from './PostFormModal'

const PAGE_SIZE = 20
type PostFilters = { keyword: string; status: string }
const emptyFilters: PostFilters = { keyword: '', status: '' }

export function PostsPage() {
  const queryClient = useQueryClient()
  const [formFilters, setFormFilters] = useState<PostFilters>(emptyFilters)
  const [filters, setFilters] = useState<PostFilters>(emptyFilters)
  const [page, setPage] = useState(1)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingPost, setEditingPost] = useState<NativePost | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [deletingPost, setDeletingPost] = useState<NativePost | null>(null)
  const query = useQuery({ queryKey: ['posts'], queryFn: () => apiClient.listPosts(), staleTime: 10_000 })
  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: NativePostWriteInput }) => id ? apiClient.updatePost(id, input) : apiClient.createPost(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
      setModalMode(null)
      setEditingPost(null)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deletePost(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
      setDeletingPost(null)
    },
  })

  const filteredPosts = useMemo(() => {
    const keyword = filters.keyword.toLocaleLowerCase()
    return (query.data ?? []).filter((post) => {
      const matchesKeyword = !keyword || `${post.code} ${post.name}`.toLocaleLowerCase().includes(keyword)
      const matchesStatus = !filters.status || (filters.status === 'enabled' ? post.enabled : !post.enabled)
      return matchesKeyword && matchesStatus
    })
  }, [filters, query.data])
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE))
  const visiblePosts = filteredPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters({ keyword: formFilters.keyword.trim(), status: formFilters.status })
    setPage(1)
  }

  function resetFilters() {
    setFormFilters(emptyFilters)
    setFilters(emptyFilters)
    setPage(1)
  }

  function openCreate() {
    saveMutation.reset()
    setEditingPost(null)
    setModalMode('create')
  }

  function openEdit(post: NativePost) {
    saveMutation.reset()
    setEditingPost(post)
    setModalMode('edit')
  }

  function closeModal() {
    if (saveMutation.isPending) return
    setModalMode(null)
    setEditingPost(null)
  }

  async function submitPost(input: NativePostWriteInput) {
    try {
      await saveMutation.mutateAsync({ id: editingPost?.id, input })
    } catch {
      // 模态框保留输入内容，并显示服务端返回的错误。
    }
  }

  async function exportPosts() {
    setExportError(null)
    setExporting(true)
    try {
      const result = await apiClient.exportPosts()
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '岗位导出失败')
    } finally {
      setExporting(false)
    }
  }

  function openDelete(post: NativePost) { deleteMutation.reset(); setDeletingPost(post) }
  function closeDelete() { if (!deleteMutation.isPending) setDeletingPost(null) }

  return (
    <div className="posts-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZATION / POSTS</p>
          <h1>岗位管理</h1>
          <p className="page-description">查询岗位编码、显示排序和启用状态。新增和编辑在模态框中完成。</p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" size="sm" onClick={() => void exportPosts()} disabled={exporting || query.isFetching}><Download size={15} className={exporting ? 'spin' : ''} />{exporting ? '导出中' : '导出 Excel'}</Button>
          <Button size="sm" onClick={openCreate}><Plus size={15} /> 新增岗位</Button>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新岗位</Button>
        </div>
      </div>

      {exportError ? <div className="error-panel posts-error" role="alert"><ShieldAlert size={19} /><div><strong>岗位导出失败</strong><p>{exportError}</p></div></div> : null}

      <Card className="posts-filter-card">
        <form className="posts-filter-form" onSubmit={submitFilters}>
          <label><span>岗位名称或编码</span><input value={formFilters.keyword} onChange={(event) => setFormFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="按岗位名称或编码筛选" autoComplete="off" /></label>
          <label><span>岗位状态</span><select value={formFilters.status} onChange={(event) => setFormFilters((current) => ({ ...current, status: event.target.value }))}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
          <div className="posts-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={resetFilters}>重置</Button></div>
        </form>
      </Card>

      {query.isLoading ? <div className="loading-panel posts-loading"><Spinner label="正在读取岗位列表" /></div> : null}
      {query.isError && !query.data ? <PostError message={query.error instanceof Error ? query.error.message : '岗位列表读取失败'} onRetry={() => void query.refetch()} /> : null}
      {query.data ? <Card className="posts-table-card">
        <CardHeader title="岗位列表" description={`共 ${filteredPosts.length.toLocaleString('zh-CN')} 个匹配岗位`} action={<Badge tone="info">Native API</Badge>} />
        {visiblePosts.length > 0 ? <div className="posts-table-wrap"><table className="posts-table"><thead><tr><th scope="col">岗位</th><th scope="col">编码</th><th scope="col">排序</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{visiblePosts.map((post) => <PostRow key={post.id} post={post} pending={deleteMutation.isPending} onEdit={openEdit} onDelete={openDelete} />)}</tbody></table></div> : <div className="posts-empty" role="status"><span className="posts-empty-icon"><BriefcaseBusiness size={20} /></span><strong>没有匹配的岗位</strong><p>调整筛选条件后重试，或清空筛选条件查看全部岗位。</p></div>}
        <div className="posts-pagination"><span>第 {page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || query.isFetching}>上一页</Button><Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || query.isFetching}>下一页</Button></div></div>
      </Card> : null}

      <PostFormModal open={modalMode !== null} mode={modalMode ?? 'create'} post={editingPost} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : null} onClose={closeModal} onSubmit={submitPost} />
      <DeleteConfirmModal open={deletingPost !== null} resourceLabel="岗位" count={1} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : null} onClose={closeDelete} onConfirm={() => { if (deletingPost) void deleteMutation.mutateAsync(deletingPost.id).catch(() => undefined) }} />
    </div>
  )
}

function PostRow({ post, pending, onEdit, onDelete }: { post: NativePost; pending: boolean; onEdit: (post: NativePost) => void; onDelete: (post: NativePost) => void }) {
  return <tr><td><div className="post-cell"><span className="post-cell-icon"><BriefcaseBusiness size={15} /></span><div><strong>{post.name}</strong><small>{post.code}</small></div></div></td><td><code className="post-code">{post.code}</code></td><td>{post.sortOrder}</td><td><Badge tone={post.enabled ? 'success' : 'warning'}>{post.enabled ? '启用' : '停用'}</Badge></td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={() => onEdit(post)} disabled={pending}><Pencil size={14} /> 编辑</Button><Button variant="ghost" size="sm" onClick={() => onDelete(post)} disabled={pending}>删除</Button></div></td></tr>
}

function PostError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel posts-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取岗位列表</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
