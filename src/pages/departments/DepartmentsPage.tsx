import { useMemo, useState } from 'react'
import { Building2, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeDepartment } from '../../shared/api/schemas'
import { Badge, Button, Card, CardHeader, Spinner } from '../../shared/ui'

type DepartmentRow = NativeDepartment & { level: number }

export function DepartmentsPage() {
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const query = useQuery({ queryKey: ['departments'], queryFn: () => apiClient.listDepartments(), staleTime: 10_000 })
  const rows = useMemo(() => {
    const allRows = flattenDepartments(query.data ?? [])
    const normalized = appliedKeyword.toLocaleLowerCase()
    if (!normalized) return allRows
    const matchingIds = new Set(allRows.filter((row) => `${row.code} ${row.name}`.toLocaleLowerCase().includes(normalized)).map((row) => row.id))
    return allRows.filter((row) => matchingIds.has(row.id) || (row.parentId && matchingIds.has(row.parentId)))
  }, [appliedKeyword, query.data])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedKeyword(keyword.trim())
  }

  function reset() {
    setKeyword('')
    setAppliedKeyword('')
  }

  function refresh() {
    void query.refetch()
  }

  return (
    <div className="departments-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZATION / STRUCTURE</p>
          <h1>组织结构</h1>
          <p className="page-description">按层级查看部门、组织编码和启用状态，组织调整将在后续模态框流程中完成。</p>
        </div>
        <div className="heading-actions"><Button variant="secondary" size="sm" onClick={refresh} disabled={query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> 刷新结构</Button></div>
      </div>

      <Card className="departments-filter-card">
        <form className="departments-filter-form" onSubmit={submit}>
          <label><span>组织名称或编码</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按组织名称或编码筛选" autoComplete="off" /></label>
          <div className="departments-filter-actions"><Button type="submit" size="sm" disabled={query.isFetching}><Search size={15} /> 查询</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>重置</Button></div>
        </form>
      </Card>

      {query.isLoading ? <div className="loading-panel departments-loading"><Spinner label="正在读取组织结构" /></div> : null}
      {query.isError && !query.data ? <DepartmentError message={query.error instanceof Error ? query.error.message : '组织结构读取失败'} onRetry={refresh} /> : null}
      {query.data ? <Card className="departments-table-card">
        <CardHeader title="组织结构" description={`共 ${rows.length.toLocaleString('zh-CN')} 个组织节点`} action={<Badge tone="info">Native API</Badge>} />
        {rows.length > 0 ? <div className="departments-table-wrap"><table className="departments-table"><thead><tr><th scope="col">组织名称</th><th scope="col">组织编码</th><th scope="col">排序</th><th scope="col">状态</th></tr></thead><tbody>{rows.map((row) => <DepartmentRow key={row.id} row={row} />)}</tbody></table></div> : <div className="departments-empty" role="status"><span className="departments-empty-icon"><Building2 size={20} /></span><strong>没有匹配的组织</strong><p>调整筛选条件后重试，或清空筛选条件查看完整组织结构。</p></div>}
      </Card> : null}
    </div>
  )
}

function DepartmentRow({ row }: { row: DepartmentRow }) {
  return <tr><td><div className="department-cell" style={{ paddingLeft: `${row.level * 22}px` }}><span className="department-marker"><Building2 size={15} /></span><strong>{row.name}</strong></div></td><td className="department-code">{row.code}</td><td>{row.sortOrder}</td><td><Badge tone={row.enabled ? 'success' : 'warning'}>{row.enabled ? '启用' : '停用'}</Badge></td></tr>
}

// 先按父子关系构建稳定顺序，避免接口返回顺序改变时页面跳动。
function flattenDepartments(departments: NativeDepartment[]): DepartmentRow[] {
  const children = new Map<string | null, NativeDepartment[]>()
  for (const department of departments) {
    const list = children.get(department.parentId) ?? []
    list.push(department)
    children.set(department.parentId, list)
  }
  for (const list of children.values()) list.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))

  const rows: DepartmentRow[] = []
  const visited = new Set<string>()
  function visit(parentId: string | null, level: number) {
    for (const department of children.get(parentId) ?? []) {
      if (visited.has(department.id)) continue
      visited.add(department.id)
      rows.push({ ...department, level })
      visit(department.id, level + 1)
    }
  }
  visit(null, 0)
  for (const department of departments) {
    if (!visited.has(department.id)) rows.push({ ...department, level: 0 })
  }
  return rows
}

function DepartmentError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel departments-error" role="alert"><ShieldAlert size={19} /><div><strong>无法读取组织结构</strong><p>{message}</p></div><Button variant="secondary" size="sm" onClick={onRetry}>重试</Button></div>
}
