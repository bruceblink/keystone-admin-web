import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrendChart } from './TrendChart'

describe('TrendChart', () => {
  it('在没有采样数据时显示可访问的空状态', () => {
    // 空采样不能渲染空坐标轴，也不能让用户误判为零值。
    render(<TrendChart data={[]} />)

    expect(screen.getByRole('status')).toHaveTextContent('暂无采样数据')
    expect(screen.getByRole('status')).toHaveTextContent('系统 API 尚未返回 CPU 或内存趋势')
  })
})
