import { useEffect, useState } from 'react'
import { ActionError, Button, Modal } from '../../shared/ui'
import type { NativeNotice, NativeNoticeWriteInput } from '../../shared/api/schemas'

type Props = { open: boolean; mode: 'create' | 'edit'; notice: NativeNotice | null; pending: boolean; error: unknown; onClose: () => void; onSubmit: (input: NativeNoticeWriteInput) => Promise<void> }

export function NoticeFormModal({ open, mode, notice, pending, error, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [noticeType, setNoticeType] = useState('announcement')
  const [enabled, setEnabled] = useState(true)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(notice?.title ?? '')
    setContent(notice?.content ?? '')
    setNoticeType(notice?.noticeType ?? 'announcement')
    setEnabled(notice?.enabled ?? true)
    setValidationError(null)
  }, [notice, open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) return setValidationError('公告标题不能为空')
    if (!content.trim()) return setValidationError('公告内容不能为空')
    void onSubmit({ title: title.trim(), content: content.trim(), noticeType: noticeType.trim() || 'announcement', enabled })
  }

  return <Modal open={open} title={mode === 'create' ? '新增通知公告' : '编辑通知公告'} description="公告保存后可在列表中继续发布或取消发布。" onClose={pending ? () => undefined : onClose} size="lg" footer={<><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="notice-form" disabled={pending}>{pending ? '保存中…' : '保存公告'}</Button></>}>
    <form id="notice-form" className="admin-form" onSubmit={submit}><div className="admin-form-grid"><label><span>公告标题 *</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={pending} autoComplete="off" /></label><label><span>公告类型</span><input value={noticeType} onChange={(event) => setNoticeType(event.target.value)} disabled={pending} autoComplete="off" /></label></div><label><span>公告内容 *</span><textarea value={content} onChange={(event) => setContent(event.target.value)} disabled={pending} rows={7} /></label><label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={pending} /><span>公告启用</span></label>{validationError ? <div className="modal-form-error" role="alert">{validationError}</div> : null}<ActionError title="公告保存失败" error={error} /></form>
  </Modal>
}
