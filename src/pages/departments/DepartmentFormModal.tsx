import { useEffect, useState } from 'react'
import { ActionError, Button, Modal } from '../../shared/ui'
import type { NativeDepartment, NativeDepartmentWriteInput } from '../../shared/api/schemas'

type Props = { open: boolean; mode: 'create' | 'edit'; department: NativeDepartment | null; departments: NativeDepartment[]; pending: boolean; canSubmit: boolean; error: unknown; onClose: () => void; onSubmit: (input: NativeDepartmentWriteInput) => Promise<void> }
type FormValues = { code: string; name: string; parentId: string; sortOrder: string; enabled: boolean }
const emptyValues: FormValues = { code: '', name: '', parentId: '', sortOrder: '1', enabled: true }

export function DepartmentFormModal({ open, mode, department, departments, pending, canSubmit, error, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [validationError, setValidationError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    setValidationError(null)
    setValues(department ? { code: department.code, name: department.name, parentId: department.parentId ?? '', sortOrder: String(department.sortOrder), enabled: department.enabled } : emptyValues)
  }, [department, open])
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    if (!values.name.trim()) return setValidationError('组织名称不能为空')
    if (mode === 'create' && !values.code.trim()) return setValidationError('组织编码不能为空')
    const sortOrder = Number(values.sortOrder)
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return setValidationError('排序必须是非负整数')
    void onSubmit({ code: values.code.trim(), name: values.name.trim(), parentId: values.parentId || null, sortOrder, enabled: values.enabled })
  }
  const parentOptions = departments.filter((item) => item.id !== department?.id)
  return (
    <Modal open={open} title={mode === 'create' ? '新增组织' : '编辑组织'} description="组织层级和排序由系统 API 保存。" onClose={pending ? () => undefined : onClose} footer={(
      <><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="department-form" disabled={pending || !canSubmit}>{pending ? '保存中…' : '保存组织'}</Button></>
    )}>
      <form id="department-form" className="admin-form" onSubmit={submit}>
        <div className="admin-form-grid">
          <label><span>组织编码{mode === 'create' ? ' *' : ''}</span><input value={values.code} onChange={(event) => setValues((current) => ({ ...current, code: event.target.value }))} disabled={mode === 'edit' || pending || !canSubmit} autoComplete="off" /></label>
          <label><span>组织名称 *</span><input value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} disabled={pending || !canSubmit} autoComplete="off" /></label>
          <label><span>上级组织</span><select value={values.parentId} onChange={(event) => setValues((current) => ({ ...current, parentId: event.target.value }))} disabled={pending || !canSubmit}><option value="">根组织</option>{parentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.code}）</option>)}</select></label>
          <label><span>排序</span><input type="number" min="0" step="1" value={values.sortOrder} onChange={(event) => setValues((current) => ({ ...current, sortOrder: event.target.value }))} disabled={pending || !canSubmit} /></label>
        </div>
        <label className="checkbox-label"><input type="checkbox" checked={values.enabled} onChange={(event) => setValues((current) => ({ ...current, enabled: event.target.checked }))} disabled={pending || !canSubmit} /><span>组织启用</span></label>
        {!canSubmit ? <p className="form-help" role="alert">当前账号已失去此项组织写权限，请关闭窗口后重试。</p> : null}
        {validationError ? <div className="modal-form-error" role="alert">{validationError}</div> : null}
        <ActionError title="组织保存失败" error={error} />
      </form>
    </Modal>
  )
}
