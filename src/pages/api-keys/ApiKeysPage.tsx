import { useEffect, useState } from 'react'
import { KeyRound, RefreshCw, Search } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { MfaStepUpModal } from '../../shared/auth/MfaStepUpModal'
import { useMfaStepUp } from '../../shared/auth/useMfaStepUp'
import type { NativeApiKey, NativeIssuedApiKey } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, Spinner, StaleQueryError } from '../../shared/ui'
import { ApiKeyIssueModal } from './ApiKeyIssueModal'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'

type ApiKeyStatus = 'all' | 'active' | 'revoked'
const PAGE_SIZE = 20
const urlDefaults = { keyword: '', status: 'all', page: 1 }
const urlOptions = { namespace: 'api_keys' }

export function ApiKeysPage() {
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { keyword: appliedKeyword, status: appliedStatus, page } = urlState
  const [keyword, setKeyword] = useState(appliedKeyword)
  const [status, setStatus] = useState<ApiKeyStatus>(appliedStatus as ApiKeyStatus)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issuedKey, setIssuedKey] = useState<NativeIssuedApiKey | null>(null)
  const [revokingKey, setRevokingKey] = useState<NativeApiKey | null>(null)
  const stepUp = useMfaStepUp()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['api-keys', appliedKeyword, appliedStatus, page], queryFn: () => apiClient.listApiKeysPage({ keyword: appliedKeyword, status: appliedStatus, page, size: PAGE_SIZE }), staleTime: 10_000 })
  const scopeQuery = useQuery({ queryKey: ['permission-catalog'], queryFn: () => apiClient.listPermissionCatalog(), staleTime: 60_000 })
  const issueMutation = useMutation({ mutationFn: (input: { name: string; scopes: string[]; expiresAt?: string | null }) => stepUp.run(() => apiClient.issueApiKey(input)), onSuccess: async (key) => { await queryClient.invalidateQueries({ queryKey: ['api-keys'] }); setUrlState({ page: 1 }); setIssuedKey(key); setIssueOpen(false) } })
  const rotateMutation = useMutation({ mutationFn: (id: string) => stepUp.run(() => apiClient.rotateApiKey(id)), onSuccess: async (key) => { await queryClient.invalidateQueries({ queryKey: ['api-keys'] }); setUrlState({ page: 1 }); setIssuedKey(key) } })
  const revokeMutation = useMutation({ mutationFn: (id: string) => stepUp.run(() => apiClient.revokeApiKey(id)), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['api-keys'] }); setUrlState({ page: 1 }); setRevokingKey(null) } })
  const keys = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    setKeyword(appliedKeyword)
    setStatus(appliedStatus as ApiKeyStatus)
  }, [appliedKeyword, appliedStatus])

  useEffect(() => {
    if (query.data && page > totalPages) setUrlState({ page: totalPages })
  }, [page, query.data, setUrlState, totalPages])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ keyword: keyword.trim(), status, page: 1 })
  }

  function reset() {
    setKeyword('')
    setStatus('all')
    setUrlState(urlDefaults)
  }

  return (
    <div className="api-keys-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SECURITY / API KEYS</p>
          <h1>API Key 管理</h1>
          <p className="page-description">查询当前账号的机器凭据、授权范围和生命周期状态。密钥明文只在签发时返回一次。</p>
        </div>
        <div className="heading-actions"><Button size="sm" onClick={() => { issueMutation.reset(); setIssueOpen(true) }}>签发 API Key</Button><Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新列表</Button></div>
      </div>

      {issuedKey ? <div className="secret-banner" role="alert"><div><strong>请立即保存这枚 API Key</strong><p>明文只在当前页面内存中展示一次。关闭提示后不会再次读取。</p><code>{issuedKey.apiKey}</code></div><Button variant="ghost" size="sm" onClick={() => setIssuedKey(null)}>关闭</Button></div> : null}
      <ActionError title="API Key 轮换失败" error={rotateMutation.error} onDismiss={() => rotateMutation.reset()} />
      {!revokingKey ? <ActionError title="API Key 撤销失败" error={revokeMutation.error} onDismiss={() => revokeMutation.reset()} /> : null}

      <Card className="api-keys-filter-card">
        <form className="api-keys-filter-form" onSubmit={submit}>
          <label><span>名称、前缀或范围</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按名称、前缀或权限范围筛选" autoComplete="off" /></label>
          <label><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value as ApiKeyStatus)}><option value="all">全部状态</option><option value="active">有效</option><option value="revoked">已撤销</option></select></label>
          <div className="api-keys-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div>
        </form>
      </Card>

      {query.isLoading ? <div className="loading-panel api-keys-loading"><Spinner label="正在读取 API Key 列表" /></div> : null}
      {query.isError && !query.data ? <InitialQueryError title="无法读取 API Key 列表" message="API Key 列表读取失败，请重试" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
      {query.isError && query.data ? <StaleQueryError message="API Key 列表刷新失败，当前仍显示上一次成功数据。" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
      {query.data ? <Card className="api-keys-table-card">
        <CardHeader title="API Key 列表" description={`共 ${total.toLocaleString('zh-CN')} 个匹配凭据`} action={<Badge tone="info">仅显示元数据</Badge>} />
        {keys.length > 0 ? <div className="api-keys-table-wrap"><table className="api-keys-table"><thead><tr><th scope="col">名称</th><th scope="col">密钥前缀</th><th scope="col">授权范围</th><th scope="col">创建时间</th><th scope="col">最近使用</th><th scope="col">到期时间</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{keys.map((key) => <ApiKeyRow key={key.id} apiKey={key} pending={rotateMutation.isPending || revokeMutation.isPending} onRotate={(id) => rotateMutation.mutate(id)} onRevoke={(target) => { revokeMutation.reset(); setRevokingKey(target) }} />)}</tbody></table></div> : <div className="api-keys-empty" role="status"><span className="api-keys-empty-icon"><KeyRound size={20} /></span><strong>没有匹配的 API Key</strong><p>调整筛选条件后重试，或清空筛选条件查看全部凭据。</p></div>}
        {totalPages > 1 ? <div className="api-keys-pagination"><span>第 {page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setUrlState({ page: page - 1 })}>上一页</Button><Button variant="ghost" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => setUrlState({ page: page + 1 })}>下一页</Button></div></div> : null}
      </Card> : null}
      <ApiKeyIssueModal open={issueOpen} pending={issueMutation.isPending} error={issueMutation.error} scopeEntries={scopeQuery.data ?? []} scopeLoading={scopeQuery.isLoading} scopeError={scopeQuery.error} onRetryScopes={() => void scopeQuery.refetch()} onClose={() => setIssueOpen(false)} onSubmit={(input) => issueMutation.mutateAsync(input).then(() => undefined)} />
      <DeleteConfirmModal open={revokingKey !== null} resourceLabel="API Key" count={1} pending={revokeMutation.isPending} error={revokeMutation.error} onClose={() => { if (!revokeMutation.isPending) setRevokingKey(null) }} onConfirm={() => { if (revokingKey) void revokeMutation.mutateAsync(revokingKey.id).catch(() => undefined) }} />
      <MfaStepUpModal {...stepUp.modal} />
    </div>
  )
}

function ApiKeyRow({ apiKey, pending, onRotate, onRevoke }: { apiKey: NativeApiKey; pending: boolean; onRotate: (id: string) => void; onRevoke: (apiKey: NativeApiKey) => void }) {
  const revoked = Boolean(apiKey.revokedAt)
  return <tr><td><div className="api-key-cell"><span className="api-key-marker"><KeyRound size={15} /></span><div><strong>{apiKey.name}</strong><small>{apiKey.id}</small></div></div></td><td><code className="api-key-prefix">ks_live_{apiKey.prefix}_••••</code></td><td><div className="api-key-scopes">{apiKey.scopes.map((scope) => <Badge key={scope} tone="neutral">{scope}</Badge>)}</div></td><td>{formatDate(apiKey.createdAt)}</td><td>{formatDate(apiKey.lastUsedAt)}</td><td>{formatDate(apiKey.expiresAt)}</td><td><Badge tone={revoked ? 'danger' : 'success'}>{revoked ? '已撤销' : '有效'}</Badge></td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={() => onRotate(apiKey.id)} disabled={pending || revoked}>{pending ? '处理中…' : '轮换'}</Button>{revoked ? null : <Button variant="ghost" size="sm" onClick={() => onRevoke(apiKey)} disabled={pending}>撤销</Button>}</div></td></tr>
}

function formatDate(value: string | null) {
  if (!value) return '永不过期'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
