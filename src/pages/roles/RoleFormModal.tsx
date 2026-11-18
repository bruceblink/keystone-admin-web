import { useEffect, useState } from 'react'
import { ActionError, Button, Modal } from '../../shared/ui'
import type { NativeRole, NativeRoleWriteInput } from '../../shared/api/schemas'
import { ApiKeyScopePicker, type PermissionCatalogEntry } from '../api-keys/apiKeyScopes'

export type RoleFormSubmission =
  | { kind: 'role'; input: NativeRoleWriteInput; permissions?: string[] }
  | { kind: 'permissions'; permissions: string[] }

type Props = {
  open: boolean
  mode: 'create' | 'edit' | 'permissions'
  role: NativeRole | null
  pending: boolean
  canSaveMetadata: boolean
  canManagePermissions: boolean
  partialSaveNotice: string | null
  error: unknown
  permissionsError: unknown
  permissionEntries: PermissionCatalogEntry[]
  permissionsLoading: boolean
  permissionsErrorState: unknown
  onRetryPermissions: () => void
  onClose: () => void
  onSubmit: (submission: RoleFormSubmission) => Promise<void>
}

type FormValues = { code: string; name: string; enabled: boolean }
const emptyValues: FormValues = { code: '', name: '', enabled: true }

export function RoleFormModal({ open, mode, role, pending, canSaveMetadata, canManagePermissions, partialSaveNotice, error, permissionsError, permissionEntries, permissionsLoading, permissionsErrorState, onRetryPermissions, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [permissions, setPermissions] = useState<string[]>([])
  const [validationError, setValidationError] = useState<string | null>(null)
  const permissionsBlocked = canManagePermissions && (permissionsLoading || Boolean(permissionsErrorState))
  const saveBlocked = pending || (mode === 'permissions' ? !canManagePermissions : !canSaveMetadata) || permissionsBlocked
  const title = mode === 'create' ? '新增角色' : mode === 'permissions' ? '编辑角色权限' : '编辑角色'
  const description = mode === 'permissions'
    ? '仅修改角色权限，不更改角色资料。保存需要当前会话完成 MFA 二次验证。'
    : '维护角色资料和授权。权限变更需要当前会话完成 MFA 二次验证。'

  useEffect(() => {
    if (!open) return
    setValidationError(null)
    setValues(role ? { code: role.code, name: role.name, enabled: role.enabled } : emptyValues)
    setPermissions(role?.permissions ?? [])
  }, [open, role])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || permissionsBlocked) return
    if (mode === 'permissions') {
      // 权限专用模式只提交权限，避免重试已成功的角色资料写入。
      if (!canManagePermissions) return
      void onSubmit({ kind: 'permissions', permissions })
      return
    }
    if (!canSaveMetadata) return
    if (!values.name.trim()) return setValidationError('角色名称不能为空')
    if (mode === 'create' && !values.code.trim()) return setValidationError('角色标识不能为空')
    // 角色资料权限与权限管理权限分开判断；无 role:manage 时不提交权限字段。
    void onSubmit({
      kind: 'role',
      input: { code: values.code.trim() || undefined, name: values.name.trim(), enabled: values.enabled },
      permissions: canManagePermissions ? permissions : undefined,
    })
  }

  return (
    <Modal open={open} title={title} description={description} onClose={pending ? () => undefined : onClose} footer={(
      <><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="role-form" disabled={saveBlocked}>{pending ? '保存中…' : mode === 'permissions' ? '保存权限' : '保存角色'}</Button></>
    )}>
      <form id="role-form" className="admin-form" onSubmit={submit}>
        {partialSaveNotice ? <p className="form-help" role="status">{partialSaveNotice}</p> : null}
        {mode !== 'permissions' ? <>
          <div className="admin-form-grid">
            <label><span>角色标识{mode === 'create' ? ' *' : ''}</span><input value={values.code} onChange={(event) => setValues((current) => ({ ...current, code: event.target.value }))} disabled={mode === 'edit' || pending || !canSaveMetadata} placeholder="例如 auditor" autoComplete="off" /></label>
            <label><span>角色名称 *</span><input value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} disabled={pending || !canSaveMetadata} autoComplete="off" /></label>
          </div>
          <div className="admin-form-readonly"><span>当前数据范围</span><strong>{role?.dataScope ?? '由后端策略确定'}</strong><small>{role?.deptScope ?? '保存后按授权策略计算组织范围'}</small></div>
          <label className="checkbox-label"><input type="checkbox" checked={values.enabled} onChange={(event) => setValues((current) => ({ ...current, enabled: event.target.checked }))} disabled={pending || !canSaveMetadata} /><span>角色启用</span></label>
        </> : null}
        {canManagePermissions ? <ApiKeyScopePicker
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
        /> : mode === 'permissions' ? <p className="form-help" role="alert">当前账号已失去角色权限管理权限，请关闭窗口后重试。</p> : <p className="form-help" role="status">当前账号无法管理角色权限；{mode === 'create' ? '保存只创建角色资料，不会分配额外权限。' : '保存只更新角色资料，现有权限保持不变。'}</p>}
        {!canSaveMetadata && mode !== 'permissions' ? <p className="form-help" role="alert">当前账号已失去角色资料写权限，请关闭窗口后重试。</p> : null}
        {validationError ? <div className="modal-form-error" role="alert">{validationError}</div> : null}
        <ActionError title="角色保存失败" error={error} />
        <ActionError title="角色权限保存失败" error={permissionsError} />
      </form>
    </Modal>
  )
}
