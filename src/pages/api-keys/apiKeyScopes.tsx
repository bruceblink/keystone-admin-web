import { useMemo, useState } from 'react'

export type PermissionCatalogEntry = { permission: string; resource: string; action: string; description: string; risk: string; registered: boolean; allowed: boolean }

const RESOURCE_LABELS: Record<string, string> = {
  'api-key': 'API Key', audit: '操作审计', cache: '缓存', config: '系统配置', department: '组织结构', dictionary: '字典', file: '文件', job: '定时任务', 'login-log': '登录日志', menu: '菜单与权限', mfa: '多因素认证', notice: '通知公告', 'online-session': '在线会话', 'operation-log': '操作日志', permission: '权限管理', post: '岗位管理', role: '角色管理', server: '服务器', session: '会话', user: '用户管理',
}

const ACTION_LABELS: Record<string, string> = { create: '新增', delete: '删除', export: '导出', import: '导入', manage: '管理', read: '读取', refresh: '刷新', revoke: '撤销', rotate: '轮换', run: '执行', 'reset-password': '重置密码', update: '修改', 'update-status': '修改状态', write: '写入', assign: '分配' }

type Props = { entries: PermissionCatalogEntry[]; selected: string[]; loading?: boolean; error?: string | null; validationError?: string | null; disabled?: boolean; onRetry?: () => void; onChange: (scopes: string[]) => void }

/** 从后端权限目录读取并按资源分组显示，提交值只来自 allowed 条目。 */
export function ApiKeyScopePicker({ entries, selected, loading = false, error = null, validationError = null, disabled = false, onRetry, onChange }: Props) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const availableEntries = entries.filter((entry) => entry.allowed && entry.registered)
  const groups = useMemo(() => Array.from(new Set(availableEntries.map((entry) => entry.resource))).map((resource) => ({ resource, options: availableEntries.filter((entry) => entry.resource === resource && (!normalizedQuery || `${entry.permission} ${entry.description} ${entry.action}`.toLocaleLowerCase().includes(normalizedQuery))) })).filter((group) => group.options.length > 0), [availableEntries, normalizedQuery])

  function toggle(scope: string) {
    onChange(selected.includes(scope) ? selected.filter((value) => value !== scope) : [...selected, scope].sort())
  }

  return <fieldset className="api-key-scope-picker" disabled={disabled}>
    <legend>授权范围 *</legend>
    {loading ? <p className="form-help" role="status">正在读取接口权限目录…</p> : null}
    {error ? <div className="modal-form-error" role="alert"><span>接口权限目录读取失败：{error}</span>{onRetry ? <button type="button" className="button button-ghost button-sm" onClick={onRetry}>重试</button> : null}</div> : null}
    {validationError ? <p className="modal-form-error" role="alert">{validationError}</p> : null}
    {!loading && !error ? <><div className="api-key-scope-toolbar"><input aria-label="筛选授权范围" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索权限，例如 user:read" autoComplete="off" /><span>{selected.length} 项已选择</span></div><div className="api-key-scope-groups">{groups.map((group) => <section key={group.resource} className="api-key-scope-group"><h4>{RESOURCE_LABELS[group.resource] ?? group.resource}</h4><div>{group.options.map((entry) => <label key={entry.permission} className="checkbox-label"><input type="checkbox" value={entry.permission} checked={selected.includes(entry.permission)} onChange={() => toggle(entry.permission)} /><span>{ACTION_LABELS[entry.action] ?? entry.action}</span><code>{entry.permission}</code></label>)}</div></section>)}</div>{groups.length === 0 ? <p className="form-help" role="status">没有可配置的接口权限。</p> : null}<p className="form-help">权限目录由系统 API 提供；签发时还会检查签发账号当前权限。</p></> : null}
  </fieldset>
}

export function validateApiKeyScopes(scopes: string[], entries: PermissionCatalogEntry[]) {
  if (scopes.length === 0) return '至少选择一项授权范围'
  if (scopes.some((scope) => !entries.some((entry) => entry.permission === scope && entry.allowed && entry.registered))) return '授权范围包含无效权限'
  return null
}
