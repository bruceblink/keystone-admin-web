import { useEffect, useState } from 'react'
import { Button, Modal } from '../../shared/ui'

type Props = { open: boolean; pending: boolean; error: string | null; onClose: () => void; onSubmit: (input: { name: string; scopes: string[]; expiresAt?: string | null }) => Promise<void> }

/** API Key 签发模态框；明文只在成功响应的内存提示中展示一次。 */
export function ApiKeyIssueModal({ open, pending, error, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  useEffect(() => { if (open) { setName(''); setScopes(''); setExpiresAt('') } }, [open])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit({ name: name.trim(), scopes: scopes.split(',').map((scope) => scope.trim()).filter(Boolean), expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null })
  }

  return <Modal open={open} title="签发 API Key" description="API Key 只返回一次明文。请在签发成功后立即保存，页面不会再次显示完整密钥。" onClose={pending ? () => undefined : onClose} footer={<><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="api-key-form" disabled={pending}>{pending ? '签发中…' : '签发密钥'}</Button></>}>
    <form id="api-key-form" className="admin-form" onSubmit={submit}>
      <div className="admin-form-grid"><label><span>密钥名称 *</span><input value={name} onChange={(event) => setName(event.target.value)} required disabled={pending} placeholder="例如 deploy-bot" /></label><label><span>到期时间</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={pending} /></label></div>
      <label><span>授权范围 *</span><input value={scopes} onChange={(event) => setScopes(event.target.value)} required disabled={pending} placeholder="用逗号分隔，例如 user:read,role:read" /></label>
      {error ? <div className="modal-form-error" role="alert">{error}</div> : null}
    </form>
  </Modal>
}
