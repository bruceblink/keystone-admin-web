import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { ActionError } from './ActionError'

describe('ActionError', () => {
  it('显示安全提示、业务错误码、业务含义和请求标识', () => {
    const onDismiss = vi.fn()
    render(<ActionError title="API Key 轮换失败" error={new ApiError('internal detail', 409, 'resource_conflict', null, { requestId: 'req-2' })} onDismiss={onDismiss} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('API Key 轮换失败')
    expect(alert).toHaveTextContent('当前资源状态不允许此操作')
    expect(alert).toHaveTextContent('resource_conflict')
    expect(alert).toHaveTextContent('资源状态或唯一约束发生冲突')
    expect(alert).toHaveTextContent('requestId=req-2')
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('兼容表单传入的字符串错误', () => {
    render(<ActionError title="保存失败" error="请检查表单" />)
    expect(screen.getByRole('alert')).toHaveTextContent('请检查表单')
  })
})
