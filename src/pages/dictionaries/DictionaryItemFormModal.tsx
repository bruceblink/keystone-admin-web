import { useEffect, useState } from 'react'
import { Button, Modal } from '../../shared/ui'
import type { NativeDictionaryItem, NativeDictionaryItemWriteInput } from '../../shared/api/schemas'

type Props = { open: boolean; mode: 'create' | 'edit'; item: NativeDictionaryItem | null; pending: boolean; error: string | null; onClose: () => void; onSubmit: (input: NativeDictionaryItemWriteInput) => Promise<void> }

export function DictionaryItemFormModal({ open, mode, item, pending, error, onClose, onSubmit }: Props) {
  const [value, setValue] = useState('')
  const [label, setLabel] = useState('')
  const [sortOrder, setSortOrder] = useState('1')
  const [enabled, setEnabled] = useState(true)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setValue(item?.value ?? '')
    setLabel(item?.label ?? '')
    setSortOrder(String(item?.sortOrder ?? 1))
    setEnabled(item?.enabled ?? true)
    setValidationError(null)
  }, [item, open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!label.trim()) return setValidationError('字典条目显示名称不能为空')
    if (mode === 'create' && !value.trim()) return setValidationError('字典条目值不能为空')
    void onSubmit({ value: value.trim() || undefined, label: label.trim(), sortOrder: Number(sortOrder) || 1, enabled })
  }

  return <Modal open={open} title={mode === 'create' ? '新增字典条目' : '编辑字典条目'} description="字典条目属于当前选中的字典类型。" onClose={pending ? () => undefined : onClose} footer={<><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="dictionary-item-form" disabled={pending}>{pending ? '保存中…' : '保存条目'}</Button></>}>
    <form id="dictionary-item-form" className="admin-form" onSubmit={submit}><div className="admin-form-grid"><label><span>条目值{mode === 'create' ? ' *' : ''}</span><input value={value} onChange={(event) => setValue(event.target.value)} disabled={mode === 'edit' || pending} autoComplete="off" /></label><label><span>显示名称 *</span><input value={label} onChange={(event) => setLabel(event.target.value)} disabled={pending} autoComplete="off" /></label><label><span>排序</span><input type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} disabled={pending} /></label></div><label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={pending} /><span>条目启用</span></label>{validationError || error ? <div className="modal-form-error" role="alert">{validationError ?? error}</div> : null}</form>
  </Modal>
}
