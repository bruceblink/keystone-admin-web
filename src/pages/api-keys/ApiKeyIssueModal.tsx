import { useEffect, useState } from 'react'
import { ActionError, Button, Modal } from '../../shared/ui'
import { ApiKeyScopePicker, validateApiKeyScopes, type PermissionCatalogEntry } from './apiKeyScopes'

type Props = { open: boolean; pending: boolean; error: unknown; scopeEntries: PermissionCatalogEntry[]; scopeLoading: boolean; scopeError: unknown; onRetryScopes: () => void; onClose: () => void; onSubmit: (input: { name: string; scopes: string[]; expiresAt?: string | null }) => Promise<void> }

/** API Key 签发模态框；明文只在成功响应的内存提示中展示一次。 */
export function ApiKeyIssueModal({ open, pending, error, scopeEntries, scopeLoading, scopeError, onRetryScopes, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => { if (open) { setName(''); setScopes([]); setValidationError(null) } }, [open])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const scopeError = validateApiKeyScopes(scopes, scopeEntries)
    if (scopeError) { setValidationError(scopeError); return }
    setValidationError(null)
    // 直接从表单读取日期，避免选择权限触发重渲染时丢失浏览器日期输入。
    const localExpiry = new FormData(event.currentTarget).get('expiresAt')
    const expiresAt = typeof localExpiry === 'string' && localExpiry ? new Date(localExpiry).toISOString() : null
    try {
      await onSubmit({ name: name.trim(), scopes, expiresAt })
    } catch {
      // 签发错误由页面 mutation 状态传回弹窗；在事件边界处理拒绝，避免未处理的 Promise。
    }
  }

  return <Modal open={open} title="签发 API Key" description="API Key 只返回一次明文。请在签发成功后立即保存，页面不会再次显示完整密钥。" onClose={pending ? () => undefined : onClose} footer={<><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="api-key-form" disabled={pending}>{pending ? '签发中…' : '签发密钥'}</Button></>}>
    <form id="api-key-form" className="admin-form" onSubmit={submit}>
      <div className="admin-form-grid"><label><span>密钥名称 *</span><input value={name} onChange={(event) => setName(event.target.value)} required disabled={pending} placeholder="例如 deploy-bot" /></label><label><span>到期时间</span><input type="datetime-local" name="expiresAt" defaultValue="" disabled={pending} /></label></div>
      <ApiKeyScopePicker entries={scopeEntries} loading={scopeLoading} error={scopeError} validationError={validationError} onRetry={onRetryScopes} selected={scopes} disabled={pending} onChange={(next) => { setValidationError(null); setScopes(next) }} />
      <ActionError title="API Key 签发失败" error={error} />
    </form>
  </Modal>
}
