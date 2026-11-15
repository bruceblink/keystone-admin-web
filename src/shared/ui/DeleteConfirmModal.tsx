import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'
import { Modal } from './Modal'
import { ActionError } from './ActionError'

type DeleteConfirmModalProps = {
  open: boolean
  resourceLabel: string
  count: number
  pending: boolean
  error: unknown
  onClose: () => void
  onConfirm: () => void
}

/** 批量删除确认流程；提交期间锁定关闭入口，避免重复提交或误操作。 */
export function DeleteConfirmModal({ open, resourceLabel, count, pending, error, onClose, onConfirm }: DeleteConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={`删除${resourceLabel}`}
      description="请确认本次批量操作的范围。"
      onClose={pending ? () => undefined : onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>取消</Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>{pending ? '删除中…' : `确认删除 ${count} 条`}</Button>
        </>
      )}
    >
      <div className="delete-confirm-panel">
        <div className="delete-confirm-icon"><AlertTriangle size={21} /></div>
        <div>
          <strong>将删除 {count} 条{resourceLabel}记录</strong>
          <p>删除后不可恢复。请确认已选择正确的记录。</p>
        </div>
      </div>
      <ActionError title={`${resourceLabel}删除失败`} error={error} />
    </Modal>
  )
}
