import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { formatApiError } from '../../shared/api/errors'
import type { NativeDictionaryItem, NativeDictionaryItemWriteInput, NativeDictionaryItemsPage, NativeDictionaryType, NativeDictionaryTypeWriteInput } from '../../shared/api/schemas'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, DeleteConfirmModal, ListToolbar, Spinner, StaleQueryError } from '../../shared/ui'
import { DictionaryItemFormModal } from './DictionaryItemFormModal'
import { DictionaryTypeFormModal } from './DictionaryTypeFormModal'
import { useUrlQueryState } from '../../shared/navigation/useUrlQueryState'

const PAGE_SIZE = 20
const urlDefaults = { keyword: '', selected: '', itemPage: 1, itemKeyword: '' }
const urlOptions = { namespace: 'dictionaries' }

// 字典类型和条目分开加载，选择类型后才请求对应条目，避免一次读取无关数据。
export function DictionariesPage() {
  const queryClient = useQueryClient()
  const [urlState, setUrlState] = useUrlQueryState(urlDefaults, urlOptions)
  const [keyword, setKeyword] = useState(urlState.keyword)
  const appliedKeyword = urlState.keyword
  const [itemKeyword, setItemKeyword] = useState(urlState.itemKeyword)
  const [typeModalMode, setTypeModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingType, setEditingType] = useState<NativeDictionaryType | null>(null)
  const [itemModalMode, setItemModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<NativeDictionaryItem | null>(null)
  const [deletingType, setDeletingType] = useState<NativeDictionaryType | null>(null)
  const [deletingItem, setDeletingItem] = useState<NativeDictionaryItem | null>(null)
  const selectedCode = urlState.selected
  const itemPage = urlState.itemPage
  const appliedItemKeyword = urlState.itemKeyword
  const typesQuery = useQuery({ queryKey: ['dictionary-types'], queryFn: () => apiClient.listDictionaryTypes(), staleTime: 10_000 })
  const types = useMemo(() => {
    const normalized = appliedKeyword.toLocaleLowerCase()
    return (typesQuery.data ?? []).filter((type) => !normalized || `${type.code} ${type.name}`.toLocaleLowerCase().includes(normalized))
  }, [appliedKeyword, typesQuery.data])

  useEffect(() => {
    if (types.length > 0 && !types.some((type) => type.code === selectedCode)) setUrlState({ selected: types[0].code, itemPage: 1, itemKeyword: '' })
    if (types.length === 0 && selectedCode !== '') setUrlState({ selected: '', itemPage: 1, itemKeyword: '' })
  }, [selectedCode, setUrlState, types])

  const itemsQuery = useQuery({ queryKey: ['dictionary-items', selectedCode, appliedItemKeyword, itemPage], queryFn: () => apiClient.listDictionaryItemsPage(selectedCode, { keyword: appliedItemKeyword, page: itemPage, size: PAGE_SIZE }), enabled: Boolean(selectedCode), staleTime: 10_000 })
  const typeMutation = useMutation({ mutationFn: ({ code, input }: { code?: string; input: NativeDictionaryTypeWriteInput }) => code ? apiClient.updateDictionaryType(code, input) : apiClient.createDictionaryType(input), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['dictionary-types'] }); setTypeModalMode(null); setEditingType(null) } })
  const itemMutation = useMutation({ mutationFn: ({ id, typeCode, input }: { id?: string; typeCode: string; input: NativeDictionaryItemWriteInput }) => id ? apiClient.updateDictionaryItem(id, input) : apiClient.createDictionaryItem(typeCode, input), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['dictionary-items', selectedCode] }); setUrlState({ itemPage: 1 }); setItemModalMode(null); setEditingItem(null) } })
  const deleteTypeMutation = useMutation({
    mutationFn: (code: string) => apiClient.deleteDictionaryType(code),
    onSuccess: async (_result, code) => {
      await queryClient.invalidateQueries({ queryKey: ['dictionary-types'] })
      queryClient.removeQueries({ queryKey: ['dictionary-items', code] })
      setUrlState({ selected: '', itemPage: 1, itemKeyword: '' })
      setDeletingType(null)
    },
  })
  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteDictionaryItem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dictionary-items', selectedCode] })
      setUrlState({ itemPage: 1 })
      setDeletingItem(null)
    },
  })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ keyword: keyword.trim() }, { history: 'push' })
  }

  function submitItemFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUrlState({ itemKeyword: itemKeyword.trim(), itemPage: 1 }, { history: 'push' })
  }

  function resetItemFilter() {
    setItemKeyword('')
    setUrlState({ itemKeyword: '', itemPage: 1 }, { history: 'push' })
  }

  function reset() {
    setKeyword('')
    setUrlState({ keyword: '' }, { history: 'push' })
  }

  function openCreateType() { typeMutation.reset(); setEditingType(null); setTypeModalMode('create') }
  function openEditType(type: NativeDictionaryType) { typeMutation.reset(); setEditingType(type); setTypeModalMode('edit') }
  function closeTypeModal() { if (typeMutation.isPending) return; setTypeModalMode(null); setEditingType(null) }
  async function submitType(input: NativeDictionaryTypeWriteInput) { try { await typeMutation.mutateAsync({ code: editingType?.code, input }) } catch { /* 保留表单状态和错误。 */ } }
  function openCreateItem() { if (!selectedCode) return; itemMutation.reset(); setEditingItem(null); setItemModalMode('create') }
  function openEditItem(item: NativeDictionaryItem) { itemMutation.reset(); setEditingItem(item); setItemModalMode('edit') }
  function closeItemModal() { if (itemMutation.isPending) return; setItemModalMode(null); setEditingItem(null) }
  async function submitItem(input: NativeDictionaryItemWriteInput) { if (!selectedCode) return; try { await itemMutation.mutateAsync({ id: editingItem?.id, typeCode: selectedCode, input }) } catch { /* 保留表单状态和错误。 */ } }
  function openDeleteType(type: NativeDictionaryType) { deleteTypeMutation.reset(); setDeletingType(type) }
  function closeDeleteType() { if (!deleteTypeMutation.isPending) setDeletingType(null) }
  function openDeleteItem(item: NativeDictionaryItem) { deleteItemMutation.reset(); setDeletingItem(item) }
  function closeDeleteItem() { if (!deleteItemMutation.isPending) setDeletingItem(null) }

  useEffect(() => {
    setItemKeyword(appliedItemKeyword)
  }, [appliedItemKeyword])

  // 浏览器前进后退或打开深链接时，同步字典类型查询框。
  useEffect(() => {
    setKeyword(appliedKeyword)
  }, [appliedKeyword])

  const itemTotal = itemsQuery.data?.total ?? 0
  const itemTotalPages = Math.max(1, Math.ceil(itemTotal / PAGE_SIZE))

  useEffect(() => {
    if (itemsQuery.data && itemPage > itemTotalPages) setUrlState({ itemPage: itemTotalPages })
  }, [itemPage, itemTotalPages, itemsQuery.data, setUrlState])

  return <div className="dictionaries-page">
    <div className="page-heading"><div><p className="eyebrow">SYSTEM / DICTIONARIES</p><h1>字典管理</h1><p className="page-description">查询字典类型和条目，新增和编辑在模态框中完成。</p></div></div>
    <Card className="dictionaries-filter-card"><form className="dictionaries-filter-form" onSubmit={submit}><label><span>类型编码或名称</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按类型编码或名称筛选" autoComplete="off" /></label><div className="dictionaries-filter-actions"><Button type="submit" size="sm" disabled={typesQuery.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    <ActionError title="字典类型删除失败" error={deleteTypeMutation.error} onDismiss={() => deleteTypeMutation.reset()} />
    <ActionError title="字典条目删除失败" error={deleteItemMutation.error} onDismiss={() => deleteItemMutation.reset()} />
    <div className="dictionary-grid">
      <Card className="dictionary-types-card">
        <ListToolbar label="字典类型操作"><Button size="sm" onClick={openCreateType}><Plus size={15} /> 新增类型</Button><Button variant="secondary" size="sm" onClick={() => void typesQuery.refetch()} disabled={typesQuery.isFetching}><RefreshCw size={15} className={typesQuery.isFetching ? 'spin' : ''} /> 刷新字典</Button></ListToolbar>
        <CardHeader title="字典类型" description={typesQuery.isLoading ? '正在读取系统 API' : typesQuery.isError ? '读取失败，请检查服务连接' : `共 ${types.length.toLocaleString('zh-CN')} 个匹配类型`} action={<Badge tone="info">系统 API</Badge>} />
        {typesQuery.isLoading ? <div className="loading-panel dictionaries-loading"><Spinner label="正在读取字典类型" /></div> : null}
        {typesQuery.isError && !typesQuery.data ? <InitialQueryError title="无法读取字典类型" message="字典类型读取失败，请重试" error={typesQuery.error} onRetry={() => void typesQuery.refetch()} retrying={typesQuery.isFetching} /> : null}
        {typesQuery.isError && typesQuery.data ? <StaleQueryError message={formatApiError(typesQuery.error, '字典类型刷新失败，请重试')} error={typesQuery.error} onRetry={() => void typesQuery.refetch()} retrying={typesQuery.isFetching} /> : null}
        {typesQuery.data ? types.length > 0 ? <div className="dictionary-types-list">{types.map((type) => <TypeRow key={type.id} type={type} selected={type.code === selectedCode} pending={deleteTypeMutation.isPending} onSelect={() => setUrlState({ selected: type.code, itemPage: 1, itemKeyword: '' }, { history: 'push' })} onEdit={() => openEditType(type)} onDelete={() => openDeleteType(type)} />)}</div> : <div className="dictionaries-empty" role="status"><span className="dictionaries-empty-icon"><BookOpen size={20} /></span><strong>没有匹配的字典类型</strong><p>调整筛选条件后重试。</p></div> : null}
      </Card>
      <DictionaryItemsCard code={selectedCode} query={itemsQuery} itemKeyword={itemKeyword} onItemKeywordChange={setItemKeyword} onItemSearch={submitItemFilter} onItemReset={resetItemFilter} total={itemTotal} page={itemPage} totalPages={itemTotalPages} pending={deleteItemMutation.isPending} onRefresh={() => void itemsQuery.refetch()} onCreate={openCreateItem} onEdit={openEditItem} onDelete={openDeleteItem} onPageChange={(nextPage) => setUrlState({ itemPage: nextPage }, { history: 'push' })} />
    </div>
    <DictionaryTypeFormModal open={typeModalMode !== null} mode={typeModalMode ?? 'create'} typeItem={editingType} pending={typeMutation.isPending} error={typeMutation.error} onClose={closeTypeModal} onSubmit={submitType} />
    <DictionaryItemFormModal open={itemModalMode !== null} mode={itemModalMode ?? 'create'} item={editingItem} pending={itemMutation.isPending} error={itemMutation.error} onClose={closeItemModal} onSubmit={submitItem} />
    <DeleteConfirmModal open={deletingType !== null} resourceLabel="字典类型" count={1} pending={deleteTypeMutation.isPending} error={deleteTypeMutation.error} onClose={closeDeleteType} onConfirm={() => { if (deletingType) void deleteTypeMutation.mutateAsync(deletingType.code).catch(() => undefined) }} />
    <DeleteConfirmModal open={deletingItem !== null} resourceLabel="字典条目" count={1} pending={deleteItemMutation.isPending} error={deleteItemMutation.error} onClose={closeDeleteItem} onConfirm={() => { if (deletingItem) void deleteItemMutation.mutateAsync(deletingItem.id).catch(() => undefined) }} />
  </div>
}

function TypeRow({ type, selected, pending, onSelect, onEdit, onDelete }: { type: NativeDictionaryType; selected: boolean; pending: boolean; onSelect: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className={`dictionary-type-row ${selected ? 'dictionary-type-row-selected' : ''}`}><button type="button" className="dictionary-type-select" onClick={onSelect} disabled={pending}><span><strong>{type.name}</strong><small>{type.code}</small></span><Badge tone={type.enabled ? 'success' : 'neutral'}>{type.enabled ? '启用' : '停用'}</Badge></button><div className="table-actions"><Button variant="ghost" size="sm" onClick={onEdit} aria-label={`编辑${type.name}`} disabled={pending}><Pencil size={13} /></Button><Button variant="ghost" size="sm" onClick={onDelete} aria-label={`删除${type.name}`} disabled={pending}>删除</Button></div></div>
}

function DictionaryItemsCard({ code, query, itemKeyword, onItemKeywordChange, onItemSearch, onItemReset, total, page, totalPages, pending, onRefresh, onCreate, onEdit, onDelete, onPageChange }: { code: string; query: ReturnType<typeof useQuery<NativeDictionaryItemsPage>>; itemKeyword: string; onItemKeywordChange: (value: string) => void; onItemSearch: (event: React.FormEvent<HTMLFormElement>) => void; onItemReset: () => void; total: number; page: number; totalPages: number; pending: boolean; onRefresh: () => void; onCreate: () => void; onEdit: (item: NativeDictionaryItem) => void; onDelete: (item: NativeDictionaryItem) => void; onPageChange: (page: number) => void }) {
  const items = query.data?.items ?? []
  return <Card className="dictionary-items-card">
    {code ? <form className="dictionary-items-filter-form" onSubmit={onItemSearch}><label><span>条目值或名称</span><input value={itemKeyword} onChange={(event) => onItemKeywordChange(event.target.value)} placeholder="按值或名称筛选" autoComplete="off" /></label><div><Button type="submit" size="sm" disabled={query.isFetching}><Search size={14} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={onItemReset}>重置</Button></div></form> : null}
    {code ? <ListToolbar label="字典条目操作"><Button size="sm" onClick={onCreate} disabled={pending}><Plus size={14} /> 新增条目</Button><Button variant="secondary" size="sm" onClick={onRefresh} disabled={query.isFetching}><RefreshCw size={14} className={query.isFetching ? 'spin' : undefined} /> 刷新条目</Button></ListToolbar> : null}
    <CardHeader title={code ? `${code} · 字典条目` : '字典条目'} description={query.isError ? '读取失败，请重试' : `共 ${total.toLocaleString('zh-CN')} 个条目`} action={code ? undefined : <Badge tone="neutral">选择类型后维护</Badge>} />
    {!code ? <div className="dictionaries-empty" role="status"><span className="dictionaries-empty-icon"><BookOpen size={20} /></span><strong>选择一个字典类型</strong><p>左侧选择类型后查看条目。</p></div> : query.isLoading ? <div className="loading-panel dictionaries-items-loading"><Spinner label="正在读取字典条目" /></div> : query.isError && !query.data ? <InitialQueryError title="无法读取字典条目" message="字典条目读取失败，请重试" error={query.error} onRetry={onRefresh} retrying={query.isFetching} /> : <>{query.isError ? <StaleQueryError message={formatApiError(query.error, '字典条目刷新失败，请重试')} error={query.error} onRetry={onRefresh} retrying={query.isFetching} /> : null}{items.length > 0 ? <div className="dictionary-items-wrap"><table className="dictionary-items-table"><thead><tr><th scope="col">值</th><th scope="col">显示名称</th><th scope="col">排序</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{items.map((item) => <ItemRow key={item.id} item={item} pending={pending} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />)}</tbody></table></div> : <div className="dictionaries-empty" role="status"><span className="dictionaries-empty-icon"><BookOpen size={20} /></span><strong>暂无字典条目</strong><p>该字典类型当前没有可用条目。</p></div>}{totalPages > 1 ? <div className="dictionary-items-pagination"><span>第 {page} / {totalPages} 页</span><div><Button variant="ghost" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => onPageChange(page - 1)}>上一页</Button><Button variant="ghost" size="sm" disabled={page >= totalPages || query.isFetching} onClick={() => onPageChange(page + 1)}>下一页</Button></div></div> : null}</>}
  </Card>
}

function ItemRow({ item, pending, onEdit, onDelete }: { item: NativeDictionaryItem; pending: boolean; onEdit: () => void; onDelete: () => void }) {
  return <tr><td><code className="dictionary-item-value">{item.value}</code></td><td>{item.label}</td><td>{item.sortOrder}</td><td><Badge tone={item.enabled ? 'success' : 'neutral'}>{item.enabled ? '启用' : '停用'}</Badge></td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={onEdit} disabled={pending}><Pencil size={14} /> 编辑</Button><Button variant="ghost" size="sm" onClick={onDelete} disabled={pending}>删除</Button></div></td></tr>
}
