import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiKeysPage } from './ApiKeysPage'
import { ApiError, apiClient } from '../../shared/api/client'
import type { NativeApiKey, NativeCapabilities } from '../../shared/api/schemas'
import { useSessionStore } from '../../shared/state/session'

const apiKeyCapabilities = (permissions: string[], hasResourceScope = true): NativeCapabilities => ({
  permissions,
  resources: {
    user: false, department: false, role: false, post: false, menu: false, config: false,
    dictionary: false, notice: false, job: false, audit: false, session: false,
    'api-key': hasResourceScope, profile: false,
  },
})
const allApiKeyCapabilities = apiKeyCapabilities(['api-key:read', 'api-key:create', 'api-key:rotate', 'api-key:revoke'])

function renderPage(capabilities = allApiKeyCapabilities) {
  useSessionStore.setState({ user: { id: 'api-key-user', username: 'api-key-operator', displayName: 'API Key 用户', role: 'operator' }, isHydrated: true, authRevision: 4 })
  vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue(capabilities)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<BrowserRouter><QueryClientProvider client={queryClient}><ApiKeysPage /></QueryClientProvider></BrowserRouter>)
}

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  window.history.replaceState({}, '', '/api-keys')
  useSessionStore.setState({ user: null, isHydrated: false, message: null, authRevision: 0 })
})

const key: NativeApiKey = { id: '2a4f3bb4-79ec-4af1-a2ec-3f71bc63f4ce', name: 'CLI', prefix: 'cli_1234', scopes: ['user:read'], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-11-14T02:00:00Z' }
const revokedKey: NativeApiKey = { id: '8d30e3aa-0c16-4d66-bf42-9b2f84f5a51a', name: '旧客户端', prefix: 'old_5678', scopes: ['audit:read'], expiresAt: null, revokedAt: '2026-11-14T03:00:00Z', lastUsedAt: null, createdAt: '2026-11-13T02:00:00Z' }
const page = (items: NativeApiKey[] = [key], total = items.length, currentPage = 1) => ({ items, page: currentPage, size: 20, total })

describe('ApiKeysPage', () => {
  it.each([
    { permissions: ['api-key:read'], issue: false, rotate: false, revoke: false },
    { permissions: ['api-key:read', 'api-key:create'], issue: true, rotate: false, revoke: false },
    { permissions: ['api-key:read', 'api-key:rotate'], issue: false, rotate: true, revoke: false },
    { permissions: ['api-key:read', 'api-key:revoke'], issue: false, rotate: false, revoke: true },
  ])('按读取权限和具体操作权限显示按钮 $permissions', async ({ permissions, issue, rotate, revoke }) => {
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page())
    const catalog = vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([
      { permission: 'api-key:create', resource: 'api-key', action: 'create', description: 'api-key create', risk: 'medium', registered: true, allowed: true },
    ])
    renderPage(apiKeyCapabilities(permissions))

    expect(await screen.findByText('CLI')).toBeInTheDocument()
    expect(Boolean(screen.queryByRole('button', { name: '签发 API Key' }))).toBe(issue)
    const row = screen.getByText('CLI').closest('tr')!
    expect(Boolean(within(row).queryByRole('button', { name: '轮换' }))).toBe(rotate)
    expect(Boolean(within(row).queryByRole('button', { name: '撤销' }))).toBe(revoke)
    if (issue) await waitFor(() => expect(catalog).toHaveBeenCalledTimes(1))
    else expect(catalog).not.toHaveBeenCalled()
  })

  it('没有 API Key 数据范围时不读取目录、列表或显示操作', async () => {
    const list = vi.spyOn(apiClient, 'listApiKeysPage')
    const catalog = vi.spyOn(apiClient, 'listPermissionCatalog')
    renderPage(apiKeyCapabilities(['api-key:read', 'api-key:create', 'api-key:rotate', 'api-key:revoke'], false))

    expect(await screen.findByText('当前账号无法读取 API Key 列表')).toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
    expect(catalog).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '签发 API Key' })).not.toBeInTheDocument()
  })

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

  it('已过期密钥显示明确状态、禁止轮换并提示新建', async () => {
    const expiredKey = { ...key, expiresAt: new Date(Date.now() - 60_000).toISOString() }
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page([expiredKey]))
    const rotate = vi.spyOn(apiClient, 'rotateApiKey')
    renderPage()

    expect(await screen.findByText('已过期')).toBeInTheDocument()
    const row = screen.getByText('CLI').closest('tr')!
    expect(within(row).getByRole('button', { name: '轮换' })).toBeDisabled()
    expect(within(row).getByText('已过期，请新建 API Key')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: '轮换' }))
    expect(rotate).not.toHaveBeenCalled()
  })

  it('页面保持打开时在最近密钥到期后自动更新状态并禁用轮换', async () => {
    const expiringKey = { ...key, expiresAt: new Date(Date.now() + 1_200).toISOString() }
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page([expiringKey]))
    renderPage()

    expect(await screen.findByText('CLI')).toBeInTheDocument()
    const row = screen.getByText('CLI').closest('tr')!
    expect(within(row).getByText('有效')).toBeInTheDocument()
    await waitFor(() => expect(within(row).getByText('已过期')).toBeInTheDocument(), { timeout: 3_000, interval: 25 })
    expect(within(row).getByRole('button', { name: '轮换' })).toBeDisabled()
  })

  it('列表请求跨过到期时间时用响应到达时间更新密钥状态', async () => {
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    let resolveList: (result: ReturnType<typeof page>) => void = () => undefined
    const listApiKeysPage = vi.spyOn(apiClient, 'listApiKeysPage').mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))
    renderPage()

    await waitFor(() => expect(listApiKeysPage).toHaveBeenCalledOnce())
    const expiresAt = new Date(now + 1_000).toISOString()
    now += 1_001
    resolveList(page([{ ...key, expiresAt }]))

    const row = (await screen.findByText('CLI')).closest('tr')!
    expect(within(row).getByText('已过期')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '轮换' })).toBeDisabled()
  })

  it('有效筛选中的密钥到期后重新读取并移出列表', async () => {
    const expiry = Date.now() + 1_200
    const expiringKey = { ...key, expiresAt: new Date(expiry).toISOString() }
    const listApiKeysPage = vi.spyOn(apiClient, 'listApiKeysPage').mockImplementation(async ({ status }) =>
      status === 'active' && Date.now() >= expiry ? page([], 0) : page([expiringKey]),
    )
    renderPage()

    await screen.findByText('CLI')
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'active' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))
    await waitFor(() => expect(listApiKeysPage).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('CLI')).toBeInTheDocument()

    await waitFor(() => expect(screen.queryByText('CLI')).not.toBeInTheDocument(), { timeout: 3_000, interval: 25 })
    expect(listApiKeysPage).toHaveBeenCalledTimes(3)
    expect(screen.getByText('没有匹配的 API Key')).toBeInTheDocument()
  })

  it('有效查询响应到达时密钥已过期会重读并采用最新总数', async () => {
    const expiredKey = { ...key, expiresAt: new Date(Date.now() - 1_000).toISOString() }
    let activeReads = 0
    const listApiKeysPage = vi.spyOn(apiClient, 'listApiKeysPage').mockImplementation(async ({ status }) => {
      if (status !== 'active') return page([expiredKey])
      activeReads += 1
      return activeReads === 1 ? page([expiredKey]) : page([], 0)
    })
    renderPage()

    await screen.findByText('CLI')
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'active' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))

    await waitFor(() => expect(listApiKeysPage).toHaveBeenCalledTimes(3))
    expect(activeReads).toBe(2)
    expect(await screen.findByText('没有匹配的 API Key')).toBeInTheDocument()
    expect(screen.getByText('共 0 个匹配凭据')).toBeInTheDocument()
  })

  it('重读仍返回已过期密钥时只重试一次并提示分页数据可能未同步', async () => {
    const expiredKey = { ...key, expiresAt: new Date(Date.now() - 1_000).toISOString() }
    const listApiKeysPage = vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page([expiredKey]))
    renderPage()

    await screen.findByText('CLI')
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'active' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))

    const warning = await screen.findByRole('alert')
    expect(warning).toHaveTextContent('服务端总数和分页可能尚未同步')
    expect(warning).toHaveTextContent('重试读取')
    expect(screen.getByText('共 1 个匹配凭据')).toBeInTheDocument()
    await waitFor(() => expect(listApiKeysPage).toHaveBeenCalledTimes(3))
    await new Promise((resolve) => window.setTimeout(resolve, 100))
    expect(listApiKeysPage).toHaveBeenCalledTimes(3)
  })

  it('点击轮换时再次检查当前时间，阻止未重绘页面上的过期密钥', async () => {
    let currentTime = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => currentTime)
    const expiringKey = { ...key, expiresAt: new Date(currentTime + 5_000).toISOString() }
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page([expiringKey]))
    const rotate = vi.spyOn(apiClient, 'rotateApiKey')
    renderPage()

    expect(await screen.findByText('CLI')).toBeInTheDocument()
    const row = screen.getByText('CLI').closest('tr')!
    expect(within(row).getByRole('button', { name: '轮换' })).toBeEnabled()

    currentTime += 5_001
    fireEvent.click(within(row).getByRole('button', { name: '轮换' }))

    expect(rotate).not.toHaveBeenCalled()
    expect(await within(row).findByText('已过期')).toBeInTheDocument()
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

  it.each([
    { code: 'api_key_name_invalid', message: 'API Key 名称必须为 1 到 128 个字符。', name: 'n'.repeat(129), expiresAt: '2030-01-02T13:45' },
    { code: 'api_key_expiry_invalid', message: 'API Key 到期时间格式无效，请重新选择时间。', name: 'deploy', expiresAt: '2026-12-01T12:00' },
    { code: 'api_key_expiry_out_of_range', message: 'API Key 到期时间必须晚于当前时间且不超过 90 天。', name: 'deploy', expiresAt: '2030-01-01T12:00' },
  ])('签发失败 $code 时显示独立原因和诊断码', async ({ code, message, name, expiresAt }) => {
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page([], 0))
    vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([
      { permission: 'api-key:create', resource: 'api-key', action: 'create', description: 'api-key create', risk: 'medium', registered: true, allowed: true },
    ])
    const issueApiKey = vi.spyOn(apiClient, 'issueApiKey').mockRejectedValue(new ApiError('server validation detail', 422, code))
    renderPage()

    await screen.findByText('没有匹配的 API Key')
    fireEvent.click(screen.getByRole('button', { name: '签发 API Key' }))
    const dialog = screen.getByRole('dialog', { name: '签发 API Key' })
    fireEvent.change(within(dialog).getByLabelText('密钥名称 *'), { target: { value: name } })
    const expiryField = within(dialog).getByLabelText('到期时间')
    if (expiresAt) fireEvent.input(expiryField, { target: { value: expiresAt } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /api-key:create/ }))
    if (expiresAt) expect(expiryField).toHaveValue(expiresAt)
    fireEvent.click(within(dialog).getByRole('button', { name: '签发密钥' }))

    expect(await within(dialog).findByText(message)).toBeInTheDocument()
    if (expiresAt) expect(expiryField).toHaveValue(expiresAt)
    expect(within(dialog).getByText(new RegExp(`诊断：${code} · `))).toBeInTheDocument()
    expect(issueApiKey).toHaveBeenCalledWith({
      name: name.trim(),
      scopes: ['api-key:create'],
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
  })

  it('名称校验失败后新增到期时间并修改权限时保留日期用于重试', async () => {
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page([], 0))
    vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([
      { permission: 'api-key:create', resource: 'api-key', action: 'create', description: 'api-key create', risk: 'medium', registered: true, allowed: true },
      { permission: 'user:read', resource: 'user', action: 'read', description: 'user read', risk: 'low', registered: true, allowed: true },
    ])
    const issueApiKey = vi.spyOn(apiClient, 'issueApiKey')
      .mockRejectedValueOnce(new ApiError('name invalid', 422, 'api_key_name_invalid'))
      .mockRejectedValueOnce(new ApiError('expiry out of range', 422, 'api_key_expiry_out_of_range'))
    renderPage()

    await screen.findByText('没有匹配的 API Key')
    fireEvent.click(screen.getByRole('button', { name: '签发 API Key' }))
    const dialog = screen.getByRole('dialog', { name: '签发 API Key' })
    fireEvent.change(within(dialog).getByLabelText('密钥名称 *'), { target: { value: 'n'.repeat(129) } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /api-key:create/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '签发密钥' }))
    expect(await within(dialog).findByText('API Key 名称必须为 1 到 128 个字符。')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('密钥名称 *'), { target: { value: 'deploy' } })
    const expiryField = within(dialog).getByLabelText('到期时间')
    fireEvent.input(expiryField, { target: { value: '2030-01-02T13:45' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /user:read/ }))
    expect(expiryField).toHaveValue('2030-01-02T13:45')
    fireEvent.click(within(dialog).getByRole('button', { name: '签发密钥' }))

    expect(await within(dialog).findByText('API Key 到期时间必须晚于当前时间且不超过 90 天。')).toBeInTheDocument()
    expect(issueApiKey).toHaveBeenNthCalledWith(1, { name: 'n'.repeat(129), scopes: ['api-key:create'], expiresAt: null })
    expect(issueApiKey).toHaveBeenNthCalledWith(2, {
      name: 'deploy',
      scopes: ['api-key:create', 'user:read'],
      expiresAt: new Date('2030-01-02T13:45').toISOString(),
    })
  })

  it('关闭后重新打开签发弹窗会清空到期时间', async () => {
    vi.spyOn(apiClient, 'listApiKeysPage').mockResolvedValue(page([], 0))
    vi.spyOn(apiClient, 'listPermissionCatalog').mockResolvedValue([
      { permission: 'api-key:create', resource: 'api-key', action: 'create', description: 'api-key create', risk: 'medium', registered: true, allowed: true },
    ])
    renderPage()

    await screen.findByText('没有匹配的 API Key')
    fireEvent.click(screen.getByRole('button', { name: '签发 API Key' }))
    const dialog = screen.getByRole('dialog', { name: '签发 API Key' })
    const expiryField = within(dialog).getByLabelText('到期时间')
    fireEvent.input(expiryField, { target: { value: '2026-12-01T12:00' } })
    expect(expiryField).toHaveValue('2026-12-01T12:00')

    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '签发 API Key' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '签发 API Key' }))

    expect(within(screen.getByRole('dialog', { name: '签发 API Key' })).getByLabelText('到期时间')).toHaveValue('')
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
