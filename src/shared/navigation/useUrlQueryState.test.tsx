import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useUrlQueryState } from './useUrlQueryState'

function QueryStateProbe() {
  const [state, setState] = useUrlQueryState({ page: 1, keyword: '' }, { namespace: 'configs' })
  return <div>
    <span data-testid="page">{state.page}</span>
    <span data-testid="keyword">{state.keyword}</span>
    <button type="button" onClick={() => setState({ page: 2, keyword: 'system' })}>更新</button>
  </div>
}

describe('useUrlQueryState', () => {
  it('将非法分页深链接回退到第一页', () => {
    window.history.replaceState({}, '', '/configs?configs_page=0&configs_keyword=system')
    render(<QueryStateProbe />)

    expect(screen.getByTestId('page')).toHaveTextContent('1')
    expect(screen.getByTestId('keyword')).toHaveTextContent('system')
  })

  it('保留有效分页并写回筛选状态', () => {
    window.history.replaceState({}, '', '/configs?configs_page=2')
    render(<QueryStateProbe />)

    expect(screen.getByTestId('page')).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: '更新' }))
    expect(window.location.search).toContain('configs_page=2')
    expect(window.location.search).toContain('configs_keyword=system')
  })
})
