import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/api/errors'
import { ConfigFormModal } from './ConfigFormModal'

describe('ConfigFormModal', () => {
  it('显示保存错误的业务码诊断并保留表单', () => {
    render(
      <ConfigFormModal
        open
        mode="create"
        config={null}
        pending={false}
        error={new ApiError('internal details', 409, 'resource_conflict', null, { requestId: 'req-config-1' })}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('系统配置保存失败')
    expect(alert).toHaveTextContent('当前资源状态不允许此操作')
    expect(alert).toHaveTextContent('resource_conflict')
    expect(alert).toHaveTextContent('资源状态或唯一约束发生冲突')
    expect(alert).toHaveTextContent('requestId=req-config-1')
    expect(screen.getByPlaceholderText('例如 security.session.ttl')).toBeInTheDocument()
  })
})
