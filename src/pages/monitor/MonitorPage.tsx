import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowDownToLine, ArrowUpFromLine, CircleHelp, Database, HardDrive, Layers3, MemoryStick, RefreshCw, Server, ShieldAlert, Signal, UserRound, Wifi } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { MfaStepUpModal } from '../../shared/auth/MfaStepUpModal'
import { useMfaStepUp } from '../../shared/auth/useMfaStepUp'
import { useSessionStore } from '../../shared/state/session'
import { formatDateTime, formatPercent, formatRate, statusMessage, statusTone } from '../../entities/monitor/format'
import type { SessionSummary } from '../../entities/monitor/types'
import { Badge, Button, Card, CardHeader, Spinner } from '../../shared/ui'
import { TrendChart } from '../../widgets/monitor/TrendChart'

const statusLabels = { LIVE: 'LIVE', STALE: 'STALE', OFFLINE: 'OFFLINE', PARTIAL: 'PARTIAL' } as const

export function MonitorPage() {
  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const stepUp = useMfaStepUp()
  const clearSession = useSessionStore((state) => state.clearSession)
  const query = useQuery({ queryKey: ['monitor', 'snapshot'], queryFn: apiClient.getMonitorSnapshot, refetchInterval: 15_000, staleTime: 10_000 })
  const snapshot = query.data
  const computedStatus = snapshot?.status ?? (query.isError ? 'OFFLINE' : 'STALE')

  const summary = useMemo(() => {
    if (!snapshot) return null
    return `${snapshot.node} 当前 CPU ${formatPercent(snapshot.cpu)}，内存 ${formatPercent(snapshot.memory)}，在线会话 ${snapshot.sessions.length} 个。`
  }, [snapshot])

  const diskPercent = snapshot?.disk.used != null && snapshot.disk.total != null && snapshot.disk.total > 0
    ? snapshot.disk.used / snapshot.disk.total * 100
    : null

  function refresh() {
    setNotice(null)
    void query.refetch()
  }

  async function forceLogout(session: SessionSummary) {
    try {
      const result = await stepUp.run(() => apiClient.revokeOnlineSession(session.id))
      setSelectedSession(null)
      if (result.currentSessionRevoked) {
        clearSession('当前会话已下线，请重新登录')
        return
      }
      setNotice(`已完成下线：${session.user}`)
      void query.refetch()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '下线请求失败')
    }
  }

  return (
    <div className="monitor-page">
      <div className="page-heading">
        <div><p className="eyebrow">OPERATIONS / MONITORING</p><h1>运行监控</h1><p className="page-description">快速判断平台健康，定位异常，并处理在线会话。</p></div>
        <div className="heading-actions"><Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新快照</Button><Button variant="ghost" size="sm" aria-label="监控帮助"><CircleHelp size={17} /></Button></div>
      </div>
      <div className="monitor-status-bar">
        <div className="status-leading"><span className={`status-pulse status-pulse-${statusTone(computedStatus)}`} /><Badge tone={statusTone(computedStatus)}>{statusLabels[computedStatus]}</Badge><span>{statusMessage(computedStatus)}</span></div>
        <div className="status-meta"><span>{snapshot ? `最后更新 ${formatDateTime(snapshot.capturedAt)}` : '等待快照'}</span><span className="status-source">来源：{snapshot?.source ?? '系统 API'}</span></div>
      </div>
      {notice ? <div className="inline-notice" role="status">{notice}</div> : null}
      {query.isLoading ? <div className="loading-panel"><Spinner label="正在读取系统 API 快照" /></div> : null}
      {query.isError && !snapshot ? <div className="error-panel" role="alert"><ShieldAlert size={20} /><div><strong>无法读取运行快照</strong><p>检查系统 API 连接后重试。开发环境可使用 VITE_ENABLE_MOCK=true。</p></div><Button variant="secondary" size="sm" onClick={refresh}>重试</Button></div> : null}
      {snapshot ? <>
        <p className="sr-only" aria-live="polite">{summary}</p>
        <div className="monitor-grid">
          <section className="monitor-main">
            <Card className="trend-card"><CardHeader title="主机资源趋势" description="最近 30 分钟 · 百分比" action={<div className="node-chip"><Server size={14} /> {snapshot.node}</div>} /><TrendChart data={snapshot.trend} /><div className="trend-summary"><div><span className="line-key line-key-cyan" />CPU <strong>{formatPercent(snapshot.cpu)}</strong></div><div><span className="line-key line-key-indigo" />内存 <strong>{formatPercent(snapshot.memory)}</strong></div><span className="threshold-note">关注阈值 80%</span></div></Card>
            <div className="metric-grid">
              <MetricCard icon={<Activity size={18} />} label="CPU 使用率" value={formatPercent(snapshot.cpu)} detail={snapshot.cpu == null ? '系统 API 未提供' : '系统负载'} tone="cyan" progress={snapshot.cpu} />
              <MetricCard icon={<MemoryStick size={18} />} label="主机内存" value={formatPercent(snapshot.memory)} detail="Java 堆已使用" tone="indigo" progress={snapshot.memory} />
              <MetricCard icon={<HardDrive size={18} />} label="磁盘空间" value={formatPercent(diskPercent)} detail={diskPercent == null ? '系统 API 未提供' : `${snapshot.disk.used} / ${snapshot.disk.total} GB`} tone="amber" progress={diskPercent} />
            </div>
            <Card className="sessions-card"><CardHeader title="在线会话" description={`${snapshot.sessions.length} 个活跃会话 · 仅展示当前节点`} action={<Badge tone="success"><span className="tiny-dot" /> 在线</Badge>} /><div className="session-list">{snapshot.sessions.map((session) => <SessionRow key={session.id} session={session} onSelect={setSelectedSession} />)}</div></Card>
          </section>
          <aside className="monitor-inspector">
            <Card><CardHeader title="节点详情" description="当前健康快照" /><div className="inspector-list"><InfoRow icon={<Server size={16} />} label="节点" value={snapshot.node} /><InfoRow icon={<Wifi size={16} />} label="网络入口" value={formatRate(snapshot.network.inbound)} helper={`出口 ${formatRate(snapshot.network.outbound)}`} /><InfoRow icon={<Layers3 size={16} />} label="处理器" value={formatCount(snapshot.beam.processes)} helper={snapshot.beam.runQueue == null ? '运行队列未提供' : `运行队列 ${snapshot.beam.runQueue}`} /><InfoRow icon={<Database size={16} />} label="活动会话" value={formatCount(snapshot.ets.entries)} helper="系统 API 当前活动会话" /></div></Card>
            <Card className="beam-card"><CardHeader title="运行时指标" description="系统 API 当前可用指标" /><div className="beam-stat"><span>Java 堆使用率</span><strong>{formatPercent(snapshot.memory)}</strong></div><div className="beam-stat"><span>Reductions</span><strong>{formatCount(snapshot.beam.reductions)}</strong></div><div className="beam-stat"><span>网络流量</span><strong><ArrowDownToLine size={13} />{formatRate(snapshot.network.inbound)} <ArrowUpFromLine size={13} />{formatRate(snapshot.network.outbound)}</strong></div></Card>
          </aside>
        </div>
      </> : null}
      {selectedSession ? <SessionSheet session={selectedSession} onClose={() => setSelectedSession(null)} onForceLogout={forceLogout} /> : null}
      <MfaStepUpModal {...stepUp.modal} />
    </div>
  )
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
