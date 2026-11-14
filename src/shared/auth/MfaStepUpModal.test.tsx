import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MfaStepUpModal } from './MfaStepUpModal'

const challenge = {
  challengeId: 'challenge-1',
  clientId: 'web',
  expiresAt: '2026-11-14T03:00:00Z',
}

afterEach(() => vi.restoreAllMocks())

describe('MfaStepUpModal', () => {
  it('提交验证码后清除输入并调用一次性回调', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MfaStepUpModal open challenge={challenge} pending={false} error={null} onClose={vi.fn()} onSubmit={onSubmit} />)

    const dialog = screen.getByRole('dialog', { name: '需要 MFA 二次验证' })
    fireEvent.change(within(dialog).getByLabelText('验证码或恢复码 *'), { target: { value: '123456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '验证并继续' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('123456'))
    expect(within(dialog).getByLabelText('验证码或恢复码 *')).toHaveValue('')
  })

  it('展示 Native 验证错误并保持模态框打开', () => {
    render(<MfaStepUpModal open challenge={challenge} pending={false} error="验证码无效" onClose={vi.fn()} onSubmit={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('验证码无效')
    expect(screen.getByRole('dialog', { name: '需要 MFA 二次验证' })).toBeInTheDocument()
  })
})
