import { useEffect, useState } from 'react'
import { ActionError, Button, Modal } from '../../shared/ui'
import type { NativeRole, NativeRoleWriteInput } from '../../shared/api/schemas'
import { ApiKeyScopePicker, type PermissionCatalogEntry } from '../api-keys/apiKeyScopes'

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  role: NativeRole | null
  pending: boolean
  error: unknown
  permissionsError: unknown
  permissionEntries: PermissionCatalogEntry[]
  permissionsLoading: boolean
  permissionsErrorState: unknown
  onRetryPermissions: () => void
  onClose: () => void
  onSubmit: (input: NativeRoleWriteInput, permissions: string[]) => Promise<void>
}

type FormValues = { code: string; name: string; enabled: boolean }
const emptyValues: FormValues = { code: '', name: '', enabled: true }

export function RoleFormModal({ open, mode, role, pending, error, permissionsError, permissionEntries, permissionsLoading, permissionsErrorState, onRetryPermissions, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [permissions, setPermissions] = useState<string[]>([])
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setValidationError(null)
    setValues(role ? { code: role.code, name: role.name, enabled: role.enabled } : emptyValues)
    setPermissions(role?.permissions ?? [])
  }, [open, role])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values.name.trim()) return setValidationError('角色名称不能为空')
    if (mode === 'create' && !values.code.trim()) return setValidationError('角色标识不能为空')
    void onSubmit({ code: values.code.trim() || undefined, name: values.name.trim(), enabled: values.enabled }, permissions)
  }

  return (
    <Modal open={open} title={mode === 'create' ? '新增角色' : '编辑角色'} description="角色名称、启用状态和权限目录由系统 API 保存。权限保存需要当前会话完成 MFA 二次验证。" onClose={pending ? () => undefined : onClose} footer={(
      <><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="role-form" disabled={pending}>{pending ? '保存中…' : '保存角色'}</Button></>
    )}>
      <form id="role-form" className="admin-form" onSubmit={submit}>
        <div className="admin-form-grid">
          <label><span>角色标识{mode === 'create' ? ' *' : ''}</span><input value={values.code} onChange={(event) => setValues((current) => ({ ...current, code: event.target.value }))} disabled={mode === 'edit' || pending} placeholder="例如 auditor" autoComplete="off" /></label>
          <label><span>角色名称 *</span><input value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} disabled={pending} autoComplete="off" /></label>
        </div>
        <div className="admin-form-readonly"><span>当前数据范围</span><strong>{role?.dataScope ?? '由后端策略确定'}</strong><small>{role?.deptScope ?? '保存后按授权策略计算组织范围'}</small></div>
        <label className="checkbox-label"><input type="checkbox" checked={values.enabled} onChange={(event) => setValues((current) => ({ ...current, enabled: event.target.checked }))} disabled={pending} /><span>角色启用</span></label>
        <ApiKeyScopePicker
          entries={permissionEntries}
          selected={permissions}
          loading={permissionsLoading}
          error={permissionsErrorState}
          onRetry={onRetryPermissions}
          disabled={pending}
          legend="角色权限"
          errorTitle="角色权限目录读取失败"
          helperText="权限目录由系统 API 动态提供；保存时会校验当前账号可管理的权限。"
          onChange={setPermissions}
        />
        {validationError ? <div className="modal-form-error" role="alert">{validationError}</div> : null}
        <ActionError title="角色保存失败" error={error} />
        <ActionError title="角色权限保存失败" error={permissionsError} />
      </form>
    </Modal>
  )
}
