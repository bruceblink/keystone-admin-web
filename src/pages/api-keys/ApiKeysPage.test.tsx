import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeysPage } from './ApiKeysPage'
import { ApiError, apiClient } from '../../shared/api/client'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><ApiKeysPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('ApiKeysPage', () => {
  it('显示脱敏 API Key 元数据并支持状态筛选', async () => {
    vi.spyOn(apiClient, 'listApiKeys').mockResolvedValue([
      { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', name: 'CLI', prefix: 'cli_1234', scopes: ['user:read'], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z' },
      { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', name: '旧客户端', prefix: 'old_5678', scopes: ['audit:read'], expiresAt: null, revokedAt: '2026-11-14T03:00:00Z', lastUsedAt: null, createdAt: '2026-11-13T02:00:00Z' },
    ])
    renderPage()
    expect(await screen.findByText('CLI')).toBeInTheDocument()
    expect(screen.getByText('ks_live_cli_1234_••••')).toBeInTheDocument()
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'revoked' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))
    expect(screen.getByText('旧客户端')).toBeInTheDocument()
    expect(screen.queryByText('CLI')).not.toBeInTheDocument()
  })

  it('通过确认模态框撤销有效 API Key', async () => {
    const key = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', name: 'CLI', prefix: 'cli_1234', scopes: ['user:read'], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z' }
    vi.spyOn(apiClient, 'listApiKeys').mockResolvedValue([key])
    const revokeApiKey = vi.spyOn(apiClient, 'revokeApiKey').mockResolvedValue({ revoked: true })
    renderPage()

    expect(await screen.findByText('CLI')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('删除后不可恢复')
    fireEvent.click(screen.getByRole('button', { name: '确认删除 1 条' }))

    await waitFor(() => expect(revokeApiKey).toHaveBeenCalledWith(key.id))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('API Key 签发收到 step-up 要求后验证并重试原操作', async () => {
    vi.spyOn(apiClient, 'listApiKeys').mockResolvedValue([])
    vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([{ permission: 'api-key:create', resource: 'api-key', action: 'create', description: 'api-key create', risk: 'medium', registered: true, allowed: true }, { permission: 'user:read', resource: 'user', action: 'read', description: 'user read', risk: 'low', registered: true, allowed: true }])
    const issueApiKey = vi.spyOn(apiClient, 'issueApiKey')
      .mockRejectedValueOnce(new ApiError('recent MFA step-up is required', 403, 'mfa_step_up_required'))
      .mockResolvedValueOnce({ id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', name: 'deploy', prefix: 'dep', apiKey: 'ks_live_once', scopes: ['api-key:create'], expiresAt: null })
    const beginMfaStepUp = vi.spyOn(apiClient, 'beginMfaStepUp').mockResolvedValue({ challengeId: 'challenge-1', clientId: 'web', expiresAt: '2026-11-14T03:00:00Z' })
    const verifyMfaStepUp = vi.spyOn(apiClient, 'verifyMfaStepUp').mockResolvedValue({ accessToken: 'aal2-access', expiresIn: 300, authenticationLevel: 'AAL2', amr: 'otp' })
    renderPage()

    await screen.findByText('没有匹配的 API Key')
    expect(screen.queryByRole('button', { name: '配置接口权限' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '签发 API Key' }))
    const issueDialog = screen.getByRole('dialog', { name: '签发 API Key' })
    fireEvent.change(within(issueDialog).getByLabelText('密钥名称 *'), { target: { value: 'deploy' } })
    fireEvent.click(within(issueDialog).getByRole('checkbox', { name: /api-key:create/ }))
    fireEvent.click(within(issueDialog).getByRole('button', { name: '签发密钥' }))

    const stepUpDialog = await screen.findByRole('dialog', { name: '需要 MFA 二次验证' })
    expect(beginMfaStepUp).toHaveBeenCalledOnce()
    fireEvent.change(within(stepUpDialog).getByLabelText('验证码或恢复码 *'), { target: { value: '123456' } })
    fireEvent.click(within(stepUpDialog).getByRole('button', { name: '验证并继续' }))

    await waitFor(() => expect(verifyMfaStepUp).toHaveBeenCalledWith('challenge-1', '123456'))
    await waitFor(() => expect(issueApiKey).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('ks_live_once')).toBeInTheDocument()
  })
})
