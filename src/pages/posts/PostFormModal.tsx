import { useEffect, useState } from 'react'
import { Button, Modal } from '../../shared/ui'
import type { NativePost, NativePostWriteInput } from '../../shared/api/schemas'

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  post: NativePost | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: NativePostWriteInput) => Promise<void>
}

/** 岗位新增和编辑表单；编码在编辑时保持不变，避免破坏已有用户引用。 */
export function PostFormModal({ open, mode, post, pending, error, onClose, onSubmit }: Props) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [enabled, setEnabled] = useState(true)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCode(post?.code ?? '')
    setName(post?.name ?? '')
    setSortOrder(String(post?.sortOrder ?? 0))
    setEnabled(post?.enabled ?? true)
    setValidationError(null)
  }, [open, post])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'create' && !code.trim()) return setValidationError('岗位编码不能为空')
    if (!name.trim()) return setValidationError('岗位名称不能为空')
    const parsedSortOrder = Number(sortOrder)
    if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) return setValidationError('排序必须是大于等于 0 的整数')
    void onSubmit({ code: code.trim() || undefined, name: name.trim(), sortOrder: parsedSortOrder, enabled })
  }

  return (
    <Modal
      open={open}
      title={mode === 'create' ? '新增岗位' : '编辑岗位'}
      description="岗位编码用于业务引用。保存后会记录操作审计。"
      onClose={pending ? () => undefined : onClose}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button>
          <Button type="submit" form="post-form" disabled={pending}>{pending ? '保存中…' : '保存岗位'}</Button>
        </>
      )}
    >
      <form id="post-form" className="admin-form" onSubmit={submit}>
        <div className="admin-form-grid">
          <label>
            <span>岗位编码 {mode === 'create' ? '*' : ''}</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} disabled={mode === 'edit' || pending} placeholder="例如 operator" autoComplete="off" />
          </label>
          <label>
            <span>岗位名称 *</span>
            <input value={name} onChange={(event) => setName(event.target.value)} disabled={pending} placeholder="例如 运营专员" autoComplete="off" />
          </label>
          <label>
            <span>显示排序</span>
            <input type="number" min="0" step="1" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} disabled={pending} />
          </label>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={pending} />
          <span>岗位启用</span>
        </label>
        {validationError || error ? <div className="modal-form-error" role="alert">{validationError ?? error}</div> : null}
      </form>
    </Modal>
  )
}
