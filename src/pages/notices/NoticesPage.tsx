import { useMemo, useState } from 'react'
import { Megaphone, Pencil, Plus, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeNotice, NativeNoticeWriteInput } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, Spinner } from '../../shared/ui'
import { NoticeFormModal } from './NoticeFormModal'

// 公告查询在前端完成状态筛选，Native 管理接口继续作为唯一数据来源。
type NoticeFilters = { keyword: string; status: string }
const emptyFilters: NoticeFilters = { keyword: '', status: '' }

export function NoticesPage() {
  const queryClient = useQueryClient()
  const [formFilters, setFormFilters] = useState<NoticeFilters>(emptyFilters)
  const [filters, setFilters] = useState<NoticeFilters>(emptyFilters)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingNotice, setEditingNotice] = useState<NativeNotice | null>(null)
  const query = useQuery({ queryKey: ['notices'], queryFn: () => apiClient.listNotices(), staleTime: 10_000 })
  const saveMutation = useMutation({ mutationFn: ({ id, input }: { id?: string; input: NativeNoticeWriteInput }) => id ? apiClient.updateNotice(id, input) : apiClient.createNotice(input), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['notices'] }); setModalMode(null); setEditingNotice(null) } })
  const publishMutation = useMutation({ mutationFn: ({ id, published }: { id: string; published: boolean }) => apiClient.publishNotice(id, published), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notices'] }) })
  const notices = useMemo(() => (query.data ?? []).filter((notice) => {
    const keyword = filters.keyword.toLocaleLowerCase()
    const matchesKeyword = !keyword || `${notice.title} ${notice.content} ${notice.noticeType}`.toLocaleLowerCase().includes(keyword)
    const matchesStatus = !filters.status || (filters.status === 'published' ? notice.published : !notice.published)
    return matchesKeyword && matchesStatus
  }), [filters, query.data])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters({ keyword: formFilters.keyword.trim(), status: formFilters.status })
  }

  function reset() {
    setFormFilters(emptyFilters)
    setFilters(emptyFilters)
  }

  function openCreate() { saveMutation.reset(); setEditingNotice(null); setModalMode('create') }
  function openEdit(notice: NativeNotice) { saveMutation.reset(); setEditingNotice(notice); setModalMode('edit') }
  function closeModal() { if (saveMutation.isPending) return; setModalMode(null); setEditingNotice(null) }
  async function submitNotice(input: NativeNoticeWriteInput) { try { await saveMutation.mutateAsync({ id: editingNotice?.id, input }) } catch { /* 保留表单状态和错误。 */ } }

  return <div className="notices-page">
    <div className="page-heading"><div><p className="eyebrow">SYSTEM / NOTICES</p><h1>通知公告</h1><p className="page-description">查询管理公告、发布状态和创建信息。新增和编辑在模态框中完成。</p></div><div className="heading-actions"><Button size="sm" onClick={openCreate}><Plus size={15} /> 新增公告</Button><Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新公告</Button></div></div>
    <Card className="notices-filter-card"><form className="notices-filter-form" onSubmit={submit}><label><span>标题或内容</span><input value={formFilters.keyword} onChange={(event) => setFormFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="按标题、内容或类型筛选" autoComplete="off" /></label><label><span>发布状态</span><select value={formFilters.status} onChange={(event) => setFormFilters((current) => ({ ...current, status: event.target.value }))}><option value="">全部状态</option><option value="published">已发布</option><option value="unpublished">未发布</option></select></label><div className="notices-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    {query.isLoading ? <div className="loading-panel notices-loading"><Spinner label="正在读取通知公告" /></div> : null}
    {query.isError && !query.data ? <NoticeError message={query.error instanceof Error ? query.error.message : '通知公告读取失败'} onRetry={() => void query.refetch()} /> : null}
    {query.data ? <Card className="notices-table-card"><CardHeader title="公告列表" description={`共 ${notices.length.toLocaleString('zh-CN')} 条匹配公告`} action={<Badge tone="info">Native API</Badge>} />{notices.length > 0 ? <div className="notices-table-wrap"><table className="notices-table"><thead><tr><th scope="col">公告</th><th scope="col">类型</th><th scope="col">状态</th><th scope="col">发布人</th><th scope="col">发布时间</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead><tbody>{notices.map((notice) => <NoticeRow key={notice.id} notice={notice} onEdit={() => openEdit(notice)} onPublish={() => publishMutation.mutate({ id: notice.id, published: !notice.published })} pending={publishMutation.isPending} />)}</tbody></table></div> : <div className="notices-empty" role="status"><span className="notices-empty-icon"><Megaphone size={20} /></span><strong>没有匹配的公告</strong><p>调整筛选条件后重试。</p></div>}</Card> : null}
    <NoticeFormModal open={modalMode !== null} mode={modalMode ?? 'create'} notice={editingNotice} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : null} onClose={closeModal} onSubmit={submitNotice} />
  </div>
}

function NoticeRow({ notice, onEdit, onPublish, pending }: { notice: NativeNotice; onEdit: () => void; onPublish: () => void; pending: boolean }) {
  return <tr><td><div className="notice-cell"><span className="notice-cell-icon"><Megaphone size={15} /></span><div><strong>{notice.title}</strong><small title={notice.content}>{notice.content}</small></div></div></td><td>{notice.noticeType || '—'}</td><td><Badge tone={notice.published ? 'success' : 'neutral'}>{notice.published ? '已发布' : '未发布'}</Badge></td><td>{notice.createdBy || '—'}</td><td className="notice-time">{formatTime(notice.publishAt)}</td><td className="notice-time">{formatTime(notice.createdAt)}</td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={onEdit}><Pencil size={14} /> 编辑</Button><Button variant="ghost" size="sm" onClick={onPublish} disabled={pending}>{notice.published ? '取消发布' : '发布'}</Button></div></td></tr>
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function NoticeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel notices-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取通知公告</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
