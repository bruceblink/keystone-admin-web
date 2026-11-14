import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeysPage } from './ApiKeysPage'
import { apiClient } from '../../shared/api/client'

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
})
