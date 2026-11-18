import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, KeyRound, Plus, RefreshCw, Search } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { MfaStepUpModal } from '../../shared/auth/MfaStepUpModal'
import { useMfaStepUp } from '../../shared/auth/useMfaStepUp'
import { useCapabilities } from '../../shared/auth/useCapabilities'
import type { NativeApiKey, NativeCapabilities, NativeIssuedApiKey } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, ListToolbar, Modal, Spinner, StaleQueryError } from '../../shared/ui'
import { ApiKeyIssueModal } from './ApiKeyIssueModal'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'
import { useSessionStore } from '../../shared/state/session'

type ApiKeyStatus = 'all' | 'active' | 'revoked'
const PAGE_SIZE = 20
const MAX_TIMER_DELAY_MS = 2_147_483_647
const urlDefaults = { keyword: '', status: 'all', page: 1 }
const urlOptions = { namespace: 'api_keys' }

export function ApiKeysPage() {
  const capabilitiesQuery = useCapabilities()
  const capabilities = capabilitiesQuery.data
  const username = useSessionStore((state) => state.user?.username ?? null)
  const authRevision = useSessionStore((state) => state.authRevision)
  const hasApiKeyScope = capabilities?.resources['api-key'] === true
  const canRead = hasApiKeyScope && hasPermission(capabilities, 'api-key:read')
  const canIssue = canRead && hasPermission(capabilities, 'api-key:create')
  const canRotate = canRead && hasPermission(capabilities, 'api-key:rotate')
  const canRevoke = canRead && hasPermission(capabilities, 'api-key:revoke')
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { keyword: appliedKeyword, status: appliedStatus, page } = urlState
  const [keyword, setKeyword] = useState(appliedKeyword)
  const [status, setStatus] = useState<ApiKeyStatus>(appliedStatus as ApiKeyStatus)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issuedKey, setIssuedKey] = useState<NativeIssuedApiKey | null>(null)
  const [revokingKey, setRevokingKey] = useState<NativeApiKey | null>(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const activeExpiryQueryKey = JSON.stringify([authRevision, username, appliedKeyword, page])
  const activeExpiryRetry = useRef<{ queryKey: string; attemptedIds: Set<string> }>({ queryKey: activeExpiryQueryKey, attemptedIds: new Set() })
  const stepUp = useMfaStepUp()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['api-keys', authRevision, username, appliedKeyword, appliedStatus, page], queryFn: () => apiClient.listApiKeysPage({ keyword: appliedKeyword, status: appliedStatus, page, size: PAGE_SIZE }), staleTime: 10_000, enabled: canRead })
  const scopeQuery = useQuery({ queryKey: ['permission-catalog', authRevision, username], queryFn: () => apiClient.listPermissionCatalog(), staleTime: 0, enabled: canIssue, refetchOnWindowFocus: 'always', refetchOnReconnect: 'always' })
  const issueMutation = useMutation({ mutationFn: (input: { name: string; scopes: string[]; expiresAt?: string | null }) => stepUp.run(() => apiClient.issueApiKey(input)), onSuccess: async (key) => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['api-keys'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); setUrlState({ page: 1 }); setIssuedKey(key); setIssueOpen(false) } })
  const rotateMutation = useMutation({ mutationFn: (id: string) => stepUp.run(() => apiClient.rotateApiKey(id)), onSuccess: async (key) => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['api-keys'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); setUrlState({ page: 1 }); setIssuedKey(key) } })
  const revokeMutation = useMutation({ mutationFn: (id: string) => stepUp.run(() => apiClient.revokeApiKey(id)), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['api-keys'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); setUrlState({ page: 1 }); setRevokingKey(null) } })
  const keys = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeExpiredKeys = appliedStatus === 'active'
    ? keys.filter((apiKey) => !apiKey.revokedAt && isExpired(apiKey.expiresAt, currentTime))
    : []

  useEffect(() => {
    setKeyword(appliedKeyword)
    setStatus(appliedStatus as ApiKeyStatus)
  }, [appliedKeyword, appliedStatus])

  useEffect(() => {
    if (query.data && page > totalPages) setUrlState({ page: totalPages })
  }, [page, query.data, setUrlState, totalPages])

  useEffect(() => {
    if (activeExpiryRetry.current.queryKey !== activeExpiryQueryKey || appliedStatus !== 'active') {
      activeExpiryRetry.current = { queryKey: activeExpiryQueryKey, attemptedIds: new Set() }
    }
    if (query.dataUpdatedAt <= 0 || !query.data) return

    // 响应可能在查询后跨过到期点；每个已过期密钥最多触发一次自动重读。
    const now = Date.now()
    setCurrentTime(now)
    if (appliedStatus !== 'active') return

    const state = activeExpiryRetry.current
    const expiredIds = query.data.items
      .filter((apiKey) => !apiKey.revokedAt && isExpired(apiKey.expiresAt, now))
      .map((apiKey) => apiKey.id)
    const unverifiedIds = expiredIds.filter((id) => !state.attemptedIds.has(id))
    if (unverifiedIds.length > 0) {
      unverifiedIds.forEach((id) => state.attemptedIds.add(id))
      void query.refetch()
    }
  }, [activeExpiryQueryKey, appliedStatus, query.data, query.dataUpdatedAt, query.refetch])

  useEffect(() => {
    const nextExpiry = query.data?.items.reduce((nearest, apiKey) => {
      if (apiKey.revokedAt || !apiKey.expiresAt) return nearest
      const expiresAt = Date.parse(apiKey.expiresAt)
      return Number.isFinite(expiresAt) && expiresAt > currentTime ? Math.min(nearest, expiresAt) : nearest
    }, Number.POSITIVE_INFINITY)
    if (nextExpiry === undefined || !Number.isFinite(nextExpiry)) return

    const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, nextExpiry - currentTime))
    const timer = window.setTimeout(() => {
      setCurrentTime(Date.now())
      if (appliedStatus === 'active') void query.refetch()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [appliedStatus, currentTime, query.data?.items, query.refetch])

  useEffect(() => {
    if (!canIssue) setIssueOpen(false)
    if (!canRevoke) setRevokingKey(null)
  }, [canIssue, canRevoke])

  useEffect(() => {
    setIssueOpen(false)
    setIssuedKey(null)
    setRevokingKey(null)
  }, [username])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ keyword: keyword.trim(), status, page: 1 }, { history: 'push' })
  }

  function reset() {
    setKeyword('')
    setStatus('all')
    setUrlState(urlDefaults, { history: 'push' })
  }

  function rotateKey(apiKey: NativeApiKey) {
    const now = Date.now()
    setCurrentTime(now)
    if (!canRotate || apiKey.revokedAt || isExpired(apiKey.expiresAt, now)) return
    rotateMutation.mutate(apiKey.id)
  }

  return (
    <div className="api-keys-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SECURITY / API KEYS</p>
          <h1>API Key 管理</h1>
          <p className="page-description">查询当前账号的机器凭据、授权范围和生命周期状态。密钥明文只在签发时返回一次。</p>
        </div>
      </div>

      {issuedKey ? <div className="secret-banner" role="alert"><div><strong>请立即保存这枚 API Key</strong><p>明文只在当前页面内存中展示一次。关闭提示后不会再次读取。</p><code>{issuedKey.apiKey}</code></div><Button variant="ghost" size="sm" onClick={() => setIssuedKey(null)}>关闭</Button></div> : null}
      <ActionError title="API Key 轮换失败" error={rotateMutation.error} onDismiss={() => rotateMutation.reset()} />
      {!revokingKey ? <ActionError title="API Key 撤销失败" error={revokeMutation.error} onDismiss={() => revokeMutation.reset()} /> : null}

      {capabilities && !canRead ? <div className="api-keys-empty" role="status"><strong>当前账号无法读取 API Key 列表</strong><p>需要 api-key:read 权限和 API Key 数据范围。</p></div> : null}
      {canRead ? <>
      <Card className="api-keys-filter-card">
        <form className="api-keys-filter-form" onSubmit={submit}>
          <label><span>名称、前缀或范围</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按名称、前缀或权限范围筛选" autoComplete="off" /></label>
          <label><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value as ApiKeyStatus)}><option value="all">全部状态</option><option value="active">有效</option><option value="revoked">已撤销</option></select></label>
          <div className="api-keys-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div>
        </form>
      </Card>

      <Card className="api-keys-table-card">
        <ListToolbar label="API Key 列表操作">
          {canIssue ? <Button size="sm" onClick={() => { if (!canIssue) return; issueMutation.reset(); setIssueOpen(true) }}><Plus size={15} /> 签发 API Key</Button> : null}
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表</Button>
        </ListToolbar>
        <CardHeader title="API Key 列表" description={query.data ? `共 ${total.toLocaleString('zh-CN')} 个匹配凭据` : undefined} action={<Badge tone="info">仅显示元数据</Badge>} />
        {query.isLoading ? <div className="loading-panel api-keys-loading"><Spinner label="正在读取 API Key 列表" /></div> : null}
        {query.isError && !query.data ? <InitialQueryError title="无法读取 API Key 列表" message="API Key 列表读取失败，请重试" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
        {query.isError && query.data ? <StaleQueryError message="API Key 列表刷新失败，当前仍显示上一次成功数据。" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
        {activeExpiredKeys.length > 0 ? <div className="error-panel" role="alert"><AlertTriangle size={18} /><div><strong>有效筛选结果需要复核</strong><p>当前页包含已过期密钥。服务端总数和分页可能尚未同步；页面保留服务端返回的总数和分页范围。请重新读取当前页。</p></div><Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? '读取中…' : '重试读取'}</Button></div> : null}
        {query.data ? <>
        {keys.length > 0 ? <div className="api-keys-table-wrap"><table className="api-keys-table"><thead><tr><th scope="col">名称</th><th scope="col">密钥前缀</th><th scope="col">授权范围</th><th scope="col">创建时间</th><th scope="col">最近使用</th><th scope="col">到期时间</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{keys.map((key) => <ApiKeyRow key={key.id} apiKey={key} now={currentTime} pending={rotateMutation.isPending || revokeMutation.isPending} canIssue={canIssue} canRotate={canRotate} canRevoke={canRevoke} onRotate={rotateKey} onRevoke={(target) => { if (!canRevoke) return; revokeMutation.reset(); setRevokingKey(target) }} />)}</tbody></table></div> : <div className="api-keys-empty" role="status"><span className="api-keys-empty-icon"><KeyRound size={20} /></span><strong>没有匹配的 API Key</strong><p>调整筛选条件后重试，或清空筛选条件查看全部凭据。</p></div>}
        {totalPages > 1 ? <div className="api-keys-pagination"><span>第 {page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setUrlState({ page: page - 1 }, { history: 'push' })}>上一页</Button><Button variant="ghost" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => setUrlState({ page: page + 1 }, { history: 'push' })}>下一页</Button></div></div> : null}
        </> : null}
      </Card>
      </> : null}
      <ApiKeyIssueModal open={issueOpen && canIssue} pending={issueMutation.isPending} error={issueMutation.error} scopeEntries={scopeQuery.data ?? []} scopeLoading={scopeQuery.isLoading} scopeError={scopeQuery.error} onRetryScopes={() => void scopeQuery.refetch()} onClose={() => setIssueOpen(false)} onSubmit={(input) => canIssue ? issueMutation.mutateAsync(input).then(() => undefined) : Promise.reject(new Error('API Key 签发权限已失效'))} />
      <Modal open={revokingKey !== null && canRevoke} title="撤销 API Key" description="请确认需要撤销的密钥。" onClose={() => { if (!revokeMutation.isPending) setRevokingKey(null) }} footer={<><Button variant="ghost" onClick={() => setRevokingKey(null)} disabled={revokeMutation.isPending}>取消</Button><Button variant="danger" onClick={() => { if (canRevoke && revokingKey) void revokeMutation.mutateAsync(revokingKey.id).catch(() => undefined) }} disabled={revokeMutation.isPending}>{revokeMutation.isPending ? '撤销中…' : '确认撤销'}</Button></>}>
        <div className="delete-confirm-panel"><div className="delete-confirm-icon"><AlertTriangle size={21} /></div><div><strong>将撤销 {revokingKey?.name}</strong><p>撤销后此密钥无法继续使用，但记录仍会保留。</p></div></div>
        <ActionError title="API Key 撤销失败" error={revokeMutation.error} />
      </Modal>
      <MfaStepUpModal {...stepUp.modal} />
    </div>
  )
}

function ApiKeyRow({ apiKey, now, pending, canIssue, canRotate, canRevoke, onRotate, onRevoke }: { apiKey: NativeApiKey; now: number; pending: boolean; canIssue: boolean; canRotate: boolean; canRevoke: boolean; onRotate: (apiKey: NativeApiKey) => void; onRevoke: (apiKey: NativeApiKey) => void }) {
  const revoked = Boolean(apiKey.revokedAt)
  const expired = isExpired(apiKey.expiresAt, now)
  return <tr><td><div className="api-key-cell"><span className="api-key-marker"><KeyRound size={15} /></span><div><strong>{apiKey.name}</strong><small>{apiKey.id}</small></div></div></td><td><code className="api-key-prefix">ks_live_{apiKey.prefix}_••••</code></td><td><div className="api-key-scopes">{apiKey.scopes.map((scope) => <Badge key={scope} tone="neutral">{scope}</Badge>)}</div></td><td>{formatDate(apiKey.createdAt, '—')}</td><td>{formatDate(apiKey.lastUsedAt, '从未使用')}</td><td>{formatDate(apiKey.expiresAt, '永不过期')}</td><td><Badge tone={revoked ? 'danger' : expired ? 'warning' : 'success'}>{revoked ? '已撤销' : expired ? '已过期' : '有效'}</Badge></td><td><div className="table-actions">{canRotate ? <div><Button variant="ghost" size="sm" onClick={() => onRotate(apiKey)} disabled={pending || revoked || expired} title={expired ? '已过期，不能轮换' : undefined}>{pending ? '处理中…' : '轮换'}</Button>{expired && !revoked && canIssue ? <small className="api-key-expired-hint">已过期，请新建 API Key</small> : null}</div> : null}{canRevoke && !revoked ? <Button variant="ghost" size="sm" onClick={() => onRevoke(apiKey)} disabled={pending}>撤销</Button> : null}</div></td></tr>
}

function isExpired(value: string | null, now: number) {
  if (!value) return false
  const expiresAt = Date.parse(value)
  return Number.isFinite(expiresAt) && expiresAt <= now
}

// API Key 页面先检查读取权限和本人数据范围，再检查具体生命周期操作权限。
function hasPermission(capabilities: NativeCapabilities | undefined, permission: string) {
  return capabilities?.permissions.includes(permission) ?? false
}

// 不同时间字段缺值时含义不同，由调用方提供准确提示。
function formatDate(value: string | null, emptyText: string) {
  if (!value) return emptyText
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
