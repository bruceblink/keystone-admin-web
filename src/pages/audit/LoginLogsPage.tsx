import { useEffect, useMemo, useState } from 'react'
import { Download, FileClock, RefreshCw, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeLoginLog } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, Spinner, StaleQueryError } from '../../shared/ui'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'

const PAGE_SIZE = 20
type LoginFilters = { username: string; status: string }
const emptyFilters: LoginFilters = { username: '', status: '' }
const urlDefaults = { username: '', status: '', page: 1 }
const urlOptions = { namespace: 'login_logs' }

function formatTime(value: string | null) {
  // 将 Native 返回的 ISO 时间转换为本地管理台格式；无效值保留原文便于排查。
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export function LoginLogsPage() {
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { username, status, page } = urlState
  const filters: LoginFilters = { username, status }
  const [formFilters, setFormFilters] = useState<LoginFilters>(() => filters)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>(null)
  const query = useQuery({ queryKey: ['login-logs', filters, page], queryFn: () => apiClient.listLoginLogs({ ...filters, page, size: PAGE_SIZE }), staleTime: 10_000 })
  const logs = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const description = useMemo(() => query.isLoading ? '正在读取系统 API' : query.isError ? '读取失败，请检查服务连接' : `共 ${total.toLocaleString('zh-CN')} 条登录记录`, [query.isError, query.isLoading, total])

  useEffect(() => {
    setFormFilters({ username, status })
  }, [username, status])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ username: formFilters.username.trim(), status: formFilters.status.trim(), page: 1 })
  }

  function reset() {
    setFormFilters(emptyFilters)
    setUrlState(urlDefaults)
  }

  async function exportLogs() {
    setExportError(null)
    setExporting(true)
    try {
      const result = await apiClient.exportLoginLogs(filters)
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

  return <div className="audit-page">
    <div className="page-heading"><div><p className="eyebrow">AUDIT / LOGIN</p><h1>登录日志</h1><p className="page-description">查询登录成功、失败和会话建立记录，定位身份认证问题。</p></div><div className="heading-actions"><Button variant="secondary" size="sm" onClick={() => void exportLogs()} disabled={exporting || query.isFetching}><Download size={15} className={exporting ? 'spin' : ''} />{exporting ? '导出中' : '导出 Excel'}</Button><Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表</Button></div></div>
    <ActionError title="登录日志导出失败" error={exportError} onDismiss={() => setExportError(null)} />
    <Card className="audit-filter-card"><form className="audit-filter-form" onSubmit={submit}><label><span>用户名</span><input value={formFilters.username} onChange={(event) => setFormFilters((current) => ({ ...current, username: event.target.value }))} placeholder="按用户名筛选" autoComplete="off" /></label><label><span>登录状态</span><input value={formFilters.status} onChange={(event) => setFormFilters((current) => ({ ...current, status: event.target.value }))} placeholder="例如 SUCCESS、FAILURE" autoComplete="off" /></label><div className="audit-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    {query.isLoading ? <div className="loading-panel audit-loading"><Spinner label="正在读取登录日志" /></div> : null}
    {query.isError && !query.data ? <InitialQueryError title="无法读取登录日志" message="登录日志读取失败，请重试" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
    {query.isError && query.data ? <StaleQueryError message={query.error instanceof Error ? query.error.message : '登录日志刷新失败'} error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
    {query.data ? <Card className="audit-table-card"><CardHeader title="登录记录" description={description} action={<Badge tone="info">系统 API</Badge>} />{logs.length > 0 ? <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th scope="col">时间</th><th scope="col">用户名</th><th scope="col">状态</th><th scope="col">来源地址</th><th scope="col">说明</th><th scope="col">客户端</th></tr></thead><tbody>{logs.map((log) => <LoginRow key={log.id} log={log} />)}</tbody></table></div> : <div className="audit-empty" role="status"><span className="audit-empty-icon"><FileClock size={20} /></span><strong>没有匹配的登录记录</strong><p>调整筛选条件后重试。</p></div>}<div className="audit-pagination"><span>第 {query.data.page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setUrlState({ page: page - 1 })}>上一页</Button><Button variant="ghost" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => setUrlState({ page: page + 1 })}>下一页</Button></div></div></Card> : null}
  </div>
}

function LoginRow({ log }: { log: NativeLoginLog }) {
  const success = log.status.toUpperCase() === 'SUCCESS'
  return <tr><td className="audit-time">{formatTime(log.loginAt)}</td><td className="audit-actor">{log.username}</td><td><Badge tone={success ? 'success' : 'danger'}>{log.status}</Badge></td><td>{log.ipAddress ?? '—'}</td><td className="audit-detail" title={log.message ?? undefined}>{log.message ?? '—'}</td><td className="audit-detail" title={log.userAgent ?? undefined}>{log.userAgent ?? '—'}</td></tr>
}
