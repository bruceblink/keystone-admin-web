import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Pencil, Plus, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeDictionaryItem, NativeDictionaryItemWriteInput, NativeDictionaryType, NativeDictionaryTypeWriteInput } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, Spinner } from '../../shared/ui'
import { DictionaryItemFormModal } from './DictionaryItemFormModal'
import { DictionaryTypeFormModal } from './DictionaryTypeFormModal'

// 字典类型和条目分开加载，选择类型后才请求对应条目，避免一次读取无关数据。
export function DictionariesPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [selectedCode, setSelectedCode] = useState('')
  const [typeModalMode, setTypeModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingType, setEditingType] = useState<NativeDictionaryType | null>(null)
  const [itemModalMode, setItemModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<NativeDictionaryItem | null>(null)
  const typesQuery = useQuery({ queryKey: ['dictionary-types'], queryFn: () => apiClient.listDictionaryTypes(), staleTime: 10_000 })
  const types = useMemo(() => {
    const normalized = appliedKeyword.toLocaleLowerCase()
    return (typesQuery.data ?? []).filter((type) => !normalized || `${type.code} ${type.name}`.toLocaleLowerCase().includes(normalized))
  }, [appliedKeyword, typesQuery.data])

  useEffect(() => {
    if (types.length > 0 && !types.some((type) => type.code === selectedCode)) setSelectedCode(types[0].code)
    if (types.length === 0) setSelectedCode('')
  }, [selectedCode, types])

  const itemsQuery = useQuery({ queryKey: ['dictionary-items', selectedCode], queryFn: () => apiClient.listDictionaryItems(selectedCode), enabled: Boolean(selectedCode), staleTime: 10_000 })
  const typeMutation = useMutation({ mutationFn: ({ code, input }: { code?: string; input: NativeDictionaryTypeWriteInput }) => code ? apiClient.updateDictionaryType(code, input) : apiClient.createDictionaryType(input), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['dictionary-types'] }); setTypeModalMode(null); setEditingType(null) } })
  const itemMutation = useMutation({ mutationFn: ({ id, typeCode, input }: { id?: string; typeCode: string; input: NativeDictionaryItemWriteInput }) => id ? apiClient.updateDictionaryItem(id, input) : apiClient.createDictionaryItem(typeCode, input), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['dictionary-items', selectedCode] }); setItemModalMode(null); setEditingItem(null) } })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedKeyword(keyword.trim())
  }

  function reset() {
    setKeyword('')
    setAppliedKeyword('')
  }

  function openCreateType() { typeMutation.reset(); setEditingType(null); setTypeModalMode('create') }
  function openEditType(type: NativeDictionaryType) { typeMutation.reset(); setEditingType(type); setTypeModalMode('edit') }
  function closeTypeModal() { if (typeMutation.isPending) return; setTypeModalMode(null); setEditingType(null) }
  async function submitType(input: NativeDictionaryTypeWriteInput) { try { await typeMutation.mutateAsync({ code: editingType?.code, input }) } catch { /* 保留表单状态和错误。 */ } }
  function openCreateItem() { if (!selectedCode) return; itemMutation.reset(); setEditingItem(null); setItemModalMode('create') }
  function openEditItem(item: NativeDictionaryItem) { itemMutation.reset(); setEditingItem(item); setItemModalMode('edit') }
  function closeItemModal() { if (itemMutation.isPending) return; setItemModalMode(null); setEditingItem(null) }
  async function submitItem(input: NativeDictionaryItemWriteInput) { if (!selectedCode) return; try { await itemMutation.mutateAsync({ id: editingItem?.id, typeCode: selectedCode, input }) } catch { /* 保留表单状态和错误。 */ } }

  return <div className="dictionaries-page">
    <div className="page-heading"><div><p className="eyebrow">SYSTEM / DICTIONARIES</p><h1>字典管理</h1><p className="page-description">查询字典类型和条目，新增和编辑在模态框中完成。</p></div><div className="heading-actions"><Button size="sm" onClick={openCreateType}><Plus size={15} /> 新增类型</Button><Button variant="secondary" size="sm" onClick={() => void typesQuery.refetch()} disabled={typesQuery.isFetching}><RefreshCw size={15} className={typesQuery.isFetching ? 'spin' : ''} /> 刷新字典</Button></div></div>
    <Card className="dictionaries-filter-card"><form className="dictionaries-filter-form" onSubmit={submit}><label><span>类型编码或名称</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按类型编码或名称筛选" autoComplete="off" /></label><div className="dictionaries-filter-actions"><Button type="submit" size="sm" disabled={typesQuery.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    {typesQuery.isLoading ? <div className="loading-panel dictionaries-loading"><Spinner label="正在读取字典类型" /></div> : null}
    {typesQuery.isError && !typesQuery.data ? <DictionaryError message={typesQuery.error instanceof Error ? typesQuery.error.message : '字典类型读取失败'} onRetry={() => void typesQuery.refetch()} /> : null}
    {typesQuery.data ? <div className="dictionary-grid"><Card className="dictionary-types-card"><CardHeader title="字典类型" description={`共 ${types.length.toLocaleString('zh-CN')} 个匹配类型`} action={<Badge tone="info">Native API</Badge>} />{types.length > 0 ? <div className="dictionary-types-list">{types.map((type) => <TypeRow key={type.id} type={type} selected={type.code === selectedCode} onSelect={() => setSelectedCode(type.code)} onEdit={() => openEditType(type)} />)}</div> : <div className="dictionaries-empty" role="status"><span className="dictionaries-empty-icon"><BookOpen size={20} /></span><strong>没有匹配的字典类型</strong><p>调整筛选条件后重试。</p></div>}</Card><DictionaryItemsCard code={selectedCode} query={itemsQuery} onCreate={openCreateItem} onEdit={openEditItem} /></div> : null}
    <DictionaryTypeFormModal open={typeModalMode !== null} mode={typeModalMode ?? 'create'} typeItem={editingType} pending={typeMutation.isPending} error={typeMutation.error instanceof Error ? typeMutation.error.message : null} onClose={closeTypeModal} onSubmit={submitType} />
    <DictionaryItemFormModal open={itemModalMode !== null} mode={itemModalMode ?? 'create'} item={editingItem} pending={itemMutation.isPending} error={itemMutation.error instanceof Error ? itemMutation.error.message : null} onClose={closeItemModal} onSubmit={submitItem} />
  </div>
}

function TypeRow({ type, selected, onSelect, onEdit }: { type: NativeDictionaryType; selected: boolean; onSelect: () => void; onEdit: () => void }) {
  return <div className={`dictionary-type-row ${selected ? 'dictionary-type-row-selected' : ''}`}><button type="button" className="dictionary-type-select" onClick={onSelect}><span><strong>{type.name}</strong><small>{type.code}</small></span><Badge tone={type.enabled ? 'success' : 'neutral'}>{type.enabled ? '启用' : '停用'}</Badge></button><Button variant="ghost" size="sm" onClick={onEdit} aria-label={`编辑${type.name}`}><Pencil size={13} /></Button></div>
}

function DictionaryItemsCard({ code, query, onCreate, onEdit }: { code: string; query: ReturnType<typeof useQuery<NativeDictionaryItem[]>>; onCreate: () => void; onEdit: (item: NativeDictionaryItem) => void }) {
  const items = query.data ?? []
  return <Card className="dictionary-items-card"><CardHeader title={code ? `${code} · 字典条目` : '字典条目'} description={query.isError ? '读取失败，请重试' : `共 ${items.length.toLocaleString('zh-CN')} 个条目`} action={code ? <Button size="sm" onClick={onCreate}><Plus size={14} /> 新增条目</Button> : <Badge tone="neutral">选择类型后维护</Badge>} />{!code ? <div className="dictionaries-empty" role="status"><span className="dictionaries-empty-icon"><BookOpen size={20} /></span><strong>选择一个字典类型</strong><p>左侧选择类型后查看条目。</p></div> : query.isLoading ? <div className="loading-panel dictionaries-items-loading"><Spinner label="正在读取字典条目" /></div> : query.isError ? <DictionaryError message={query.error instanceof Error ? query.error.message : '字典条目读取失败'} onRetry={() => void query.refetch()} /> : items.length > 0 ? <div className="dictionary-items-wrap"><table className="dictionary-items-table"><thead><tr><th scope="col">值</th><th scope="col">显示名称</th><th scope="col">排序</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{items.map((item) => <ItemRow key={item.id} item={item} onEdit={() => onEdit(item)} />)}</tbody></table></div> : <div className="dictionaries-empty" role="status"><span className="dictionaries-empty-icon"><BookOpen size={20} /></span><strong>暂无字典条目</strong><p>该字典类型当前没有可用条目。</p></div>}</Card>
}

function ItemRow({ item, onEdit }: { item: NativeDictionaryItem; onEdit: () => void }) {
  return <tr><td><code className="dictionary-item-value">{item.value}</code></td><td>{item.label}</td><td>{item.sortOrder}</td><td><Badge tone={item.enabled ? 'success' : 'neutral'}>{item.enabled ? '启用' : '停用'}</Badge></td><td><Button variant="ghost" size="sm" onClick={onEdit}><Pencil size={14} /> 编辑</Button></td></tr>
}

function DictionaryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel dictionaries-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取字典数据</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
