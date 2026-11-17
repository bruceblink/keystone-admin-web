import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { RequireAuth } from './App'
import { useSessionStore } from '../shared/state/session'

function LoginRedirectProbe() {
  const location = useLocation()
  return <output data-testid="login-return-location">{JSON.stringify(location.state?.from)}</output>
}

afterEach(() => {
  useSessionStore.setState({ user: null, isHydrated: false, message: null })
})

describe('RequireAuth', () => {
  // 未登录访问筛选深链时，守卫把完整站内地址交给登录页。
  it('重定向到登录页时保留路径、查询参数和锚点', () => {
    useSessionStore.setState({ user: null, isHydrated: true })

    render(
      <MemoryRouter initialEntries={['/dictionaries?dictionaries_keyword=notice#results']}>
        <Routes>
          <Route path="/login" element={<LoginRedirectProbe />} />
          <Route element={<RequireAuth />}>
            <Route path="*" element={<div>受保护页面</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('login-return-location')).toHaveTextContent(
      JSON.stringify({ pathname: '/dictionaries', search: '?dictionaries_keyword=notice', hash: '#results' }),
    )
  })
})
