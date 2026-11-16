import { useEffect, useState } from 'react'
import { LockKeyhole, RefreshCw, Save } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import type { NativeProfile, NativeProfileWriteInput } from '../../shared/api/schemas'
import { useMfaStepUp } from '../../shared/auth/useMfaStepUp'
import { MfaStepUpModal } from '../../shared/auth/MfaStepUpModal'
import { ActionError, InitialQueryError, Badge, Button, Card, CardHeader, Spinner, StaleQueryError } from '../../shared/ui'

const emptyProfile: NativeProfileWriteInput = { displayName: '', email: '', phoneNumber: '', sex: null, avatar: '' }

export function ProfilePage() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => apiClient.getProfile(), staleTime: 10_000 })
  const [form, setForm] = useState<NativeProfileWriteInput>(emptyProfile)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const stepUp = useMfaStepUp()

  useEffect(() => {
    if (!profileQuery.data) return
    setForm(toWriteInput(profileQuery.data))
  }, [profileQuery.data])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    setSaving(true)
    try {
      await apiClient.updateProfile(form)
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      setMessage('个人资料已保存')
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
    }
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!password.trim()) return
    setMessage(null)
    setError(null)
    setPasswordSaving(true)
    try {
      await stepUp.run(() => apiClient.updateProfilePassword(password))
      setPassword('')
      setMessage('密码已更新，请使用新密码重新登录')
    } catch (cause) {
      setError(cause)
    } finally {
      setPasswordSaving(false)
    }
  }

  return <div className="profile-page">
    <div className="page-heading"><div><p className="eyebrow">ACCOUNT / PROFILE</p><h1>个人资料</h1><p className="page-description">维护当前账号资料和登录凭据。</p></div><div className="heading-actions"><Button variant="secondary" size="sm" onClick={() => void profileQuery.refetch()} disabled={profileQuery.isFetching}><RefreshCw size={15} className={profileQuery.isFetching ? 'spin' : ''} /> 刷新资料</Button></div></div>
    {profileQuery.isLoading ? <div className="loading-panel"><Spinner label="正在读取个人资料" /></div> : null}
    {profileQuery.isError && !profileQuery.data ? <InitialQueryError title="无法读取个人资料" message="个人资料读取失败，请重试" error={profileQuery.error} onRetry={() => void profileQuery.refetch()} retrying={profileQuery.isFetching} /> : null}
    {profileQuery.isError && profileQuery.data ? <StaleQueryError message={profileQuery.error instanceof Error ? profileQuery.error.message : '个人资料刷新失败'} error={profileQuery.error} onRetry={() => void profileQuery.refetch()} retrying={profileQuery.isFetching} /> : null}
    {message ? <div className="form-status" role="status">{message}</div> : null}
    <ActionError title="资料操作失败" error={error} onDismiss={() => setError(null)} />
    {profileQuery.data ? <>
      <Card><CardHeader title="基本资料" description="这些字段会保存到当前账号。" action={<Badge tone="info">系统 API</Badge>} /><form className="admin-form" onSubmit={saveProfile}><label><span>用户名</span><input value={profileQuery.data.username} readOnly /></label><label><span>展示名 *</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /></label><label><span>邮箱</span><input type="email" value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label><span>联系电话</span><input value={form.phoneNumber ?? ''} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} /></label><label><span>头像地址</span><input value={form.avatar ?? ''} onChange={(event) => setForm({ ...form, avatar: event.target.value })} /></label><label><span>性别</span><select value={form.sex ?? ''} onChange={(event) => setForm({ ...form, sex: event.target.value === '' ? null : Number(event.target.value) })}><option value="">未知</option><option value="1">男</option><option value="0">女</option></select></label><div className="modal-footer"><Button type="submit" disabled={saving || !form.displayName.trim()}>{saving ? <Spinner label="保存中" /> : <><Save size={15} /> 保存资料</>}</Button></div></form></Card>
      <Card><CardHeader title="修改密码" description="密码更新需要当前会话完成 MFA 二次验证。" /><form className="admin-form" onSubmit={savePassword}><label><span>新密码 *</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label><div className="modal-footer"><Button type="submit" disabled={passwordSaving || !password.trim()}>{passwordSaving ? <Spinner label="更新中" /> : <><LockKeyhole size={15} /> 更新密码</>}</Button></div></form></Card>
    </> : null}
    <MfaStepUpModal {...stepUp.modal} />
  </div>
}

function toWriteInput(profile: NativeProfile): NativeProfileWriteInput {
  return { displayName: profile.displayName, email: profile.email, phoneNumber: profile.phoneNumber, sex: profile.sex, avatar: profile.avatar }
}
