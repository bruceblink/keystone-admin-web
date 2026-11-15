import { useMemo, useState } from 'react'
import { Pencil, Plus, RefreshCw, Search, Settings2, ShieldAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeSystemConfig, NativeSystemConfigWriteInput } from '../../shared/api/schemas'
import { InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, Spinner } from '../../shared/ui'
import { ConfigFormModal } from './ConfigFormModal'

type ConfigFilters = { keyword: string }
const emptyFilters: ConfigFilters = { keyword: '' }

export function ConfigsPage() {
  const queryClient = useQueryClient()
  const [formFilters, setFormFilters] = useState<ConfigFilters>(emptyFilters)
  const [filters, setFilters] = useState<ConfigFilters>(emptyFilters)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingConfig, setEditingConfig] = useState<NativeSystemConfig | null>(null)
  const [deletingConfig, setDeletingConfig] = useState<NativeSystemConfig | null>(null)
  const query = useQuery({ queryKey: ['system-configs'], queryFn: () => apiClient.listSystemConfigs(), staleTime: 10_000 })
  const saveMutation = useMutation({
    mutationFn: ({ key, input }: { key?: string; input: NativeSystemConfigWriteInput }) => key ? apiClient.updateSystemConfig(key, input) : apiClient.createSystemConfig(input),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['system-configs'] }); setModalMode(null); setEditingConfig(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: (key: string) => apiClient.deleteSystemConfig(key),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['system-configs'] })
      setDeletingConfig(null)
    },
  })
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

  function openCreate() { saveMutation.reset(); setEditingConfig(null); setModalMode('create') }
  function openEdit(config: NativeSystemConfig) { saveMutation.reset(); setEditingConfig(config); setModalMode('edit') }
  function closeModal() { if (saveMutation.isPending) return; setModalMode(null); setEditingConfig(null) }
  async function submitConfig(input: NativeSystemConfigWriteInput) { try { await saveMutation.mutateAsync({ key: editingConfig?.key, input }) } catch { /* 保留表单状态和错误。 */ } }
  function openDelete(config: NativeSystemConfig) { deleteMutation.reset(); setDeletingConfig(config) }
  function closeDelete() { if (!deleteMutation.isPending) setDeletingConfig(null) }

  return <div className="configs-page">
    <div className="page-heading"><div><p className="eyebrow">SYSTEM / CONFIGURATION</p><h1>系统配置</h1><p className="page-description">查询运行参数、开关状态和配置更新时间。新增和编辑在模态框中完成。</p></div><div className="heading-actions"><Button size="sm" onClick={openCreate}><Plus size={15} /> 新增配置</Button><Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新配置</Button></div></div>
    <Card className="configs-filter-card"><form className="configs-filter-form" onSubmit={submit}><label><span>配置键或说明</span><input value={formFilters.keyword} onChange={(event) => setFormFilters({ keyword: event.target.value })} placeholder="按配置键或说明筛选" autoComplete="off" /></label><div className="configs-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    {query.isLoading ? <div className="loading-panel configs-loading"><Spinner label="正在读取系统配置" /></div> : null}
    {query.isError && !query.data ? <InitialQueryError title="无法读取系统配置" message="系统配置读取失败，请重试" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
    {deleteMutation.error ? <div className="error-panel configs-error" role="alert"><ShieldAlert size={19} /><div><strong>配置删除失败</strong><p>{deleteMutation.error instanceof Error ? deleteMutation.error.message : '请求失败'}</p></div></div> : null}
    {query.data ? <Card className="configs-table-card"><CardHeader title="配置列表" description={`共 ${configs.length.toLocaleString('zh-CN')} 项匹配配置`} action={<Badge tone="info">系统 API</Badge>} />{configs.length > 0 ? <div className="configs-table-wrap"><table className="configs-table"><thead><tr><th scope="col">配置键</th><th scope="col">配置值</th><th scope="col">说明</th><th scope="col">状态</th><th scope="col">更新时间</th><th scope="col">操作</th></tr></thead><tbody>{configs.map((config) => <ConfigRow key={config.id} config={config} pending={deleteMutation.isPending} onEdit={openEdit} onDelete={openDelete} />)}</tbody></table></div> : <div className="configs-empty" role="status"><span className="configs-empty-icon"><Settings2 size={20} /></span><strong>没有匹配的系统配置</strong><p>调整筛选条件后重试。</p></div>}</Card> : null}
    <ConfigFormModal open={modalMode !== null} mode={modalMode ?? 'create'} config={editingConfig} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : null} onClose={closeModal} onSubmit={submitConfig} />
    <DeleteConfirmModal open={deletingConfig !== null} resourceLabel="系统配置" count={1} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : null} onClose={closeDelete} onConfirm={() => { if (deletingConfig) void deleteMutation.mutateAsync(deletingConfig.key).catch(() => undefined) }} />
  </div>
}

function ConfigRow({ config, pending, onEdit, onDelete }: { config: NativeSystemConfig; pending: boolean; onEdit: (config: NativeSystemConfig) => void; onDelete: (config: NativeSystemConfig) => void }) {
  return <tr><td><code className="config-key">{config.key}</code></td><td className="config-value" title={config.value ?? undefined}>{config.value ?? '—'}</td><td>{config.description ?? '—'}</td><td><Badge tone={config.enabled ? 'success' : 'neutral'}>{config.enabled ? '启用' : '停用'}</Badge></td><td className="config-time">{formatTime(config.updatedAt)}</td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={() => onEdit(config)} disabled={pending}><Pencil size={14} /> 编辑</Button><Button variant="ghost" size="sm" onClick={() => onDelete(config)} disabled={pending}>删除</Button></div></td></tr>
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
