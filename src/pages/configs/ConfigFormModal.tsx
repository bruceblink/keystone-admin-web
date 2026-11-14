import { useEffect, useState } from 'react'
import { Button, Modal } from '../../shared/ui'
import type { NativeSystemConfig, NativeSystemConfigWriteInput } from '../../shared/api/schemas'

type Props = { open: boolean; mode: 'create' | 'edit'; config: NativeSystemConfig | null; pending: boolean; error: string | null; onClose: () => void; onSubmit: (input: NativeSystemConfigWriteInput) => Promise<void> }

export function ConfigFormModal({ open, mode, config, pending, error, onClose, onSubmit }: Props) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setKey(config?.key ?? '')
    setValue(config?.value ?? '')
    setDescription(config?.description ?? '')
    setEnabled(config?.enabled ?? true)
    setValidationError(null)
  }, [config, open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!key.trim()) return setValidationError('配置键不能为空')
    if (!value.trim()) return setValidationError('配置值不能为空')
    void onSubmit({ key: key.trim(), value, description: description.trim() || null, enabled })
  }

  return <Modal open={open} title={mode === 'create' ? '新增系统配置' : '编辑系统配置'} description="配置变更会写入 Native API，并记录操作审计。" onClose={pending ? () => undefined : onClose} footer={<><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="config-form" disabled={pending}>{pending ? '保存中…' : '保存配置'}</Button></>}>
    <form id="config-form" className="admin-form" onSubmit={submit}>
      <div className="admin-form-grid"><label><span>配置键 *</span><input value={key} onChange={(event) => setKey(event.target.value)} disabled={mode === 'edit' || pending} placeholder="例如 security.session.ttl" autoComplete="off" /></label><label><span>配置值 *</span><input value={value} onChange={(event) => setValue(event.target.value)} disabled={pending} autoComplete="off" /></label></div>
      <label><span>说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={pending} rows={3} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={pending} /><span>配置启用</span></label>
      {validationError || error ? <div className="modal-form-error" role="alert">{validationError ?? error}</div> : null}
    </form>
  </Modal>
}
