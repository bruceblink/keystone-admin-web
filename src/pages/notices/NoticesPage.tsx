import { useEffect, useState } from 'react'
import { Megaphone, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCapabilityQuery } from '../../shared/auth/CapabilityAvailability'
import { apiClient } from '../../shared/api/client'
import type { NativeNotice, NativeNoticeWriteInput } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, ListToolbar, Spinner, StaleQueryError } from '../../shared/ui'
import { formatApiError } from '../../shared/api/errors'
import { NoticeFormModal } from './NoticeFormModal'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'

type NoticeFilters = { keyword: string; status: string }
const PAGE_SIZE = 20
const urlDefaults = { keyword: '', status: 'all', page: 1 }
const urlOptions = { namespace: 'notices' }

export function NoticesPage() {
  const queryClient = useQueryClient()
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { keyword: appliedKeyword, status: appliedStatus, page } = urlState
  const [formFilters, setFormFilters] = useState<NoticeFilters>({ keyword: appliedKeyword, status: appliedStatus })
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingNotice, setEditingNotice] = useState<NativeNotice | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const query = useCapabilityQuery({ queryKey: ['notices', appliedKeyword, appliedStatus, page], queryFn: () => apiClient.listNoticesPage({ keyword: appliedKeyword, status: appliedStatus, page, size: PAGE_SIZE }), staleTime: 10_000 })
  const saveMutation = useMutation({ mutationFn: ({ id, input }: { id?: string; input: NativeNoticeWriteInput }) => id ? apiClient.updateNotice(id, input) : apiClient.createNotice(input), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['notices'] }); setUrlState({ page: 1 }); setModalMode(null); setEditingNotice(null) } })
  const publishMutation = useMutation({ mutationFn: ({ id, published }: { id: string; published: boolean }) => apiClient.publishNotice(id, published), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['notices'] }); setUrlState({ page: 1 }) } })
  const deleteMutation = useMutation({ mutationFn: (ids: string[]) => apiClient.deleteNotices(ids), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['notices'] }); setUrlState({ page: 1 }); setSelectedIds([]); setDeleteOpen(false) } })
  const notices = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allSelected = notices.length > 0 && notices.every((notice) => selectedIds.includes(notice.id))

  useEffect(() => { setFormFilters({ keyword: appliedKeyword, status: appliedStatus }) }, [appliedKeyword, appliedStatus])
  useEffect(() => { setSelectedIds([]) }, [appliedKeyword, appliedStatus, page])
  useEffect(() => { if (query.data && page > totalPages) setUrlState({ page: totalPages }) }, [page, query.data, setUrlState, totalPages])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ keyword: formFilters.keyword.trim(), status: formFilters.status || 'all', page: 1 }, { history: 'push' })
  }

  function reset() {
    setFormFilters({ keyword: '', status: 'all' })
    setUrlState(urlDefaults, { history: 'push' })
  }

  function openCreate() { saveMutation.reset(); setEditingNotice(null); setModalMode('create') }
  function openEdit(notice: NativeNotice) { saveMutation.reset(); setEditingNotice(notice); setModalMode('edit') }
  function closeModal() { if (saveMutation.isPending) return; setModalMode(null); setEditingNotice(null) }
  async function submitNotice(input: NativeNoticeWriteInput) { try { await saveMutation.mutateAsync({ id: editingNotice?.id, input }) } catch { /* 保留表单状态和错误。 */ } }
  function toggleNotice(id: string, checked: boolean) { setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)) }
  function toggleAllNotices(checked: boolean) { setSelectedIds(checked ? notices.map((notice) => notice.id) : []) }
  function openDelete() { deleteMutation.reset(); setDeleteOpen(true) }
  function closeDelete() { if (!deleteMutation.isPending) setDeleteOpen(false) }
  function publishNotice(notice: NativeNotice) {
    publishMutation.reset()
    publishMutation.mutate({ id: notice.id, published: !notice.published })
  }

  return <div className="notices-page">
    <div className="page-heading"><div><p className="eyebrow">SYSTEM / NOTICES</p><h1>通知公告</h1><p className="page-description">查询管理公告、发布状态和创建信息。新增和编辑在模态框中完成。</p></div></div>
    <ActionError title="公告状态更新失败" error={publishMutation.error} onDismiss={() => publishMutation.reset()} />
    <ActionError title="公告删除失败" error={deleteMutation.error} onDismiss={() => deleteMutation.reset()} />
    <Card className="notices-filter-card"><form className="notices-filter-form" onSubmit={submit}><label><span>标题或内容</span><input value={formFilters.keyword} onChange={(event) => setFormFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="按标题、内容或类型筛选" autoComplete="off" /></label><label><span>发布状态</span><select value={formFilters.status} onChange={(event) => setFormFilters((current) => ({ ...current, status: event.target.value }))}><option value="">全部状态</option><option value="published">已发布</option><option value="unpublished">未发布</option></select></label><div className="notices-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    <Card className="notices-table-card">
      <ListToolbar label="通知公告列表操作">
        <Button size="sm" onClick={openCreate}><Plus size={15} /> 新增公告</Button>
        <Button variant="danger" size="sm" onClick={openDelete} disabled={selectedIds.length === 0 || deleteMutation.isPending}>删除公告（{selectedIds.length}）</Button>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新公告</Button>
      </ListToolbar>
      <CardHeader title="公告列表" description={query.isLoading ? '正在读取系统 API' : query.isError ? '读取失败，请检查服务连接' : `共 ${total.toLocaleString('zh-CN')} 条匹配公告`} action={<Badge tone="info">系统 API</Badge>} />
      {query.isLoading ? <div className="loading-panel notices-loading"><Spinner label="正在读取通知公告" /></div> : null}
      {query.isError && !query.data ? <InitialQueryError title="无法读取通知公告" message="通知公告读取失败，请重试" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
      {query.isError && query.data ? <StaleQueryError message={formatApiError(query.error, '通知公告刷新失败，请重试')} error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
      {query.data ? <>{notices.length > 0 ? <div className="notices-table-wrap"><table className="notices-table"><thead><tr><th scope="col"><input type="checkbox" aria-label="选择当前公告" checked={allSelected} onChange={(event) => toggleAllNotices(event.target.checked)} disabled={deleteMutation.isPending} /></th><th scope="col">公告</th><th scope="col">类型</th><th scope="col">状态</th><th scope="col">发布人</th><th scope="col">发布时间</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead><tbody>{notices.map((notice) => <NoticeRow key={notice.id} notice={notice} selected={selectedIds.includes(notice.id)} pending={publishMutation.isPending || deleteMutation.isPending} onSelect={toggleNotice} onEdit={() => openEdit(notice)} onPublish={() => publishNotice(notice)} />)}</tbody></table></div> : <div className="notices-empty" role="status"><span className="notices-empty-icon"><Megaphone size={20} /></span><strong>没有匹配的公告</strong><p>调整筛选条件后重试。</p></div>}{totalPages > 1 ? <div className="notices-pagination"><span>第 {page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setUrlState({ page: page - 1 }, { history: 'push' })}>上一页</Button><Button variant="ghost" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => setUrlState({ page: page + 1 }, { history: 'push' })}>下一页</Button></div></div> : null}</> : null}
    </Card>
    <NoticeFormModal open={modalMode !== null} mode={modalMode ?? 'create'} notice={editingNotice} pending={saveMutation.isPending} error={saveMutation.error} onClose={closeModal} onSubmit={submitNotice} />
    <DeleteConfirmModal open={deleteOpen} resourceLabel="公告" count={selectedIds.length} pending={deleteMutation.isPending} error={deleteMutation.error} onClose={closeDelete} onConfirm={() => void deleteMutation.mutateAsync(selectedIds).catch(() => undefined)} />
  </div>
}

function NoticeRow({ notice, selected, onSelect, onEdit, onPublish, pending }: { notice: NativeNotice; selected: boolean; onSelect: (id: string, checked: boolean) => void; onEdit: () => void; onPublish: () => void; pending: boolean }) {
  return <tr><td><input type="checkbox" aria-label={`选择公告 ${notice.title}`} checked={selected} onChange={(event) => onSelect(notice.id, event.target.checked)} disabled={pending} /></td><td><div className="notice-cell"><span className="notice-cell-icon"><Megaphone size={15} /></span><div><strong>{notice.title}</strong><small title={notice.content}>{notice.content}</small></div></div></td><td>{notice.noticeType || '—'}</td><td><Badge tone={notice.published ? 'success' : 'neutral'}>{notice.published ? '已发布' : '未发布'}</Badge></td><td>{notice.createdBy || '—'}</td><td className="notice-time">{formatTime(notice.publishAt)}</td><td className="notice-time">{formatTime(notice.createdAt)}</td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={onEdit} disabled={pending}><Pencil size={14} /> 编辑</Button><Button variant="ghost" size="sm" onClick={onPublish} disabled={pending}>{notice.published ? '取消发布' : '发布'}</Button></div></td></tr>
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
