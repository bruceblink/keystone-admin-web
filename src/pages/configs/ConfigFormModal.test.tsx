import { fireEvent, render, screen } from '@testing-library/react'
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
    fireEvent.change(screen.getByLabelText('配置值 *'), { target: { value: '900' } })
    expect(screen.getByRole('alert')).toHaveTextContent('系统配置保存失败')
  })

  it('只在被校验字段修正时清除提示，并保留另一个字段的校验错误', () => {
    const onSubmit = vi.fn(async () => undefined)
    render(<ConfigFormModal open mode="create" config={null} pending={false} error={null} onClose={vi.fn()} onSubmit={onSubmit} />)
    const key = screen.getByLabelText('配置键 *')
    const value = screen.getByLabelText('配置值 *')
    const description = screen.getByLabelText('说明')
    const save = screen.getByRole('button', { name: '保存配置' })

    fireEvent.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent('配置键不能为空')
    fireEvent.change(key, { target: { value: '   ' } })
    expect(screen.getByRole('alert')).toHaveTextContent('配置键不能为空')
    fireEvent.change(description, { target: { value: '会话有效期' } })
    expect(screen.getByRole('alert')).toHaveTextContent('配置键不能为空')
    fireEvent.change(key, { target: { value: 'security.session.ttl' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent('配置值不能为空')
    fireEvent.change(key, { target: { value: 'security.session.timeout' } })
    expect(screen.getByRole('alert')).toHaveTextContent('配置值不能为空')
    fireEvent.change(value, { target: { value: '  ' } })
    expect(screen.getByRole('alert')).toHaveTextContent('配置值不能为空')
    fireEvent.change(value, { target: { value: '900' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(save)
    expect(onSubmit).toHaveBeenCalledWith({ key: 'security.session.timeout', value: '900', description: '会话有效期', enabled: true })
  })
})
