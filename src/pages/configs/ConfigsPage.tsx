import { useMemo, useState } from 'react'
import { RefreshCw, Search, Settings2, ShieldAlert } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeSystemConfig } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, Spinner } from '../../shared/ui'

// 系统配置页只负责查询和状态展示，写入由后续模态框流程承接。
type ConfigFilters = { keyword: string }
const emptyFilters: ConfigFilters = { keyword: '' }

export function ConfigsPage() {
  const [formFilters, setFormFilters] = useState<ConfigFilters>(emptyFilters)
  const [filters, setFilters] = useState<ConfigFilters>(emptyFilters)
  const query = useQuery({ queryKey: ['system-configs'], queryFn: () => apiClient.listSystemConfigs(), staleTime: 10_000 })
  const configs = useMemo(() => {
    const keyword = filters.keyword.toLocaleLowerCase()
    return (query.data ?? []).filter((config) => !keyword || `${config.key} ${config.description ?? ''}`.toLocaleLowerCase().includes(keyword))
  }, [filters.keyword, query.data])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters({ keyword: formFilters.keyword.trim() })
  }

  function reset() {
    setFormFilters(emptyFilters)
    setFilters(emptyFilters)
  }

  return <div className="configs-page">
    <div className="page-heading"><div><p className="eyebrow">SYSTEM / CONFIGURATION</p><h1>系统配置</h1><p className="page-description">查询运行参数、开关状态和配置更新时间，配置修改将在后续模态框流程中完成。</p></div><div className="heading-actions"><Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新配置</Button></div></div>
    <Card className="configs-filter-card"><form className="configs-filter-form" onSubmit={submit}><label><span>配置键或说明</span><input value={formFilters.keyword} onChange={(event) => setFormFilters({ keyword: event.target.value })} placeholder="按配置键或说明筛选" autoComplete="off" /></label><div className="configs-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    {query.isLoading ? <div className="loading-panel configs-loading"><Spinner label="正在读取系统配置" /></div> : null}
    {query.isError && !query.data ? <ConfigError message={query.error instanceof Error ? query.error.message : '系统配置读取失败'} onRetry={() => void query.refetch()} /> : null}
    {query.data ? <Card className="configs-table-card"><CardHeader title="配置列表" description={`共 ${configs.length.toLocaleString('zh-CN')} 项匹配配置`} action={<Badge tone="info">Native API</Badge>} />{configs.length > 0 ? <div className="configs-table-wrap"><table className="configs-table"><thead><tr><th scope="col">配置键</th><th scope="col">配置值</th><th scope="col">说明</th><th scope="col">状态</th><th scope="col">更新时间</th></tr></thead><tbody>{configs.map((config) => <ConfigRow key={config.id} config={config} />)}</tbody></table></div> : <div className="configs-empty" role="status"><span className="configs-empty-icon"><Settings2 size={20} /></span><strong>没有匹配的系统配置</strong><p>调整筛选条件后重试。</p></div>}</Card> : null}
  </div>
}

function ConfigRow({ config }: { config: NativeSystemConfig }) {
  return <tr><td><code className="config-key">{config.key}</code></td><td className="config-value" title={config.value ?? undefined}>{config.value ?? '—'}</td><td>{config.description ?? '—'}</td><td><Badge tone={config.enabled ? 'success' : 'neutral'}>{config.enabled ? '启用' : '停用'}</Badge></td><td className="config-time">{formatTime(config.updatedAt)}</td></tr>
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function ConfigError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel configs-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取系统配置</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
