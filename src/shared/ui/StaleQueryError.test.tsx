import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StaleQueryError } from './StaleQueryError'
import { InitialQueryError } from './InitialQueryError'
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

describe('InitialQueryError', () => {
  it('显示安全错误提示、业务码和重试入口', () => {
    const onRetry = vi.fn()
    render(<InitialQueryError title="无法读取用户列表" message="原始内部消息" error={new ApiError('内部消息', 503, 'service_unavailable', null, { requestId: 'req-1' })} onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('无法读取用户列表')
    expect(screen.getByRole('alert')).toHaveTextContent('系统服务暂时不可用，请稍后重试')
    expect(screen.getByRole('alert')).toHaveTextContent('service_unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent('服务暂不可用')
    expect(screen.getByRole('alert')).toHaveTextContent('requestId=req-1')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('未知或客户端错误只显示安全回退文案和代码', () => {
    render(<InitialQueryError title="读取失败" message="请稍后重试" error={new ApiError('network failed', 0, 'network_error')} onRetry={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('无法连接系统 API')
    expect(screen.getByRole('alert')).toHaveTextContent('network_error')
  })
})
