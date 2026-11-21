import { useContext, useEffect, useId, type PropsWithChildren, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { CapabilityAvailabilityContext } from '../auth/CapabilityAvailability'

type ModalProps = PropsWithChildren<{
  open: boolean
  title: string
  description?: string
  onClose: () => void
  footer?: ReactNode
  size?: 'md' | 'lg'
}>

const bodyLockTokens = new Set<symbol>()
let bodyOverflowBeforeLock = ''

/** 多层对话框共用页面滚动锁，最后一个对话框关闭时才恢复原样式。 */
function lockBodyScroll(): () => void {
  const token = Symbol('modal-body-lock')
  if (bodyLockTokens.size === 0) bodyOverflowBeforeLock = document.body.style.overflow
  bodyLockTokens.add(token)
  document.body.style.overflow = 'hidden'
  return () => {
    bodyLockTokens.delete(token)
    document.body.style.overflow = bodyLockTokens.size === 0 ? bodyOverflowBeforeLock : 'hidden'
  }
}

/** 通用管理表单模态框；负责遮罩、Escape 关闭和页面滚动锁定。 */
export function Modal({ open, title, description, onClose, footer, size = 'md', children }: ModalProps) {
  const titleId = useId()
  const capabilityAvailable = useContext(CapabilityAvailabilityContext)
  useEffect(() => {
    if (!open || !capabilityAvailable.available) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const unlockBody = lockBodyScroll()
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      unlockBody()
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [capabilityAvailable.available, onClose, open])

  if (!open || !capabilityAvailable.available) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header">
          <div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  )
}
