import { useEffect, useMemo, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Activity, ArrowDownToLine, ArrowUpFromLine, CircleHelp, Database, HardDrive, Layers3, MemoryStick, RefreshCw, Server, Signal, UserRound, Wifi } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { MfaStepUpModal } from '../../shared/auth/MfaStepUpModal'
import { useMfaStepUp } from '../../shared/auth/useMfaStepUp'
import { useSessionStore } from '../../shared/state/session'
import { appendMonitorTrendSample, formatDateTime, formatPercent, formatRate, statusTone } from '../../entities/monitor/format'
import type { MonitorStatus, SessionSummary, TrendPoint } from '../../entities/monitor/types'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, Spinner, StaleQueryError } from '../../shared/ui'
import { TrendChart } from '../../widgets/monitor/TrendChart'

const statusLabels = { LIVE: 'LIVE', STALE: 'STALE', OFFLINE: 'OFFLINE', PARTIAL: 'PARTIAL' } as const

export function MonitorPage() {
  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<unknown>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [memoryTrend, setMemoryTrend] = useState<TrendPoint[]>([])
  const stepUp = useMfaStepUp()
  const clearSession = useSessionStore((state) => state.clearSession)

  // 每类资源分别缓存和刷新，单项权限拒绝不会覆盖其他接口的成功结果。
  const serverQuery = useQuery({ queryKey: ['monitor', 'server-info'], queryFn: apiClient.getMonitorServerInfo, refetchInterval: 15_000, staleTime: 10_000 })
  const cacheQuery = useQuery({ queryKey: ['monitor', 'cache-info'], queryFn: apiClient.getMonitorCacheInfo, refetchInterval: 15_000, staleTime: 10_000 })
  const onlineQuery = useQuery({ queryKey: ['monitor', 'online-users', 1, 100], queryFn: apiClient.listMonitorOnlineUsers, refetchInterval: 15_000, staleTime: 10_000 })

  useEffect(() => {
    const result = serverQuery.data
    if (!result || result.source !== 'api' || serverQuery.dataUpdatedAt <= 0 || result.value.maxMemory <= 0) return

    setMemoryTrend((samples) => appendMonitorTrendSample(samples, {
      timestamp: new Date(serverQuery.dataUpdatedAt).toISOString(),
      cpu: null,
      memory: result.value.heapUsed / result.value.maxMemory * 100,
    }))
  }, [serverQuery.data, serverQuery.dataUpdatedAt])

  const serverInfo = serverQuery.data?.value
  const cacheInfo = cacheQuery.data?.value
  const onlineUsers = onlineQuery.data?.value
  const sessions = onlineUsers?.items.map((session) => ({
    id: session.sessionId,
    user: session.username,
    role: session.displayName,
    ip: session.ipAddress ?? '—',
    lastSeen: session.createdAt,
    currentPage: '—',
  })) ?? []
  const memory = serverInfo && serverInfo.maxMemory > 0
    ? serverInfo.heapUsed / serverInfo.maxMemory * 100
    : null
  const node = serverInfo ? `${serverInfo.jvmName} · ${serverInfo.osName}` : '—'
  const queryStates = [serverQuery, cacheQuery, onlineQuery]
  const isRefreshing = queryStates.some((query) => query.isFetching)
  const allInitialReadsFailed = queryStates.every((query) => query.isError && query.data === undefined)
  const anyReadFailed = queryStates.some((query) => query.isError)
  const allLoadedResourcesAreStale = queryStates.every((query) => query.isError && query.data !== undefined)
  const allResourcesLoaded = queryStates.every((query) => query.data !== undefined)
  const allResourcesLoading = queryStates.every((query) => query.isLoading)
  const hasMockResource = queryStates.some((query) => query.data?.source === 'mock')
  const hasApiResource = queryStates.some((query) => query.data?.source === 'api')
  const sourceLabel = hasMockResource ? hasApiResource ? '系统 API + 开发 Mock' : '开发环境 Mock' : '系统 API'
  const computedStatus: MonitorStatus = allInitialReadsFailed
    ? 'OFFLINE'
    : allLoadedResourcesAreStale
      ? 'STALE'
      : anyReadFailed
        ? 'PARTIAL'
        : allResourcesLoaded ? 'PARTIAL' : 'STALE'
  const computedStatusMessage = allInitialReadsFailed
    ? '暂时无法读取监控资源'
    : allResourcesLoading || (!allResourcesLoaded && !anyReadFailed)
      ? '正在读取监控资源'
      : allLoadedResourcesAreStale
        ? '最新读取失败，保留各项旧数据'
        : anyReadFailed
          ? '部分监控资源读取失败'
          : '部分监控指标暂未提供'
  const lastUpdatedAt = Math.max(...queryStates.map((query) => query.data === undefined ? 0 : query.dataUpdatedAt))
  const lastUpdated = lastUpdatedAt > 0 ? `最近读取 ${formatDateTime(new Date(lastUpdatedAt).toISOString())}` : '等待快照'

  const summary = useMemo(() => {
    const host = serverInfo ? `${serverInfo.jvmName} · ${serverInfo.osName}` : '主机信息不可用'
    const count = onlineUsers ? `${onlineUsers.items.length} 个在线会话` : '在线会话暂不可用'
    return `${host}，内存 ${formatPercent(memory)}，${count}。`
  }, [memory, onlineUsers, serverInfo])

  function refreshAll() {
    setNotice(null)
    setActionError(null)
    void Promise.all([serverQuery.refetch(), cacheQuery.refetch(), onlineQuery.refetch()])
  }

  async function forceLogout(session: SessionSummary) {
    setNotice(null)
    setActionError(null)

    try {
      const result = await stepUp.run(() => apiClient.revokeOnlineSession(session.id))
      setSelectedSession(null)
      if (result.currentSessionRevoked) {
        clearSession('当前会话已下线，请重新登录')
        return
      }
      setNotice(`已完成下线：${session.user}`)
      void onlineQuery.refetch()
    } catch (error) {
      setActionError(error)
    }
  }

  return (
    <div className="monitor-page">
      <div className="page-heading">
        <div><p className="eyebrow">OPERATIONS / MONITORING</p><h1>运行监控</h1><p className="page-description">快速判断平台健康，定位异常，并处理在线会话。</p></div>
        <div className="heading-actions"><Button variant="secondary" size="sm" onClick={refreshAll} disabled={isRefreshing}><RefreshCw size={15} className={isRefreshing ? 'spin' : ''} /> 刷新快照</Button><Button variant="ghost" size="sm" aria-label="监控帮助" aria-expanded={helpOpen} onClick={() => setHelpOpen((current) => !current)}><CircleHelp size={17} /></Button></div>
      </div>
      {helpOpen ? <div className="monitor-help-panel" role="note"><CircleHelp size={17} /><div><strong>如何阅读监控</strong><p>状态和资源统计来自独立系统 API。显示“—”表示当前后端没有提供该指标；PARTIAL 表示部分指标或资源不可用。</p></div><Button variant="ghost" size="sm" aria-label="关闭监控帮助" onClick={() => setHelpOpen(false)}>关闭</Button></div> : null}
      <ActionError title="强制下线失败" error={actionError} onDismiss={() => setActionError(null)} />
      <div className="monitor-status-bar">
        <div className="status-leading"><span className={`status-pulse status-pulse-${statusTone(computedStatus)}`} /><Badge tone={statusTone(computedStatus)}>{statusLabels[computedStatus]}</Badge><span>{computedStatusMessage}</span></div>
        <div className="status-meta"><span>{lastUpdated}</span><span className="status-source">来源：{sourceLabel}</span></div>
      </div>
      {notice ? <div className="inline-notice" role="status">{notice}</div> : null}
      <p className="sr-only" aria-live="polite">{summary}</p>
      <div className="monitor-grid">
        <section className="monitor-main">
          <Card className="trend-card">
            <CardHeader title="主机资源趋势" description="最近 30 分钟 · 页面打开期间采样" action={<div className="node-chip"><Server size={14} /> {node}</div>} />
            <ResourceQueryFeedback title="主机信息" message="主机资源暂不可用；重试只会重新读取主机信息。" query={serverQuery} onRetry={() => void serverQuery.refetch()} />
            {serverInfo ? <TrendChart data={memoryTrend} /> : null}
            <div className="trend-summary"><div><span className="line-key line-key-cyan" />CPU <strong>—</strong></div><div><span className="line-key line-key-indigo" />内存 <strong>{formatPercent(memory)}</strong></div><span className="threshold-note">关注阈值 80% · 来源：系统 API</span></div>
          </Card>
          <div className="metric-grid">
            <MetricCard icon={<Activity size={18} />} label="CPU 使用率" value="—" detail={serverInfo ? '系统 API 未提供' : '主机信息不可用'} tone="cyan" progress={null} />
            <MetricCard icon={<MemoryStick size={18} />} label="主机内存" value={formatPercent(memory)} detail={serverInfo ? 'Java 堆已使用' : '主机信息不可用'} tone="indigo" progress={memory} />
            <MetricCard icon={<HardDrive size={18} />} label="磁盘空间" value="—" detail="系统 API 未提供" tone="amber" progress={null} />
          </div>
          <Card className="sessions-card">
            <CardHeader title="在线会话" description={onlineUsers ? `${sessions.length} 个活跃会话 · 仅展示当前节点` : '会话数据独立读取'} action={onlineUsers ? <Badge tone="success"><span className="tiny-dot" /> 在线</Badge> : null} />
            <ResourceQueryFeedback title="在线会话" message="在线会话暂不可用；重试只会重新读取会话列表。" query={onlineQuery} onRetry={() => void onlineQuery.refetch()} />
            {onlineUsers && sessions.length === 0 ? <div className="session-list" role="status">暂无在线会话</div> : null}
            {sessions.length > 0 ? <div className="session-list">{sessions.map((session) => <SessionRow key={session.id} session={session} onSelect={setSelectedSession} />)}</div> : null}
          </Card>
        </section>
        <aside className="monitor-inspector">
          <Card>
            <CardHeader title="节点详情" description="当前主机和缓存统计" />
            <div className="inspector-list">
              <InfoRow icon={<Server size={16} />} label="节点" value={node} />
              <InfoRow icon={<Wifi size={16} />} label="网络入口" value="—" helper="出口 — · 系统 API 未提供" />
              <InfoRow icon={<Layers3 size={16} />} label="处理器" value={formatCount(serverInfo?.processors ?? null)} helper="系统 API 处理器数量" />
              <InfoRow icon={<Database size={16} />} label="活动会话" value={formatCount(cacheInfo?.activeSessions ?? null)} helper={cacheInfo ? `登录日志 ${formatCount(cacheInfo.loginLogEntries)} 条` : '缓存统计暂不可用'} />
              <ResourceQueryFeedback title="缓存统计" message="缓存统计暂不可用；重试只会重新读取缓存信息。" query={cacheQuery} onRetry={() => void cacheQuery.refetch()} />
            </div>
          </Card>
          <Card className="beam-card">
            <CardHeader title="运行时指标" description="系统 API 当前可用指标" />
            <div className="beam-stat"><span>Java 堆使用率</span><strong>{formatPercent(memory)}</strong></div>
            <div className="beam-stat"><span>Reductions</span><strong>—</strong></div>
            <div className="beam-stat"><span>网络流量</span><strong><ArrowDownToLine size={13} />— <ArrowUpFromLine size={13} />—</strong></div>
          </Card>
        </aside>
      </div>
      {selectedSession ? <SessionSheet session={selectedSession} onClose={() => setSelectedSession(null)} onForceLogout={forceLogout} /> : null}
      <MfaStepUpModal {...stepUp.modal} />
    </div>
  )
}

// 每个资源在自己的卡片内显示加载、首次失败或旧数据刷新失败状态。
function ResourceQueryFeedback<T>({ title, message, query, onRetry }: {
  title: string
  message: string
  query: UseQueryResult<T, Error>
  onRetry: () => void
}) {
  if (query.isLoading) {
    return <div className="monitor-resource-loading"><Spinner label={`正在读取${title}`} /></div>
  }

  if (query.isError && query.data === undefined) {
    return <InitialQueryError title={`无法读取${title}`} message={message} error={query.error} onRetry={onRetry} retrying={query.isFetching} />
  }

  if (query.isError) {
    return <StaleQueryError message={`${message}当前仍显示上一次成功数据。`} error={query.error} onRetry={onRetry} retrying={query.isFetching} />
  }

  return null
}

function MetricCard({ icon, label, value, detail, tone, progress }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string; progress: number | null }) {
  return <Card className={`metric-card metric-card-${tone}`}><div className="metric-head"><span className="metric-icon">{icon}</span><span>{label}</span></div><strong className="metric-value">{value}</strong><div className="metric-detail"><span>{detail}</span><span className="metric-progress-label">{progress == null ? '—' : `${Math.round(progress)}%`}</span></div><div className="progress-track"><span style={{ width: `${Math.min(progress ?? 0, 100)}%` }} /></div></Card>
}

function formatCount(value: number | null): string {
  return value == null ? '—' : value.toLocaleString('zh-CN')
}

function InfoRow({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper?: string }) {
  return <div className="info-row"><span className="info-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong>{helper ? <small>{helper}</small> : null}</div></div>
}

function SessionRow({ session, onSelect }: { session: SessionSummary; onSelect: (session: SessionSummary) => void }) {
  return <button type="button" className="session-row" onClick={() => onSelect(session)}><span className="session-avatar">{session.user.slice(0, 1).toUpperCase()}</span><span className="session-user"><strong>{session.user}</strong><small>{session.role}</small></span><span className="session-ip">{session.ip}</span><span className="session-page">{session.currentPage}</span><span className="session-online"><span className="tiny-dot" />在线</span></button>
}

function SessionSheet({ session, onClose, onForceLogout }: { session: SessionSummary; onClose: () => void; onForceLogout: (session: SessionSummary) => Promise<void> }) {
  return <div className="sheet-backdrop" role="presentation" onClick={onClose}><section className="session-sheet" role="dialog" aria-modal="true" aria-labelledby="session-sheet-title" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-heading"><div><p className="eyebrow">SESSION DETAIL</p><h2 id="session-sheet-title">{session.user}</h2></div><Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭会话详情">关闭</Button></div><div className="session-detail-list"><InfoRow icon={<UserRound size={16} />} label="角色" value={session.role} /><InfoRow icon={<Signal size={16} />} label="访问地址" value={session.ip} /><InfoRow icon={<Activity size={16} />} label="当前页面" value={session.currentPage} /><InfoRow icon={<RefreshCw size={16} />} label="最后活动" value={formatDateTime(session.lastSeen)} /></div><Button variant="danger" className="force-logout-button" onClick={() => onForceLogout(session)}>强制下线</Button></section></div>
}
