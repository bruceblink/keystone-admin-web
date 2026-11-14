import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { NativeMfaStepUpChallenge } from '../api/schemas'
import { Button, Modal } from '../ui'

type MfaStepUpModalProps = {
  open: boolean
  challenge: NativeMfaStepUpChallenge | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (code: string) => Promise<void>
}

/** 只在当前组件状态中暂存一次性验证码；关闭或提交后立即清除。 */
export function MfaStepUpModal({ open, challenge, pending, error, onClose, onSubmit }: MfaStepUpModalProps) {
  const [code, setCode] = useState('')

  useEffect(() => {
    if (!open) setCode('')
  }, [open])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = code.trim()
    if (!value) return
    setCode('')
    await onSubmit(value)
  }

  return (
    <Modal
      open={open}
      title="需要 MFA 二次验证"
      description="当前操作会修改敏感权限或凭据。请输入当前 MFA 验证码或恢复码。"
      onClose={pending ? () => undefined : onClose}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button>
          <Button type="submit" form="mfa-step-up-form" disabled={pending || !code.trim()}>{pending ? '验证中…' : '验证并继续'}</Button>
        </>
      )}
    >
      <form id="mfa-step-up-form" className="admin-form" onSubmit={submit}>
        <div className="admin-form-readonly">
          <ShieldCheck size={18} aria-hidden="true" />
          <strong>验证绑定当前会话</strong>
          <small>验证码只用于本次操作，不会保存到浏览器或服务器。</small>
          {challenge?.expiresAt ? <small>本次请求有效期至 {formatExpiry(challenge.expiresAt)}。</small> : null}
        </div>
        <label>
          <span>验证码或恢复码 *</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={pending}
            autoFocus
            autoComplete="one-time-code"
            inputMode="text"
            spellCheck={false}
            required
          />
        </label>
        {error ? <div className="modal-form-error" role="alert">{error}</div> : null}
      </form>
    </Modal>
  )
}

function formatExpiry(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
