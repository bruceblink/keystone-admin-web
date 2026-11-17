import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiKeysPage } from './ApiKeysPage'
import { ApiError, apiClient } from '../../shared/api/client'
import type { NativeApiKey } from '../../shared/api/schemas'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><ApiKeysPage /></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())
beforeEach(() => window.history.replaceState({}, '', '/api-keys'))

const key: NativeApiKey = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', name: 'CLI', prefix: 'cli_1234', scopes: ['user:read'], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z' }
const revokedKey: NativeApiKey = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', name: '旧客户端', prefix: 'old_5678', scopes: ['audit:read'], expiresAt: null, revokedAt: '2026-11-14T03:00:00Z', lastUsedAt: null, createdAt: '2026-11-13T02:00:00Z' }
const page = (items: NativeApiKey[] = [key], total = items.length, currentPage = 1) => ({ items, page: currentPage, size: 20, total })

describe('ApiKeysPage', () => {
  it('显示脱敏 API Key 元数据并支持状态筛选', async () => {
    vi.spyOn(apiClient, 'listApiKeysPage').mockImplementation(async ({ status }) => status === 'revoked' ? page([revokedKey]) : page([key, revokedKey]))
    renderPage()
    expect(await screen.findByText('CLI')).toBeInTheDocument()
    expect(screen.getByText('ks_live_cli_1234_••••')).toBeInTheDocument()
    const activeRow = screen.getByText('CLI').closest('tr')!
    expect(within(activeRow).getByText('从未使用')).toBeInTheDocument()
    expect(within(activeRow).getByText('永不过期')).toBeInTheDocument()
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'revoked' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))
    expect(await screen.findByText('旧客户端')).toBeInTheDocument()
    expect(screen.queryByText('CLI')).not.toBeInTheDocument()
  })

  it('通过确认模态框撤销有效 API Key', async () => {
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page())
    const revokeApiKey = vi.spyOn(apiClient, 'revokeApiKey').mockResolvedValue({ revoked: true })
    renderPage()

    expect(await screen.findByText('CLI')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.getByRole('dialog', { name: '撤销 API Key' })).toHaveTextContent('记录仍会保留')
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }))

    await waitFor(() => expect(revokeApiKey).toHaveBeenCalledWith(key.id))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('撤销失败时显示业务错误码诊断并保留确认上下文', async () => {
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page())
    vi.spyOn(apiClient, 'revokeApiKey').mockRejectedValue(new ApiError('changed', 409, 'resource_conflict', null, { requestId: 'revoke-1' }))
    renderPage()

    expect(await screen.findByText('CLI')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }))

    expect(await screen.findByText('当前资源状态不允许此操作')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('resource_conflict')
    expect(screen.getByRole('dialog')).toHaveTextContent('requestId=revoke-1')
  })

  it('API Key 签发收到 step-up 要求后验证并重试原操作', async () => {
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page([], 0))
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

  it('权限目录读取失败时显示业务错误诊断并支持重试', async () => {
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page([], 0))
    const catalog = vi.spyOn(apiClient, 'listPermissionCatalog')
      .mockRejectedValueOnce(new ApiError('catalog unavailable', 503, 'service_unavailable', null, { requestId: 'catalog-1' }))
      .mockResolvedValueOnce([{ permission: 'user:read', resource: 'user', action: 'read', description: 'user read', risk: 'low', registered: true, allowed: true }])
    renderPage()

    await screen.findByText('没有匹配的 API Key')
    fireEvent.click(screen.getByRole('button', { name: '签发 API Key' }))
    expect(await screen.findByText('系统服务暂时不可用，请稍后重试')).toBeInTheDocument()
    expect(screen.getByText(/requestId=catalog-1/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(catalog).toHaveBeenCalledTimes(2))
    expect(await screen.findByLabelText('筛选授权范围')).toBeInTheDocument()
  })

  it('按服务端 total 翻页并将筛选条件写入 URL', async () => {
    const secondKey = { ...key, id: '4f47c1d4-0a7f-4c9c-96d9-0e2d36518d2f', name: '第二枚密钥' }
    const listApiKeysPage = vi.spyOn(apiClient, 'listApiKeysPage').mockImplementation(async ({ page: currentPage }) => currentPage === 1 ? page([key], 21, currentPage) : page([secondKey], 21, currentPage))
    renderPage()

    await screen.findByText('CLI')
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    await screen.findByText('第二枚密钥')
    expect(listApiKeysPage).toHaveBeenLastCalledWith({ keyword: '', status: 'all', page: 2, size: 20 })
    expect(window.location.search).toContain('api_keys_page=2')
  })

  it('刷新失败时保留当前页并显示重试反馈', async () => {
    const listApiKeysPage = vi.spyOn(apiClient, 'listApiKeysPage')
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(new ApiError('internal detail', 503, 'service_unavailable', null, { requestId: 'api-key-refresh-1' }))
    renderPage()

    await screen.findByText('CLI')
    fireEvent.click(screen.getByRole('button', { name: '刷新列表' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('api-key-refresh-1')
    expect(screen.getByText('CLI')).toBeInTheDocument()
    expect(listApiKeysPage).toHaveBeenCalledTimes(2)
  })
})
