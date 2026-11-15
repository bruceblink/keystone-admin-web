import { ShieldAlert } from 'lucide-react'
import { errorDiagnostic, formatApiError } from '../api/errors'

type ActionErrorProps = {
  title: string
  error: unknown
  fallback?: string
  onDismiss?: () => void
  dismissLabel?: string
}

/** 写操作失败反馈；保留业务码和请求标识，便于定位失败原因。 */
export function ActionError({ title, error, fallback = '请求失败，请稍后重试', onDismiss, dismissLabel = '关闭' }: ActionErrorProps) {
  if (!error) return null

  const message = typeof error === 'string' ? error : formatApiError(error, fallback)
  const diagnostic = errorDiagnostic(error)

  return (
    <div className="error-panel action-error" role="alert">
      <ShieldAlert size={19} />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {diagnostic ? <small className="error-diagnostic">诊断：{diagnostic}</small> : null}
      </div>
      {onDismiss ? <button type="button" className="button button-ghost button-sm" onClick={onDismiss}>{dismissLabel}</button> : null}
    </div>
  )
}
