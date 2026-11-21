import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { useSessionStore } from '../state/session'
import { MfaStepUpModal } from './MfaStepUpModal'
import { useMfaStepUp } from './useMfaStepUp'

function MfaProbe({ operation }: { operation: () => Promise<unknown> }) {
  const stepUp = useMfaStepUp()
  return <><button type="button" onClick={() => { void stepUp.run(operation).catch(() => undefined) }}>开始操作</button><MfaStepUpModal {...stepUp.modal} /></>
}

function pendingResult<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function setSession(sessionRevision = 4) {
  useSessionStore.setState({
    user: { id: 'user-1', username: 'mfa-admin', displayName: '管理员', role: 'admin' },
    isHydrated: true,
    authRevision: 1,
    sessionRevision,
  })
}

function requireMfaError() {
  return new ApiError('需要 MFA 二次验证', 403, 'mfa_step_up_required')
}

afterEach(() => {
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, authRevision: 0, sessionRevision: 0, pendingActionNotice: null })
})

describe('MFA 操作与权限撤销', () => {
  // 已发出的初始写请求无法撤回；页面卸载后必须等待服务端真实结果。
  it('初始写请求等待中撤权时不误报取消，并显示真实成功结果', async () => {
    setSession()
    const write = pendingResult<string>()
    const operation = vi.fn(() => write.promise)
    const view = render(<MfaProbe operation={operation} />)

    fireEvent.click(screen.getByRole('button', { name: '开始操作' }))
    await waitFor(() => expect(operation).toHaveBeenCalledOnce())
    view.unmount()
    expect(useSessionStore.getState().pendingActionNotice).toBeNull()

    await act(async () => write.resolve('已保存'))
    expect(useSessionStore.getState().pendingActionNotice?.message).toContain('原操作已完成')
  })

  // 初始写请求可能已到服务端；MFA 响应到达时必须说明写入没有继续。
  it('初始写请求撤权后返回 MFA 要求时明确说明未继续写入', async () => {
    setSession()
    const write = pendingResult<string>()
    const operation = vi.fn(() => write.promise)
    const begin = vi.spyOn(apiClient, 'beginMfaStepUp')
    const view = render(<MfaProbe operation={operation} />)

    fireEvent.click(screen.getByRole('button', { name: '开始操作' }))
    await waitFor(() => expect(operation).toHaveBeenCalledOnce())
    view.unmount()
    await act(async () => write.reject(requireMfaError()))

    expect(begin).not.toHaveBeenCalled()
    expect(useSessionStore.getState().pendingActionNotice?.message).toContain('写入未继续')
  })

  // 同名重新登录属于新会话，旧请求结果不得写入新会话提示。
  it('同名用户重新登录后丢弃旧会话的迟到结果提示', async () => {
    setSession(4)
    const write = pendingResult<string>()
    const operation = vi.fn(() => write.promise)
    const view = render(<MfaProbe operation={operation} />)

    fireEvent.click(screen.getByRole('button', { name: '开始操作' }))
    await waitFor(() => expect(operation).toHaveBeenCalledOnce())
    view.unmount()
    act(() => useSessionStore.setState({ sessionRevision: 5 }))
    await act(async () => write.resolve('旧会话结果'))

    expect(useSessionStore.getState().pendingActionNotice).toBeNull()
  })

  // 验证尚未返回时撤权会结束等待，并阻止后续再次提交原写请求。
  it('验证码校验等待中撤权时结束等待且不重放写请求', async () => {
    setSession()
    const verification = pendingResult<{ accessToken: string; expiresIn: number; authenticationLevel: 'AAL2'; amr: 'otp' | 'recovery' }>()
    const operation = vi.fn().mockRejectedValueOnce(requireMfaError())
    vi.spyOn(apiClient, 'beginMfaStepUp').mockResolvedValue({ challengeId: 'challenge-1', clientId: 'web', expiresAt: '2030-01-01T00:00:00Z' })
    const verify = vi.spyOn(apiClient, 'verifyMfaStepUp').mockReturnValue(verification.promise)
    const view = render(<MfaProbe operation={operation} />)

    fireEvent.click(screen.getByRole('button', { name: '开始操作' }))
    fireEvent.change(await screen.findByLabelText('验证码或恢复码 *'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))
    await waitFor(() => expect(verify).toHaveBeenCalledOnce())
    view.unmount()
    await act(async () => verification.resolve({ accessToken: 'aal2', expiresIn: 300, authenticationLevel: 'AAL2', amr: 'otp' }))

    expect(operation).toHaveBeenCalledOnce()
    expect(useSessionStore.getState().pendingActionNotice?.message).toContain('权限已变化')
  })

  // MFA 已完成且第二次写请求已发出时，撤权后仍需等待写入的真实结果。
  it('MFA 后写请求等待中撤权时显示真实写入结果', async () => {
    setSession()
    const write = pendingResult<string>()
    const operation = vi.fn().mockRejectedValueOnce(requireMfaError()).mockImplementationOnce(() => write.promise)
    vi.spyOn(apiClient, 'beginMfaStepUp').mockResolvedValue({ challengeId: 'challenge-1', clientId: 'web', expiresAt: '2030-01-01T00:00:00Z' })
    vi.spyOn(apiClient, 'verifyMfaStepUp').mockResolvedValue({ accessToken: 'aal2', expiresIn: 300, authenticationLevel: 'AAL2', amr: 'otp' })
    const view = render(<MfaProbe operation={operation} />)

    fireEvent.click(screen.getByRole('button', { name: '开始操作' }))
    fireEvent.change(await screen.findByLabelText('验证码或恢复码 *'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))
    await waitFor(() => expect(operation).toHaveBeenCalledTimes(2))
    view.unmount()
    expect(useSessionStore.getState().pendingActionNotice).toBeNull()
    await act(async () => write.resolve('已保存'))

    expect(useSessionStore.getState().pendingActionNotice?.message).toContain('原操作已完成')
  })
})
