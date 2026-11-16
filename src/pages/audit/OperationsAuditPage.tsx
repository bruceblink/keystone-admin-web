import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Download, RefreshCw, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeOperationLog } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, Spinner, StaleQueryError } from '../../shared/ui'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'

const PAGE_SIZE = 20

type OperationFilters = {
  actor: string
  action: string
  resource: string
}

const emptyFilters: OperationFilters = { actor: '', action: '', resource: '' }
const urlDefaults = { actor: '', action: '', resource: '', page: 1 }
const urlOptions = { namespace: 'operations_audit' }

// 将 Native ISO 时间统一为管理台可读格式，保留无效值用于排查。
function formatCreatedAt(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export function OperationsAuditPage() {
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { actor, action, resource, page } = urlState
  const filters: OperationFilters = { actor, action, resource }
  const [formFilters, setFormFilters] = useState<OperationFilters>(() => filters)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>(null)
  const query = useQuery({
    queryKey: ['operation-logs', filters, page],
    queryFn: () => apiClient.listOperationLogs({ ...filters, page, size: PAGE_SIZE }),
    staleTime: 10_000,
  })
  const logs = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const resultDescription = useMemo(() => {
    if (query.isLoading) return '正在读取系统 API'
    if (query.isError) return '读取失败，请检查服务连接'
    return `共 ${total.toLocaleString('zh-CN')} 条操作记录`
  }, [query.isError, query.isLoading, total])

  useEffect(() => {
    setFormFilters({ actor, action, resource })
  }, [actor, action, resource])

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({
      actor: formFilters.actor.trim(),
      action: formFilters.action.trim(),
      resource: formFilters.resource.trim(),
      page: 1,
    })
  }

  function resetFilters() {
    setFormFilters(emptyFilters)
    setUrlState(urlDefaults)
  }

  function refresh() {
    void query.refetch()
  }

  async function exportLogs() {
    setExportError(null)
    setExporting(true)
    try {
      const result = await apiClient.exportOperationLogs(filters)
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
    <div className="audit-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AUDIT / OPERATIONS</p>
          <h1>操作审计</h1>
          <p className="page-description">查询管理操作、执行主体和资源变更记录，支持按条件定位审计事件。</p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" size="sm" onClick={() => void exportLogs()} disabled={exporting || query.isFetching}>
            <Download size={15} className={exporting ? 'spin' : ''} />{exporting ? '导出中' : '导出 Excel'}
          </Button>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}>
            <RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表
          </Button>
        </div>
      </div>

      <ActionError title="操作审计导出失败" error={exportError} onDismiss={() => setExportError(null)} />
      <Card className="audit-filter-card">
        <form className="audit-filter-form" onSubmit={submitFilters}>
          <label>
            <span>操作用户</span>
            <input
              value={formFilters.actor}
              onChange={(event) => setFormFilters((current) => ({ ...current, actor: event.target.value }))}
              placeholder="按用户名筛选"
              autoComplete="off"
            />
          </label>
          <label>
            <span>操作动作</span>
            <input
              value={formFilters.action}
              onChange={(event) => setFormFilters((current) => ({ ...current, action: event.target.value }))}
              placeholder="例如 UPDATE、DELETE"
              autoComplete="off"
            />
          </label>
          <label>
            <span>资源类型</span>
            <input
              value={formFilters.resource}
              onChange={(event) => setFormFilters((current) => ({ ...current, resource: event.target.value }))}
              placeholder="例如 user、role"
              autoComplete="off"
            />
          </label>
          <div className="audit-filter-actions">
            <Button type="submit" size="sm" disabled={query.isFetching}>
              <Search size={15} /> 查询
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters} disabled={query.isFetching && !query.data}>
              重置
            </Button>
          </div>
        </form>
      </Card>

      {query.isLoading ? <div className="loading-panel audit-loading"><Spinner label="正在读取操作审计" /></div> : null}
      {query.isError && !query.data ? <InitialQueryError title="无法读取操作审计" message="操作审计读取失败，请重试" error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}
      {query.isError && query.data ? <StaleQueryError message={query.error instanceof Error ? query.error.message : '操作审计刷新失败'} error={query.error} onRetry={refresh} retrying={query.isFetching} /> : null}

      {query.data ? (
        <Card className="audit-table-card">
          <CardHeader title="操作记录" description={resultDescription} action={<Badge tone="info">系统 API</Badge>} />
          {logs.length > 0 ? (
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th scope="col">时间</th>
                    <th scope="col">操作用户</th>
                    <th scope="col">动作</th>
                    <th scope="col">资源</th>
                    <th scope="col">资源 ID</th>
                    <th scope="col">操作详情</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => <OperationRow key={log.id} log={log} />)}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="audit-empty" role="status">
              <span className="audit-empty-icon"><ClipboardList size={20} /></span>
              <strong>没有匹配的操作记录</strong>
              <p>调整筛选条件后重试，或清空筛选条件查看全部记录。</p>
            </div>
          )}
          <div className="audit-pagination">
            <span>第 {query.data.page} / {totalPages} 页</span>
            <div>
              <Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setUrlState({ page: page - 1 })}>上一页</Button>
              <Button variant="ghost" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => setUrlState({ page: page + 1 })}>下一页</Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function OperationRow({ log }: { log: NativeOperationLog }) {
  return (
    <tr>
      <td className="audit-time">{formatCreatedAt(log.createdAt)}</td>
      <td className="audit-actor">{log.actorUsername}</td>
      <td><Badge tone="neutral">{log.action}</Badge></td>
      <td className="audit-resource">{log.resource}</td>
      <td className="audit-resource-id">{log.resourceId ?? '—'}</td>
      <td className="audit-detail" title={log.detail ?? undefined}>{log.detail ?? '—'}</td>
    </tr>
  )
}
