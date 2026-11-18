import { useEffect, useState } from 'react'
import { ActionError, Button, Modal } from '../../shared/ui'
import type { NativeRole, NativeUser, NativeUserWriteInput } from '../../shared/api/schemas'

type UserFormModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  user: NativeUser | null
  pending: boolean
  error: unknown
  roles: NativeRole[]
  rolesLoading: boolean
  rolesError: unknown
  onRetryRoles: () => void
  onClose: () => void
  onSubmit: (input: NativeUserWriteInput) => Promise<void>
}

type FormValues = {
  username: string
  password: string
  displayName: string
  deptId: string
  postId: string
  email: string
  phoneNumber: string
  remark: string
  roleCodes: string[]
  enabled: boolean
  clearDept: boolean
}

const emptyValues: FormValues = {
  username: '', password: '', displayName: '', deptId: '', postId: '', email: '', phoneNumber: '',
  remark: '', roleCodes: [], enabled: true, clearDept: false,
}

export function UserFormModal({ open, mode, user, pending, error, roles, rolesLoading, rolesError, onRetryRoles, onClose, onSubmit }: UserFormModalProps) {
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [rolesDirty, setRolesDirty] = useState(false)

  useEffect(() => {
    if (!open) return
    setValidationError(null)
    setRolesDirty(false)
    setValues(user ? {
      username: user.username, password: '', displayName: user.displayName, deptId: user.deptId ?? '',
      postId: user.postId ?? '', email: user.email ?? '', phoneNumber: user.phoneNumber ?? '',
      remark: user.remark ?? '', roleCodes: user.roles, enabled: user.enabled, clearDept: false,
    } : emptyValues)
  }, [open, user])

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setValidationError(null)
  }

  function toggleRole(code: string, checked: boolean) {
    setRolesDirty(true)
    setValues((current) => ({
      ...current,
      roleCodes: checked ? [...new Set([...current.roleCodes, code])] : current.roleCodes.filter((item) => item !== code),
    }))
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values.displayName.trim()) return setValidationError('展示名不能为空')
    if (mode === 'create' && !values.username.trim()) return setValidationError('用户名不能为空')
    if (mode === 'create' && !values.password) return setValidationError('初始密码不能为空')
    // 清除部门时提交 null，避免后端优先使用表单中保留的旧部门 UUID。
    const clearDept = mode === 'edit' && values.clearDept
    const input: NativeUserWriteInput = {
      username: values.username.trim() || undefined,
      password: values.password || undefined,
      displayName: values.displayName.trim(),
      deptId: clearDept ? null : values.deptId.trim() || null,
      postId: values.postId.trim() || null,
      email: values.email.trim() || null,
      phoneNumber: values.phoneNumber.trim() || null,
      remark: values.remark.trim() || null,
      enabled: values.enabled,
      clearDept,
      roleCodes: mode === 'create' || rolesDirty ? values.roleCodes : null,
    }
    void onSubmit(input)
  }

  // 清除选项会清空并锁定部门输入，取消后才能填写新的部门 UUID。
  return (
    <Modal open={open} title={mode === 'create' ? '新增用户' : '编辑用户'} description="保存前请确认身份信息和组织授权范围。" onClose={pending ? () => undefined : onClose} size="lg" footer={(
      <><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="user-form" disabled={pending || rolesLoading || Boolean(rolesError)}>{pending ? '保存中…' : rolesLoading ? '读取角色中…' : '保存用户'}</Button></>
    )}>
      <form id="user-form" className="user-form" onSubmit={submit}>
        <div className="user-form-grid">
          <label><span>用户名{mode === 'create' ? ' *' : ''}</span><input value={values.username} onChange={(event) => setField('username', event.target.value)} disabled={mode === 'edit' || pending} autoComplete="off" /></label>
          <label><span>初始密码{mode === 'create' ? ' *' : ''}</span><input type="password" value={values.password} onChange={(event) => setField('password', event.target.value)} placeholder={mode === 'edit' ? '留空表示不修改' : '至少 12 位'} disabled={pending} autoComplete="new-password" /></label>
          <label><span>展示名 *</span><input value={values.displayName} onChange={(event) => setField('displayName', event.target.value)} disabled={pending} autoComplete="off" /></label>
          <label><span>部门 UUID</span><input value={values.deptId} onChange={(event) => setField('deptId', event.target.value)} placeholder="可选" disabled={pending || values.clearDept} autoComplete="off" /></label>
          <label><span>岗位 UUID</span><input value={values.postId} onChange={(event) => setField('postId', event.target.value)} placeholder="可选" disabled={pending} autoComplete="off" /></label>
          <label><span>邮箱</span><input type="email" value={values.email} onChange={(event) => setField('email', event.target.value)} disabled={pending} autoComplete="off" /></label>
          <label><span>联系电话</span><input value={values.phoneNumber} onChange={(event) => setField('phoneNumber', event.target.value)} disabled={pending} autoComplete="off" /></label>
        </div>
        <fieldset className="user-role-access" disabled={pending || rolesLoading}>
          <legend>用户角色</legend>
          {rolesLoading ? <p className="form-help">正在读取角色目录…</p> : rolesError ? <div className="user-role-error"><ActionError title="角色目录读取失败" error={rolesError} /><Button type="button" variant="secondary" size="sm" onClick={onRetryRoles}>重试角色目录</Button></div> : roles.length === 0 ? <p className="form-help">暂无可用角色。</p> : <div className="user-role-options">{roles.map((role) => <label className="checkbox-label" key={role.id}><input type="checkbox" checked={values.roleCodes.includes(role.code)} disabled={pending || !role.enabled} onChange={(event) => toggleRole(role.code, event.target.checked)} /><span>{role.name} <small>{role.code}{role.enabled ? '' : '（停用）'}</small></span></label>)}</div>}
          <p className="form-help">角色目录由系统 API 提供。编辑用户时不修改角色会保留原角色；主动取消全部选择会清空角色。</p>
        </fieldset>
        <label className="user-form-wide"><span>备注</span><textarea value={values.remark} onChange={(event) => setField('remark', event.target.value)} rows={3} disabled={pending} /></label>
        <div className="user-form-options"><label className="checkbox-label"><input type="checkbox" checked={values.enabled} onChange={(event) => setField('enabled', event.target.checked)} disabled={pending} /><span>账号启用</span></label>{mode === 'edit' ? <label className="checkbox-label"><input type="checkbox" checked={values.clearDept} onChange={(event) => setValues((current) => ({ ...current, clearDept: event.target.checked, deptId: event.target.checked ? '' : current.deptId }))} disabled={pending} /><span>清除部门归属</span></label> : null}</div>
        {validationError ? <div className="modal-form-error" role="alert">{validationError}</div> : null}
        <ActionError title="用户保存失败" error={error} />
      </form>
    </Modal>
  )
}
