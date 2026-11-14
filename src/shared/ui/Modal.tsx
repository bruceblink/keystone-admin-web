import { useEffect, useId, type PropsWithChildren, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalProps = PropsWithChildren<{
  open: boolean
  title: string
  description?: string
  onClose: () => void
  footer?: ReactNode
  size?: 'md' | 'lg'
}>

/** 通用管理表单模态框；负责遮罩、Escape 关闭和页面滚动锁定。 */
export function Modal({ open, title, description, onClose, footer, size = 'md', children }: ModalProps) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open) return null

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
