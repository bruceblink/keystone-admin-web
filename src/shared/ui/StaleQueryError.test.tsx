import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StaleQueryError } from './StaleQueryError'

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
})
