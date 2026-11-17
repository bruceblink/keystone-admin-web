import { FormEvent, useEffect, useState } from 'react'
import { Activity, ArrowRight, KeyRound, LockKeyhole, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError, formatApiError, isActiveSessionConflict } from '../../shared/api/errors'
import { apiClient, getMfaLoginChallenge } from '../../shared/api/client'
import type { NativeMfaLoginChallenge } from '../../shared/api/schemas'
import { useSessionStore } from '../../shared/state/session'
import { Button, Card, Modal, Spinner } from '../../shared/ui'

function isInitialPasswordChangeRequired(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'precondition_required' || error.status === 428)
}

export function LoginPage() {
  const navigate = useNavigate()
  const login = useSessionStore((state) => state.login)
  const user = useSessionStore((state) => state.user)
  const isHydrated = useSessionStore((state) => state.isHydrated)
  const verifyMfaLogin = useSessionStore((state) => state.verifyMfaLogin)
  const sessionMessage = useSessionStore((state) => state.message)
  const [username, setUsername] = useState('operator')
  const [password, setPassword] = useState('keystone')
  const [error, setError] = useState<string | null>(null)
  const [initialPasswordRequired, setInitialPasswordRequired] = useState(false)
  const [initialCurrentPassword, setInitialCurrentPassword] = useState('')
  const [initialNewPassword, setInitialNewPassword] = useState('')
  const [initialConfirmPassword, setInitialConfirmPassword] = useState('')
  const [initialPasswordError, setInitialPasswordError] = useState<string | null>(null)
  const [initialPasswordSubmitting, setInitialPasswordSubmitting] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mfaChallenge, setMfaChallenge] = useState<NativeMfaLoginChallenge | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [mfaForceLogin, setMfaForceLogin] = useState(false)
  const [forceLoginOpen, setForceLoginOpen] = useState(false)
  const [forceLoginMode, setForceLoginMode] = useState<'password' | 'mfa' | null>(null)
  const [isMfaSubmitting, setIsMfaSubmitting] = useState(false)

  useEffect(() => {
    if (isHydrated && user) navigate('/monitor', { replace: true })
  }, [isHydrated, navigate, user])

  async function submitLogin(forceLogin: boolean) {
    setError(null)
    setPasswordChanged(false)
    setMfaError(null)
    setIsSubmitting(true)
    try {
      await login(username.trim(), password, forceLogin)
      setForceLoginOpen(false)
      setForceLoginMode(null)
      navigate('/monitor', { replace: true })
    } catch (submitError) {
      const challenge = getMfaLoginChallenge(submitError)
      if (challenge) {
        setForceLoginOpen(false)
        setForceLoginMode(null)
        setMfaChallenge(challenge)
        setMfaForceLogin(forceLogin)
        setMfaCode('')
      } else if (isActiveSessionConflict(submitError)) {
        setForceLoginOpen(true)
        setForceLoginMode('password')
      } else if (isInitialPasswordChangeRequired(submitError)) {
        // 初始密码不进入浏览器自动填充状态；改密表单要求用户重新输入当前密码。
        setPassword('')
        setInitialPasswordRequired(true)
        setInitialCurrentPassword('')
        setInitialNewPassword('')
        setInitialConfirmPassword('')
        setInitialPasswordError(null)
        setPasswordChanged(false)
      } else {
        setError(formatApiError(submitError, '登录失败，请稍后重试'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await submitLogin(false)
  }

  async function handleForceLogin() {
    if (forceLoginMode === 'mfa') {
      await handleForceMfaLogin()
      return
    }
    await submitLogin(true)
  }

  async function handleForceMfaLogin() {
    if (!mfaChallenge || !mfaCode.trim()) return
    setMfaError(null)
    setIsMfaSubmitting(true)
    try {
      await verifyMfaLogin(username.trim(), mfaChallenge.challengeId, mfaChallenge.clientId, mfaCode.trim(), true)
      setForceLoginOpen(false)
      setForceLoginMode(null)
      navigate('/monitor', { replace: true })
    } catch (submitError) {
      setMfaError(formatApiError(submitError, '二次认证失败，请重试'))
    } finally {
      setIsMfaSubmitting(false)
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!mfaChallenge || !mfaCode.trim()) return
    setMfaError(null)
    setIsMfaSubmitting(true)
    try {
      await verifyMfaLogin(username.trim(), mfaChallenge.challengeId, mfaChallenge.clientId, mfaCode.trim(), mfaForceLogin)
      navigate('/monitor', { replace: true })
    } catch (submitError) {
      if (isActiveSessionConflict(submitError)) {
        setForceLoginMode('mfa')
        setForceLoginOpen(true)
      } else {
        setMfaError(formatApiError(submitError, '二次认证失败，请重试'))
      }
    } finally {
      setIsMfaSubmitting(false)
    }
  }

  async function handleInitialPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInitialPasswordError(null)

    if (initialNewPassword !== initialConfirmPassword) {
      setInitialPasswordError('两次输入的新密码不一致。')
      return
    }

    if (initialNewPassword === initialCurrentPassword) {
      setInitialPasswordError('新密码必须与当前密码不同。')
      return
    }

    setInitialPasswordSubmitting(true)
    try {
      const result = await apiClient.changeInitialPassword(username.trim(), initialCurrentPassword, initialNewPassword)
      if (!result.updated) {
        setInitialPasswordError('密码没有更新，请检查当前密码和账号状态后重试。')
        return
      }
      setInitialPasswordRequired(false)
      setInitialCurrentPassword('')
      setInitialNewPassword('')
      setInitialConfirmPassword('')
      setPassword('')
      setPasswordChanged(true)
    } catch (submitError) {
      setInitialPasswordError(formatApiError(submitError, '修改初始密码失败，请检查输入后重试'))
    } finally {
      setInitialPasswordSubmitting(false)
    }
  }

  function cancelInitialPasswordChange() {
    setInitialPasswordRequired(false)
    setInitialCurrentPassword('')
    setInitialNewPassword('')
    setInitialConfirmPassword('')
    setInitialPasswordError(null)
    setPasswordChanged(false)
    setPassword('')
  }

  function restartLogin() {
    setMfaChallenge(null)
    setMfaForceLogin(false)
    setMfaCode('')
    setMfaError(null)
    setForceLoginOpen(false)
    setForceLoginMode(null)
  }

  function cancelForceLogin() {
    setForceLoginOpen(false)
    setForceLoginMode(null)
  }

  const forceLoginPending = forceLoginMode === 'mfa' ? isMfaSubmitting : isSubmitting

  if (!isHydrated || user) return <main className="login-page"><div className="page-center"><Spinner label={user ? '正在进入管理台' : '正在恢复会话'} /></div></main>

  return (
    <main className={initialPasswordRequired ? 'login-page login-page-initial-password' : 'login-page'}>
      <div className="login-glow login-glow-one" aria-hidden="true" />
      <div className="login-glow login-glow-two" aria-hidden="true" />
      <div className="login-layout">
        <section className="login-intro">
          <div className="brand-mark"><Activity size={19} strokeWidth={2.5} /></div>
          <p className="eyebrow">KEYSTONE / ADMIN</p>
          <h1>把平台状态，<span>放在一个清晰的工作台。</span></h1>
          <p className="login-lede">从登录、授权到运行监控，管理前端只保留完成运维判断所需的证据。</p>
          <div className="login-signals">
            <div><strong>30s</strong><span>健康快照刷新</span></div>
            <div><strong>99.9%</strong><span>系统 API 可用目标</span></div>
          </div>
        </section>
        <Card className={initialPasswordRequired ? 'login-card login-card-initial-password' : 'login-card'}>
          <div className="login-card-header">
            <div className="brand-mark brand-mark-small"><Activity size={16} /></div>
            <div><p className="eyebrow">安全登录</p><h2>{initialPasswordRequired ? '设置新密码' : '进入管理台'}</h2></div>
          </div>
          {initialPasswordRequired ? (
            <form onSubmit={handleInitialPasswordSubmit} className="login-form initial-password-form">
              <p className="form-status" role="status">该账号需要先更换初始密码，完成后请使用新密码登录。</p>
              <p className="form-status">账号：{username.trim()}</p>
              <label htmlFor="initial-current-password">当前密码</label>
              <div className="input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input id="initial-current-password" type="password" value={initialCurrentPassword} onChange={(event) => setInitialCurrentPassword(event.target.value)} autoComplete="current-password" required autoFocus /></div>
              <label htmlFor="initial-new-password">新密码</label>
              <div className="input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input id="initial-new-password" type="password" value={initialNewPassword} onChange={(event) => setInitialNewPassword(event.target.value)} autoComplete="new-password" required /></div>
              <label htmlFor="initial-confirm-password">确认新密码</label>
              <div className="input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input id="initial-confirm-password" type="password" value={initialConfirmPassword} onChange={(event) => setInitialConfirmPassword(event.target.value)} autoComplete="new-password" required /></div>
              <p className="login-footnote">新密码需满足当前系统的安全策略。</p>
              {initialPasswordError ? <p className="form-error" role="alert">{initialPasswordError}</p> : null}
              <Button type="submit" disabled={initialPasswordSubmitting} className="login-submit">
                {initialPasswordSubmitting ? <Spinner label="正在更新" /> : <><span>更新密码</span><ArrowRight size={17} /></>}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={cancelInitialPasswordChange} disabled={initialPasswordSubmitting}>取消并返回登录</Button>
            </form>
          ) : mfaChallenge ? (
            <form onSubmit={handleMfaSubmit} className="login-form">
              <p className="form-status" role="status">账号密码已验证，请输入认证器中的一次性验证码。</p>
              <label htmlFor="mfa-code">一次性验证码</label>
              <div className="input-wrap"><KeyRound size={17} aria-hidden="true" /><input id="mfa-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus required /></div>
              {mfaError ? <p className="form-error" role="alert">{mfaError}</p> : null}
              <Button type="submit" disabled={isMfaSubmitting} className="login-submit">
                {isMfaSubmitting ? <Spinner label="正在验证" /> : <><span>验证并登录</span><ArrowRight size={17} /></>}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={restartLogin} disabled={isMfaSubmitting}>返回账号密码</Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
              <label htmlFor="username">用户名</label>
              <div className="input-wrap"><UserRound size={17} aria-hidden="true" /><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></div>
              <label htmlFor="password">密码</label>
              <div className="input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              {passwordChanged ? <p className="form-status" role="status">密码已更新，请使用新密码登录。</p> : null}
              {sessionMessage ? <p className="form-status" role="status">{sessionMessage}</p> : null}
              <Button type="submit" disabled={isSubmitting} className="login-submit">
                {isSubmitting ? <Spinner label="正在验证" /> : <><span>登录</span><ArrowRight size={17} /></>}
              </Button>
            </form>
          )}
          <p className="login-footnote"><KeyRound size={14} /> 访问令牌只保存在当前页面内存，页面刷新后需要重新登录。</p>
        </Card>
        <Modal open={forceLoginOpen} title="账号已有活动会话" description="该账号已经在其他位置登录。你可以取消本次登录，或强制接管已有会话。" onClose={cancelForceLogin} footer={<><Button type="button" variant="ghost" onClick={cancelForceLogin} disabled={forceLoginPending}>取消登录</Button><Button type="button" onClick={() => void handleForceLogin()} disabled={forceLoginPending}>{forceLoginPending ? '接管中…' : '强制登录'}</Button></>}>
          <p className="login-session-warning" role="status">强制登录会使该账号的其他活动会话失效。</p>
        </Modal>
      </div>
    </main>
  )
}
