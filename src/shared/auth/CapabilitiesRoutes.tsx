import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { NativeCapabilities } from '../api/schemas'
import { Button, Card, Spinner } from '../ui'
import { canAccessCapabilityPage, capabilityPages, firstAccessibleCapabilityPage } from './capabilityRules'
import { useCapabilities } from './useCapabilities'

/** 权限未成功读取前不挂载管理页面；读取失败时只能由用户显式重试。 */
export function CapabilitiesBoundary() {
  const query = useCapabilities()
  return <CapabilitiesContent query={query} />
}

/** 状态页放在管理外壳的内容区，失败或无权限时仍保留退出入口。 */
export function CapabilitiesContent({ query }: { query: ReturnType<typeof useCapabilities> }) {
  if (query.isError || (!query.data && !query.isFetching)) {
    return <CapabilityStatus title="无法读取账号权限" message="权限服务暂时不可用。为保护账号数据，管理页面当前不可访问。" onRetry={() => void query.refetch()} retrying={query.isFetching} />
  }
  if (!query.data) {
    return <CapabilityLoading />
  }
  return <Outlet />
}

/** 直接访问页面时重新核对权限，不能只依靠已过滤的侧栏。 */
export function CapabilityPage({ path, children }: { path: string; children: ReactNode | ((capabilities: NativeCapabilities) => ReactNode) }) {
  const query = useCapabilities()
  const location = useLocation()
  if (!query.data || !canAccessCapabilityPage(path, query.data)) {
    const firstPage = query.data ? firstAccessibleCapabilityPage(query.data) : null
    if (location.state === 'after-authentication' && firstPage) return <Navigate to={firstPage.path} replace />
    return <AccessDeniedPage path={path} capabilities={query.data} onRetry={() => void query.refetch()} retrying={query.isFetching} />
  }
  return typeof children === 'function' ? children(query.data) : children
}

/** 根路径进入第一个有读取权限且有数据范围的页面。 */
export function DefaultCapabilityPage() {
  const query = useCapabilities()
  const page = query.data ? firstAccessibleCapabilityPage(query.data) : null
  return page ? <Navigate to={page.path} replace /> : <NoAccessiblePages capabilities={query.data} onRetry={() => void query.refetch()} retrying={query.isFetching} />
}

export function NoAccessiblePages({ capabilities, onRetry, retrying }: {
  capabilities: NativeCapabilities | undefined
  onRetry: () => void
  retrying: boolean
}) {
  const location = useLocation()
  if (capabilities && location.pathname !== '/') {
    return <AccessDeniedPage path={location.pathname} capabilities={capabilities} onRetry={onRetry} retrying={retrying} />
  }
  return <CapabilityStatus title="当前账号没有可访问的管理页面" message="请联系管理员检查账号权限和数据范围。" onRetry={onRetry} retrying={retrying} />
}

function AccessDeniedPage({ path, capabilities, onRetry, retrying }: {
  path: string
  capabilities: NativeCapabilities | undefined
  onRetry: () => void
  retrying: boolean
}) {
  const navigate = useNavigate()
  const defaultPage = capabilities ? firstAccessibleCapabilityPage(capabilities) : null
  const pageTitle = path === '/dashboard'
    ? '运行监控'
    : capabilityPages.find((page) => page.path === path)?.title ?? path
  return (
    <section className="capability-status-page" role="status">
      <Card className="capability-status-card">
        <p className="eyebrow">ACCESS / DENIED</p>
        <h1>当前账号无权访问此页面</h1>
        <p>无法打开“{pageTitle}”。请联系管理员检查账号权限和数据范围。</p>
        <div className="capability-status-actions">
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>{retrying ? '正在检查…' : '重新检查权限'}</Button>
          {defaultPage ? <Button size="sm" onClick={() => navigate(defaultPage.path, { replace: true })}>打开首个可访问页面</Button> : null}
        </div>
      </Card>
    </section>
  )
}

function CapabilityLoading() {
  return <section className="capability-status-page"><Card className="capability-status-card"><Spinner label="正在读取账号权限" /><p>读取完成前不会开放管理页面。</p></Card></section>
}

function CapabilityStatus({ title, message, onRetry, retrying }: { title: string; message: string; onRetry: () => void; retrying: boolean }) {
  return (
    <section className="capability-status-page" role="alert">
      <Card className="capability-status-card">
        <p className="eyebrow">ACCOUNT / PERMISSIONS</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="capability-status-actions"><Button onClick={onRetry} disabled={retrying}>{retrying ? '正在读取…' : '重试'}</Button></div>
      </Card>
    </section>
  )
}
