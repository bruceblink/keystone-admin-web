import { FormEvent, useState } from 'react'
import { Activity, ArrowRight, KeyRound, LockKeyhole, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getMfaLoginChallenge } from '../../shared/api/client'
import type { NativeMfaLoginChallenge } from '../../shared/api/schemas'
import { useSessionStore } from '../../shared/state/session'
import { Button, Card, Spinner } from '../../shared/ui'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useSessionStore((state) => state.login)
  const verifyMfaLogin = useSessionStore((state) => state.verifyMfaLogin)
  const [username, setUsername] = useState('operator')
  const [password, setPassword] = useState('keystone')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mfaChallenge, setMfaChallenge] = useState<NativeMfaLoginChallenge | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [isMfaSubmitting, setIsMfaSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMfaError(null)
    setIsSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/monitor', { replace: true })
    } catch (submitError) {
      const challenge = getMfaLoginChallenge(submitError)
      if (challenge) {
        setMfaChallenge(challenge)
        setMfaCode('')
      } else {
        setError(submitError instanceof Error ? submitError.message : '登录失败，请稍后重试')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!mfaChallenge || !mfaCode.trim()) return
    setMfaError(null)
    setIsMfaSubmitting(true)
    try {
      await verifyMfaLogin(username.trim(), mfaChallenge.challengeId, mfaChallenge.clientId, mfaCode.trim())
      navigate('/monitor', { replace: true })
    } catch (submitError) {
      setMfaError(submitError instanceof Error ? submitError.message : '二次认证失败，请重试')
    } finally {
      setIsMfaSubmitting(false)
    }
  }

  function restartLogin() {
    setMfaChallenge(null)
    setMfaCode('')
    setMfaError(null)
  }

  return (
    <main className="login-page">
      <div className="login-glow login-glow-one" aria-hidden="true" />
      <div className="login-glow login-glow-two" aria-hidden="true" />
      <div className="login-layout">
        <section className="login-intro">
          <div className="brand-mark"><Activity size={19} strokeWidth={2.5} /></div>
          <p className="eyebrow">KEYSTONE NATIVE / ADMIN</p>
          <h1>把平台状态，<span>放在一个清晰的工作台。</span></h1>
          <p className="login-lede">从登录、授权到运行监控，管理前端只保留完成运维判断所需的证据。</p>
          <div className="login-signals">
            <div><strong>30s</strong><span>健康快照刷新</span></div>
            <div><strong>99.9%</strong><span>Native API 可用目标</span></div>
          </div>
        </section>
        <Card className="login-card">
          <div className="login-card-header">
            <div className="brand-mark brand-mark-small"><Activity size={16} /></div>
            <div><p className="eyebrow">安全登录</p><h2>进入管理台</h2></div>
          </div>
          {mfaChallenge ? (
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
              <Button type="submit" disabled={isSubmitting} className="login-submit">
                {isSubmitting ? <Spinner label="正在验证" /> : <><span>登录 Native API</span><ArrowRight size={17} /></>}
              </Button>
            </form>
          )}
          <p className="login-footnote"><KeyRound size={14} /> 访问令牌只保存在当前页面内存，页面刷新后需要重新登录。</p>
        </Card>
      </div>
    </main>
  )
}
