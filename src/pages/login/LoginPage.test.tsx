import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { ApiError } from '../../shared/api/errors'
import { useSessionStore } from '../../shared/state/session'

const user = { id: 'user-1', username: 'operator', displayName: 'Operator', role: '管理员' }

afterEach(() => {
  vi.restoreAllMocks()
  useSessionStore.setState({ user: null, isHydrated: false, message: null })
})

function renderPage() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>)
}

describe('LoginPage', () => {
  // 验证活动会话冲突和 MFA 接管标志在页面层保持一致。
  it('活动会话冲突时允许取消或强制接管', async () => {
    const login = vi.fn()
      .mockRejectedValueOnce(new ApiError('活动会话', 409))
      .mockResolvedValueOnce(undefined)
    useSessionStore.setState({ isHydrated: true, login })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /登录/ }))
    const dialog = await screen.findByRole('dialog', { name: '账号已有活动会话' })
    expect(dialog).toHaveTextContent('取消登录')

    fireEvent.click(screen.getByRole('button', { name: '强制登录' }))
    await waitFor(() => expect(login).toHaveBeenNthCalledWith(2, 'operator', 'keystone', true))
    expect(screen.queryByRole('dialog', { name: '账号已有活动会话' })).not.toBeInTheDocument()
  })

  it('强制登录触发 MFA 时继续传递接管标志', async () => {
    const challenge = { challengeId: 'challenge-login', clientId: 'web', expiresAt: '2026-11-15T03:00:00Z' }
    const login = vi.fn()
      .mockRejectedValueOnce(new ApiError('活动会话', 409))
      .mockRejectedValueOnce(new ApiError('需要二次认证', 401, 'mfa_required', challenge))
    const verifyMfaLogin = vi.fn().mockResolvedValue(undefined)
    useSessionStore.setState({ isHydrated: true, login, verifyMfaLogin })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /登录/ }))
    await screen.findByRole('dialog', { name: '账号已有活动会话' })
    fireEvent.click(screen.getByRole('button', { name: '强制登录' }))

    const code = await screen.findByLabelText('一次性验证码')
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /验证并登录/ }))

    await waitFor(() => expect(verifyMfaLogin).toHaveBeenCalledWith('operator', challenge.challengeId, challenge.clientId, '123456', true))
  })

  it('MFA 校验阶段发现活动会话时复用验证码确认强制接管', async () => {
    const challenge = { challengeId: 'challenge-login', clientId: 'web', expiresAt: '2026-11-15T03:00:00Z' }
    const login = vi.fn().mockRejectedValueOnce(new ApiError('需要二次认证', 401, 'mfa_required', challenge))
    const verifyMfaLogin = vi.fn()
      .mockRejectedValueOnce(new ApiError('活动会话', 409))
      .mockResolvedValueOnce(undefined)
    useSessionStore.setState({ isHydrated: true, login, verifyMfaLogin })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /登录/ }))
    const code = await screen.findByLabelText('一次性验证码')
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /验证并登录/ }))

    await screen.findByRole('dialog', { name: '账号已有活动会话' })
    fireEvent.click(screen.getByRole('button', { name: '强制登录' }))
    await waitFor(() => expect(verifyMfaLogin).toHaveBeenNthCalledWith(2, 'operator', challenge.challengeId, challenge.clientId, '123456', true))
  })

  it('已有当前会话时不再显示登录表单', () => {
    useSessionStore.setState({ isHydrated: true, user })
    renderPage()

    expect(screen.getByText('正在进入管理台')).toBeInTheDocument()
    expect(screen.queryByLabelText('用户名')).not.toBeInTheDocument()
  })
})
