import { useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Search, Settings2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCapabilityQuery } from '../../shared/auth/CapabilityAvailability'
import { apiClient } from '../../shared/api/client'
import type { NativeSystemConfig, NativeSystemConfigWriteInput } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, ListToolbar, Spinner, StaleQueryError } from '../../shared/ui'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'
import { useCapabilities } from '../../shared/auth/useCapabilities'
import { ConfigFormModal } from './ConfigFormModal'

type ConfigFilters = { keyword: string }
const emptyFilters: ConfigFilters = { keyword: '' }
const PAGE_SIZE = 20
const urlDefaults = { keyword: '', page: 1 }
const urlOptions = { namespace: 'configs' }

export function ConfigsPage() {
  const queryClient = useQueryClient()
  const capabilities = useCapabilities()
  // 配置操作入口与两个后端的权限约定一致，资源范围仍由服务端核验。
  const can = (permission: string) => !capabilities.isError && Boolean(capabilities.data?.resources.config && capabilities.data.permissions.includes(permission))
  const canCreate = can('config:create')
  const canUpdate = can('config:update')
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const { keyword: appliedKeyword, page } = urlState
  const [formFilters, setFormFilters] = useState<ConfigFilters>(() => ({ keyword: appliedKeyword }))
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingConfig, setEditingConfig] = useState<NativeSystemConfig | null>(null)
  const [deletingConfig, setDeletingConfig] = useState<NativeSystemConfig | null>(null)
  const query = useCapabilityQuery({ queryKey: ['system-configs', appliedKeyword, page], queryFn: () => apiClient.listSystemConfigsPage({ keyword: appliedKeyword, page, size: PAGE_SIZE }), staleTime: 10_000 })
  const saveMutation = useMutation({
    mutationFn: ({ key, input }: { key?: string; input: NativeSystemConfigWriteInput }) => key ? apiClient.updateSystemConfig(key, input) : apiClient.createSystemConfig(input),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['system-configs'] }); setUrlState({ page: 1 }); setModalMode(null); setEditingConfig(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: (key: string) => apiClient.deleteSystemConfig(key),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['system-configs'] })
      setUrlState({ page: 1 })
      setDeletingConfig(null)
    },
  })
  const configs = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    setFormFilters({ keyword: appliedKeyword })
  }, [appliedKeyword])

  useEffect(() => {
    if (query.data && page > totalPages) setUrlState({ page: totalPages })
  }, [page, query.data, setUrlState, totalPages])

  // 权限撤销后关闭已有操作，避免权限恢复时意外重开旧表单。
  useEffect(() => {
    if ((modalMode === 'create' && !canCreate) || (modalMode === 'edit' && !canUpdate)) {
      setModalMode(null)
      setEditingConfig(null)
    }
    if (!canUpdate) setDeletingConfig(null)
  }, [canCreate, canUpdate, modalMode])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ keyword: formFilters.keyword.trim(), page: 1 }, { history: 'push' })
  }

  function reset() {
    setFormFilters(emptyFilters)
    setUrlState(urlDefaults, { history: 'push' })
  }

  function openCreate() { saveMutation.reset(); setEditingConfig(null); setModalMode('create') }
  function openEdit(config: NativeSystemConfig) { saveMutation.reset(); setEditingConfig(config); setModalMode('edit') }
  function closeModal() { if (saveMutation.isPending) return; setModalMode(null); setEditingConfig(null) }
  async function submitConfig(input: NativeSystemConfigWriteInput) { if (!(modalMode === 'create' ? canCreate : canUpdate)) return; try { await saveMutation.mutateAsync({ key: editingConfig?.key, input }) } catch { /* 保留表单状态和错误。 */ } }
  function openDelete(config: NativeSystemConfig) { deleteMutation.reset(); setDeletingConfig(config) }
  function closeDelete() { if (!deleteMutation.isPending) setDeletingConfig(null) }

  return <div className="configs-page">
    <div className="page-heading"><div><p className="eyebrow">SYSTEM / CONFIGURATION</p><h1>系统配置</h1><p className="page-description">查询运行参数、开关状态和配置更新时间。新增和编辑在模态框中完成。</p></div></div>
    <Card className="configs-filter-card"><form className="configs-filter-form" onSubmit={submit}><label><span>配置键或说明</span><input value={formFilters.keyword} onChange={(event) => setFormFilters({ keyword: event.target.value })} placeholder="按配置键或说明筛选" autoComplete="off" /></label><div className="configs-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    <ActionError title="配置删除失败" error={deleteMutation.error} onDismiss={() => deleteMutation.reset()} />
    <Card className="configs-table-card">
      <ListToolbar label="系统配置列表操作">{canCreate ? <Button size="sm" onClick={openCreate}><Plus size={15} /> 新增配置</Button> : null}<Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新配置</Button></ListToolbar>
      <CardHeader title="配置列表" description={query.isLoading ? '正在读取系统 API' : query.isError ? '读取失败，请检查服务连接' : `共 ${total.toLocaleString('zh-CN')} 项匹配配置`} action={<Badge tone="info">系统 API</Badge>} />
      {query.isLoading ? <div className="loading-panel configs-loading"><Spinner label="正在读取系统配置" /></div> : null}
      {query.isError && !query.data ? <InitialQueryError title="无法读取系统配置" message="系统配置读取失败，请重试" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
      {query.isError && query.data ? <StaleQueryError message="系统配置刷新失败，当前仍显示上一次成功数据。" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
      {query.data ? <>{configs.length > 0 ? <div className="configs-table-wrap"><table className="configs-table"><thead><tr><th scope="col">配置键</th><th scope="col">配置值</th><th scope="col">说明</th><th scope="col">状态</th><th scope="col">更新时间</th>{canUpdate ? <th scope="col">操作</th> : null}</tr></thead><tbody>{configs.map((config) => <ConfigRow key={config.id} config={config} pending={deleteMutation.isPending} canUpdate={canUpdate} onEdit={openEdit} onDelete={openDelete} />)}</tbody></table></div> : <div className="configs-empty" role="status"><span className="configs-empty-icon"><Settings2 size={20} /></span><strong>没有匹配的系统配置</strong><p>调整筛选条件后重试。</p></div>}{totalPages > 1 ? <div className="configs-pagination"><span>第 {page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setUrlState({ page: page - 1 }, { history: 'push' })}>上一页</Button><Button variant="ghost" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => setUrlState({ page: page + 1 }, { history: 'push' })}>下一页</Button></div></div> : null}</> : null}
    </Card>
    <ConfigFormModal open={modalMode === 'create' ? canCreate : modalMode === 'edit' && canUpdate} mode={modalMode ?? 'create'} config={editingConfig} pending={saveMutation.isPending} error={saveMutation.error} onClose={closeModal} onSubmit={submitConfig} />
    <DeleteConfirmModal open={deletingConfig !== null && canUpdate} resourceLabel="系统配置" count={1} pending={deleteMutation.isPending} error={deleteMutation.error} onClose={closeDelete} onConfirm={() => { if (deletingConfig && canUpdate) void deleteMutation.mutateAsync(deletingConfig.key).catch(() => undefined) }} />
  </div>
}

function ConfigRow({ config, pending, canUpdate, onEdit, onDelete }: { config: NativeSystemConfig; pending: boolean; canUpdate: boolean; onEdit: (config: NativeSystemConfig) => void; onDelete: (config: NativeSystemConfig) => void }) {
  return <tr><td><code className="config-key">{config.key}</code></td><td className="config-value" title={config.value ?? undefined}>{config.value ?? '—'}</td><td>{config.description ?? '—'}</td><td><Badge tone={config.enabled ? 'success' : 'neutral'}>{config.enabled ? '启用' : '停用'}</Badge></td><td className="config-time">{formatTime(config.updatedAt)}</td>{canUpdate ? <td><div className="table-actions"><Button variant="ghost" size="sm" onClick={() => onEdit(config)} disabled={pending}><Pencil size={14} /> 编辑</Button><Button variant="ghost" size="sm" onClick={() => onDelete(config)} disabled={pending}>删除</Button></div></td> : null}</tr>
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
