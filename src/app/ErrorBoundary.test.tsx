import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function BrokenWidget(): never {
  throw new Error('test render failure')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a recovery page visible when a child render fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <ErrorBoundary>
        <BrokenWidget />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('工作台暂时无法显示')
    expect(screen.getByRole('button', { name: /重新加载/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /返回登录/ })).toBeInTheDocument()
  })
})
