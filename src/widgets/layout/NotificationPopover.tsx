import { ArrowLeft, Bell, RefreshCw, X } from 'lucide-react'
import type { Notification } from '../../shared/api/schemas'
import { Button } from '../../shared/ui'

type Props = {
  notices: Notification[]
  loading: boolean
  error: string | null
  refreshError: string | null
  selected: Notification | null
  readError: string | null
  onSelect: (notice: Notification) => void
  onBack: () => void
  onRetry: () => void
  onClose: () => void
}

/** 站内通知只负责列表和详情展示，不承担公告管理操作或页面跳转。 */
export function NotificationPopover({ notices, loading, error, refreshError, selected, readError, onSelect, onBack, onRetry, onClose }: Props) {
  return <section className="notification-popover" role="dialog" aria-label="站内通知">
    <header className="notification-popover-header">
      {selected ? <Button variant="ghost" size="sm" onClick={onBack} aria-label="返回通知列表"><ArrowLeft size={15} /></Button> : <span className="notification-popover-icon"><Bell size={16} /></span>}
      <div><strong>{selected ? '通知详情' : '站内通知'}</strong><span>{selected ? '查看通知内容' : `${notices.length} 条可见通知`}</span></div>
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭通知"><X size={16} /></Button>
    </header>
    {loading ? <div className="notification-state" role="status">正在读取通知</div> : null}
    {error ? <div className="notification-state notification-state-error" role="alert"><span>{error}</span><Button variant="ghost" size="sm" onClick={onRetry}>重试</Button></div> : null}
    {refreshError ? <div className="notification-state notification-state-error" role="alert"><span>通知刷新失败，当前显示上次读取的内容。</span><Button variant="ghost" size="sm" onClick={onRetry}>重试</Button></div> : null}
    {!loading && !error && selected ? <article className="notification-detail"><p className="notification-detail-meta">{formatNoticeDate(selected.createdAt)}</p><h3>{selected.title}</h3><p>{selected.content}</p>{readError ? <div className="notification-state notification-state-error" role="alert"><span>{readError}</span><Button variant="ghost" size="sm" onClick={() => onSelect(selected)}>重试</Button></div> : null}</article> : null}
    {!loading && !error && !selected ? <div className="notification-list" role="list">{notices.length > 0 ? notices.map((notice) => <button key={notice.id} type="button" className="notification-list-item" onClick={() => onSelect(notice)}><span className="notification-list-dot" aria-hidden="true" style={{ visibility: notice.readAt ? 'hidden' : 'visible' }} /><span><strong>{notice.title}</strong><small>{formatNoticeDate(notice.createdAt)}{notice.readAt ? '' : ' · 未读'}</small></span></button>) : <div className="notification-state" role="status">暂无站内通知</div>}</div> : null}
  </section>
}

function formatNoticeDate(value: string | null) {
  if (!value) return '刚刚'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
