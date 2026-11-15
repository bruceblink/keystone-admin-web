import { RefreshCw, ShieldAlert } from 'lucide-react'
import { errorDiagnostic, formatApiError } from '../api/errors'
import { Button } from './Button'

type Props = {
  title: string
  message: string
  error?: unknown
  onRetry: () => void
  retrying?: boolean
}

/** 初次读取失败反馈；统一显示安全提示、错误码诊断和重试入口。 */
export function InitialQueryError({ title, message, error, onRetry, retrying = false }: Props) {
  const diagnostic = errorDiagnostic(error)
  const safeMessage = formatApiError(error, message)

  return (
    <div className="error-panel initial-query-error" role="alert">
      <ShieldAlert size={19} />
      <div>
        <strong>{title}</strong>
        <p>{safeMessage}</p>
        {diagnostic ? <small className="error-diagnostic">诊断：{diagnostic}</small> : null}
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
        <RefreshCw size={14} className={retrying ? 'spin' : undefined} />
        {retrying ? '重试中…' : '重试'}
      </Button>
    </div>
  )
}
