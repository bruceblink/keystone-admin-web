import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StaleQueryError } from './StaleQueryError'
import { ApiError } from '../api/errors'

describe('StaleQueryError', () => {
  it('保留刷新失败说明并提供重试入口', () => {
    const onRetry = vi.fn()
    render(<StaleQueryError message="接口暂时不可用" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('数据刷新失败')
    expect(screen.getByText('接口暂时不可用')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('重试期间禁用入口并显示处理中状态', () => {
    render(<StaleQueryError message="接口暂时不可用" onRetry={vi.fn()} retrying />)

    expect(screen.getByRole('button', { name: '重试中…' })).toBeDisabled()
  })

  it('显示服务端错误码和业务含义', () => {
    render(<StaleQueryError message="服务暂时不可用" error={new ApiError('temporary failure', 503, 'service_unavailable')} onRetry={vi.fn()} />)

    expect(screen.getByText('诊断：service_unavailable · 服务暂不可用')).toBeInTheDocument()
  })

  it('未知或客户端错误码只显示安全的代码标识', () => {
    render(<StaleQueryError message="无法连接系统 API" error={new ApiError('network failed', 0, 'network_error')} onRetry={vi.fn()} />)

    expect(screen.getByText('诊断：network_error')).toBeInTheDocument()
    expect(screen.queryByText(/network failed/)).not.toBeInTheDocument()
  })
})
