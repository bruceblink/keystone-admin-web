import { RefreshCw, ShieldAlert } from 'lucide-react'
import { Button } from './Button'

type Props = {
  message: string
  onRetry: () => void
  retrying?: boolean
}

/** 已有旧数据时的刷新失败反馈；保留当前内容并提供明确的重试入口。 */
export function StaleQueryError({ message, onRetry, retrying = false }: Props) {
  return (
    <div className="error-panel stale-query-error" role="alert">
      <ShieldAlert size={19} />
      <div><strong>数据刷新失败</strong><p>{message}</p></div>
      <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
        <RefreshCw size={14} className={retrying ? 'spin' : undefined} />
        {retrying ? '重试中…' : '重试'}
      </Button>
    </div>
  )
}
