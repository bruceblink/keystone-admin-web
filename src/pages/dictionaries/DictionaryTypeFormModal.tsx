import { useEffect, useState } from 'react'
import { Button, Modal } from '../../shared/ui'
import type { NativeDictionaryType, NativeDictionaryTypeWriteInput } from '../../shared/api/schemas'

type Props = { open: boolean; mode: 'create' | 'edit'; typeItem: NativeDictionaryType | null; pending: boolean; error: string | null; onClose: () => void; onSubmit: (input: NativeDictionaryTypeWriteInput) => Promise<void> }

export function DictionaryTypeFormModal({ open, mode, typeItem, pending, error, onClose, onSubmit }: Props) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCode(typeItem?.code ?? '')
    setName(typeItem?.name ?? '')
    setEnabled(typeItem?.enabled ?? true)
    setValidationError(null)
  }, [open, typeItem])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return setValidationError('字典类型名称不能为空')
    if (mode === 'create' && !code.trim()) return setValidationError('字典类型编码不能为空')
    void onSubmit({ code: code.trim() || undefined, name: name.trim(), enabled })
  }

  return <Modal open={open} title={mode === 'create' ? '新增字典类型' : '编辑字典类型'} description="字典类型用于组织业务状态值。" onClose={pending ? () => undefined : onClose} footer={<><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="dictionary-type-form" disabled={pending}>{pending ? '保存中…' : '保存类型'}</Button></>}>
    <form id="dictionary-type-form" className="admin-form" onSubmit={submit}><div className="admin-form-grid"><label><span>类型编码{mode === 'create' ? ' *' : ''}</span><input value={code} onChange={(event) => setCode(event.target.value)} disabled={mode === 'edit' || pending} autoComplete="off" /></label><label><span>类型名称 *</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={pending} autoComplete="off" /></label></div><label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={pending} /><span>类型启用</span></label>{validationError || error ? <div className="modal-form-error" role="alert">{validationError ?? error}</div> : null}</form>
  </Modal>
}
