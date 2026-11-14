import { useEffect, useMemo, useState } from 'react'
import { BookOpen, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeDictionaryItem, NativeDictionaryType } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, Spinner } from '../../shared/ui'

// 字典类型和条目分开加载，选择类型后才请求对应条目，避免一次读取无关数据。
export function DictionariesPage() {
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [selectedCode, setSelectedCode] = useState('')
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

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedKeyword(keyword.trim())
  }

  function reset() {
    setKeyword('')
    setAppliedKeyword('')
  }

  return <div className="dictionaries-page">
    <div className="page-heading"><div><p className="eyebrow">SYSTEM / DICTIONARIES</p><h1>字典管理</h1><p className="page-description">查询字典类型和条目，统一查看业务状态值。新增、编辑和删除将在后续模态框流程中完成。</p></div><div className="heading-actions"><Button variant="secondary" size="sm" onClick={() => void typesQuery.refetch()} disabled={typesQuery.isFetching}><RefreshCw size={15} className={typesQuery.isFetching ? 'spin' : ''} /> 刷新字典</Button></div></div>
    <Card className="dictionaries-filter-card"><form className="dictionaries-filter-form" onSubmit={submit}><label><span>类型编码或名称</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按类型编码或名称筛选" autoComplete="off" /></label><div className="dictionaries-filter-actions"><Button type="submit" size="sm" disabled={typesQuery.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div></form></Card>
    {typesQuery.isLoading ? <div className="loading-panel dictionaries-loading"><Spinner label="正在读取字典类型" /></div> : null}
    {typesQuery.isError && !typesQuery.data ? <DictionaryError message={typesQuery.error instanceof Error ? typesQuery.error.message : '字典类型读取失败'} onRetry={() => void typesQuery.refetch()} /> : null}
    {typesQuery.data ? <div className="dictionary-grid"><Card className="dictionary-types-card"><CardHeader title="字典类型" description={`共 ${types.length.toLocaleString('zh-CN')} 个匹配类型`} action={<Badge tone="info">Native API</Badge>} />{types.length > 0 ? <div className="dictionary-types-list">{types.map((type) => <TypeRow key={type.id} type={type} selected={type.code === selectedCode} onSelect={() => setSelectedCode(type.code)} />)}</div> : <div className="dictionaries-empty" role="status"><span className="dictionaries-empty-icon"><BookOpen size={20} /></span><strong>没有匹配的字典类型</strong><p>调整筛选条件后重试。</p></div>}</Card><DictionaryItemsCard code={selectedCode} query={itemsQuery} /></div> : null}
  </div>
}

function TypeRow({ type, selected, onSelect }: { type: NativeDictionaryType; selected: boolean; onSelect: () => void }) {
  return <button type="button" className={`dictionary-type-row ${selected ? 'dictionary-type-row-selected' : ''}`} onClick={onSelect}><span><strong>{type.name}</strong><small>{type.code}</small></span><Badge tone={type.enabled ? 'success' : 'neutral'}>{type.enabled ? '启用' : '停用'}</Badge></button>
}

function DictionaryItemsCard({ code, query }: { code: string; query: ReturnType<typeof useQuery<NativeDictionaryItem[]>> }) {
  const items = query.data ?? []
  return <Card className="dictionary-items-card"><CardHeader title={code ? `${code} · 字典条目` : '字典条目'} description={query.isError ? '读取失败，请重试' : `共 ${items.length.toLocaleString('zh-CN')} 个条目`} action={<Badge tone="neutral">只读</Badge>} />{!code ? <div className="dictionaries-empty" role="status"><span className="dictionaries-empty-icon"><BookOpen size={20} /></span><strong>选择一个字典类型</strong><p>左侧选择类型后查看条目。</p></div> : query.isLoading ? <div className="loading-panel dictionaries-items-loading"><Spinner label="正在读取字典条目" /></div> : query.isError ? <DictionaryError message={query.error instanceof Error ? query.error.message : '字典条目读取失败'} onRetry={() => void query.refetch()} /> : items.length > 0 ? <div className="dictionary-items-wrap"><table className="dictionary-items-table"><thead><tr><th scope="col">值</th><th scope="col">显示名称</th><th scope="col">排序</th><th scope="col">状态</th></tr></thead><tbody>{items.map((item) => <ItemRow key={item.id} item={item} />)}</tbody></table></div> : <div className="dictionaries-empty" role="status"><span className="dictionaries-empty-icon"><BookOpen size={20} /></span><strong>暂无字典条目</strong><p>该字典类型当前没有可用条目。</p></div>}</Card>
}

function ItemRow({ item }: { item: NativeDictionaryItem }) {
  return <tr><td><code className="dictionary-item-value">{item.value}</code></td><td>{item.label}</td><td>{item.sortOrder}</td><td><Badge tone={item.enabled ? 'success' : 'neutral'}>{item.enabled ? '启用' : '停用'}</Badge></td></tr>
}

function DictionaryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel dictionaries-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取字典数据</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
