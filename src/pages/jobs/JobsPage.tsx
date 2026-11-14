import { useMemo, useState } from 'react'
import { ClipboardList, Eye, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeJob, NativeJobLog, NativeJobLogsPage } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, Spinner } from '../../shared/ui'

const PAGE_SIZE = 20
function formatTime(value: string | null) {
  // 统一任务和任务日志时间显示，避免页面直接暴露原始时区字符串。
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export function JobsPage() {
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [selectedJob, setSelectedJob] = useState<NativeJob | null>(null)
  const [logPage, setLogPage] = useState(1)
  const query = useQuery({ queryKey: ['jobs'], queryFn: () => apiClient.listJobs(), staleTime: 10_000 })
  const jobs = useMemo(() => {
    const normalized = appliedKeyword.toLocaleLowerCase()
    return (query.data ?? []).filter((job) => !normalized || `${job.code} ${job.name} ${job.group}`.toLocaleLowerCase().includes(normalized))
  }, [appliedKeyword, query.data])
  const logsQuery = useQuery({ queryKey: ['job-logs', selectedJob?.id, logPage], queryFn: () => apiClient.listJobLogs({ jobId: selectedJob?.id, page: logPage, size: PAGE_SIZE }), enabled: Boolean(selectedJob), staleTime: 10_000 })
  const total = logsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedKeyword(keyword.trim())
  }

  function reset() {
    setKeyword('')
    setAppliedKeyword('')
  }

  function selectJob(job: NativeJob) {
    // 选择任务后从第一页读取其日志，避免沿用上一个任务的分页位置。
    setSelectedJob(job)
    setLogPage(1)
  }

  return <div className="jobs-page">
    <div className="page-heading"><div><p className="eyebrow">OPERATIONS / JOBS</p><h1>定时任务</h1><p className="page-description">查询任务配置、运行状态和执行日志。执行、暂停和删除将在后续模态框流程中完成。</p></div><div className="heading-actions"><Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新任务</Button></div></div>
    <Card className="jobs-filter-card"><form className="jobs-filter-form" onSubmit={submit}><label><span>任务名称、编码或分组</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按任务名称、编码或分组筛选" autoComplete="off" /></label><div className="jobs-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    {query.isLoading ? <div className="loading-panel jobs-loading"><Spinner label="正在读取任务列表" /></div> : null}
    {query.isError && !query.data ? <JobError message={query.error instanceof Error ? query.error.message : '任务列表读取失败'} onRetry={() => void query.refetch()} /> : null}
    {query.data ? <Card className="jobs-table-card"><CardHeader title="任务列表" description={`共 ${jobs.length.toLocaleString('zh-CN')} 个匹配任务`} action={<Badge tone="info">Native API</Badge>} />{jobs.length > 0 ? <div className="jobs-table-wrap"><table className="jobs-table"><thead><tr><th scope="col">任务</th><th scope="col">分组</th><th scope="col">Cron</th><th scope="col">状态</th><th scope="col">最近运行</th><th scope="col">查看</th></tr></thead><tbody>{jobs.map((job) => <JobRow key={job.id} job={job} selected={selectedJob?.id === job.id} onSelect={() => selectJob(job)} />)}</tbody></table></div> : <div className="jobs-empty" role="status"><span className="jobs-empty-icon"><ClipboardList size={20} /></span><strong>没有匹配的任务</strong><p>调整筛选条件后重试。</p></div>}</Card> : null}
    {selectedJob ? <JobLogsCard job={selectedJob} query={logsQuery} page={logPage} totalPages={totalPages} onPageChange={setLogPage} /> : null}
  </div>
}

function JobRow({ job, selected, onSelect }: { job: NativeJob; selected: boolean; onSelect: () => void }) {
  return <tr className={selected ? 'jobs-row-selected' : undefined}><td><div className="job-cell"><span className="job-marker"><ClipboardList size={15} /></span><div><strong>{job.name}</strong><small>{job.code}</small></div></div></td><td>{job.group || '—'}</td><td><code className="job-cron">{job.cron}</code></td><td><Badge tone={job.enabled ? 'success' : 'neutral'}>{job.enabled ? '启用' : '停用'}</Badge>{job.lastStatus ? <span className="job-last-status">{formatJobStatus(job.lastStatus)}</span> : null}</td><td className="jobs-time">{formatTime(job.lastRunAt)}</td><td><Button variant="ghost" size="sm" onClick={onSelect}><Eye size={14} /> 日志</Button></td></tr>
}

function JobLogsCard({ job, query, page, totalPages, onPageChange }: { job: NativeJob; query: UseQueryResult<NativeJobLogsPage, Error>; page: number; totalPages: number; onPageChange: (page: number) => void }) {
  const logs: NativeJobLog[] = query.data?.items ?? []
  return <Card className="job-logs-card"><CardHeader title={`${job.name} · 执行日志`} description={query.isError ? '读取失败，请检查服务连接' : `共 ${(query.data?.total ?? 0).toLocaleString('zh-CN')} 条记录`} action={<Badge tone="info">只读</Badge>} />{query.isLoading ? <div className="loading-panel jobs-log-loading"><Spinner label="正在读取任务日志" /></div> : query.isError ? <JobError message={query.error instanceof Error ? query.error.message : '任务日志读取失败'} onRetry={() => void query.refetch()} /> : logs.length > 0 ? <div className="jobs-table-wrap"><table className="jobs-table"><thead><tr><th scope="col">时间</th><th scope="col">触发方式</th><th scope="col">状态</th><th scope="col">耗时</th><th scope="col">说明</th></tr></thead><tbody>{logs.map((log) => <JobLogRow key={log.id} log={log} />)}</tbody></table></div> : <div className="jobs-empty" role="status"><span className="jobs-empty-icon"><ClipboardList size={20} /></span><strong>暂无执行日志</strong><p>任务运行后，日志会显示在这里。</p></div>}{query.data ? <div className="jobs-pagination"><span>第 {query.data.page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => onPageChange(page - 1)}>上一页</Button><Button variant="ghost" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => onPageChange(page + 1)}>下一页</Button></div></div> : null}</Card>
}

function JobLogRow({ log }: { log: NativeJobLog }) {
  return <tr><td className="jobs-time">{formatTime(log.createdAt ?? log.finishedAt)}</td><td>{log.triggerType === 1 ? '自动调度' : '手动触发'}</td><td><Badge tone={log.status === 1 ? 'success' : log.status === 2 ? 'warning' : 'danger'}>{formatLogStatus(log.status)}</Badge></td><td>{log.durationMs == null ? '—' : `${log.durationMs} ms`}</td><td className="audit-detail" title={log.jobMessage ?? undefined}>{log.jobMessage ?? '—'}</td></tr>
}

function formatJobStatus(status: string) {
  return ({ SUCCESS: '最近成功', FAILED: '最近失败', SKIPPED: '最近跳过' } as Record<string, string>)[status] ?? status
}
function formatLogStatus(status: number) {
  return ({ 1: '成功', 2: '跳过', 0: '失败' } as Record<number, string>)[status] ?? '未知'
}
function JobError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel jobs-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取任务数据</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
