import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useUrlQueryState } from './useUrlQueryState'

function QueryStateProbe() {
  const [state, setState] = useUrlQueryState({ page: 1, keyword: '' }, { namespace: 'configs' })
  return <div>
    <span data-testid="page">{state.page}</span>
    <span data-testid="keyword">{state.keyword}</span>
    <button type="button" onClick={() => setState({ page: 2, keyword: 'system' }, { history: 'push' })}>更新</button>
    <button type="button" onClick={() => setState({ page: 3, keyword: 'database' }, { history: 'push' })}>再次更新</button>
    <button type="button" onClick={() => setState({ page: 4, keyword: 'corrected' }, { history: 'replace' })}>自动修正</button>
  </div>
}

describe('useUrlQueryState', () => {
  it('将非法分页深链接回退到第一页', () => {
    window.history.replaceState({}, '', '/configs?configs_page=0&configs_keyword=system')
    render(<BrowserRouter><QueryStateProbe /></BrowserRouter>)

    expect(screen.getByTestId('page')).toHaveTextContent('1')
    expect(screen.getByTestId('keyword')).toHaveTextContent('system')
  })

  it('保留有效分页并写回筛选状态', () => {
    window.history.replaceState({}, '', '/configs?configs_page=2')
    render(<BrowserRouter><QueryStateProbe /></BrowserRouter>)

    expect(screen.getByTestId('page')).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: '更新' }))
    expect(window.location.search).toContain('configs_page=2')
    expect(window.location.search).toContain('configs_keyword=system')
  })

  it('连续查询可后退和前进，自动修正替换当前历史记录', async () => {
    window.history.replaceState({}, '', '/configs?keep=1')
    render(<BrowserRouter><QueryStateProbe /></BrowserRouter>)

    fireEvent.click(screen.getByRole('button', { name: '更新' }))
    expect(await screen.findByTestId('keyword')).toHaveTextContent('system')
    expect(window.location.search).toContain('configs_keyword=system')
    expect(window.location.search).toContain('keep=1')

    fireEvent.click(screen.getByRole('button', { name: '再次更新' }))
    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('3')
      expect(screen.getByTestId('keyword')).toHaveTextContent('database')
    })

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('2')
      expect(screen.getByTestId('keyword')).toHaveTextContent('system')
      expect(window.location.search).toContain('configs_keyword=system')
    })

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('1')
      expect(screen.getByTestId('keyword')).toHaveTextContent('')
      expect(window.location.search).toBe('?keep=1')
    })

    await act(async () => {
      window.history.forward()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await waitFor(() => expect(screen.getByTestId('keyword')).toHaveTextContent('system'))

    await act(async () => {
      window.history.forward()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await waitFor(() => expect(screen.getByTestId('keyword')).toHaveTextContent('database'))

    fireEvent.click(screen.getByRole('button', { name: '自动修正' }))
    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('4')
      expect(screen.getByTestId('keyword')).toHaveTextContent('corrected')
    })

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('2')
      expect(screen.getByTestId('keyword')).toHaveTextContent('system')
    })

    await act(async () => {
      window.history.forward()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('4')
      expect(screen.getByTestId('keyword')).toHaveTextContent('corrected')
    })
  })
})
