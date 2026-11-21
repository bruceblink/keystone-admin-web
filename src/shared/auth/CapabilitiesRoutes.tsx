import { forwardRef, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { NativeCapabilities } from '../api/schemas'
import { Button, Card, Spinner } from '../ui'
import { canAccessCapabilityPage, capabilityPages, firstAccessibleCapabilityPage } from './capabilityRules'
import { useCapabilities } from './useCapabilities'
import { CapabilityAvailabilityContext, capabilitiesCacheScope, getCapabilityQueryScope, isCapabilityScopedQueryKey, sessionCapabilityScope } from './CapabilityAvailability'
import { useSessionStore } from '../state/session'

/** 权限重新确认时隐藏并暂停查询，但保留同一账号的页面和进行中操作。 */
export function CapabilitiesBoundary() {
  const query = useCapabilities()
  return <CapabilitiesContent query={query} />
}

/** 状态提示放在管理外壳内容区，失败时仍保留退出入口。 */
export function CapabilitiesContent({ query }: { query: ReturnType<typeof useCapabilities> }) {
  const confirmed = isCapabilitiesConfirmed(query)
  const retained = useRetainedCapabilities(query)
  const username = useSessionStore((state) => state.user?.username ?? null)
  const authRevision = useSessionStore((state) => state.authRevision)
  const queryClient = useQueryClient()
  const restoreFocusTarget = useRef<HTMLElement | null>(null)
  const wasConfirmed = useRef(false)
  const statusHasFocus = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLElement>(null)
  const visibleCapabilities = confirmed ? query.data : retained
  // dataUpdateCount 在同一毫秒内也会递增，避免权限重查共用旧数据查询键。
  const confirmedVersion = queryClient.getQueryState(['auth', 'capabilities', authRevision, username])?.dataUpdateCount ?? query.dataUpdatedAt
  const scopedCapabilities = capabilitiesCacheScope(visibleCapabilities, confirmedVersion)
  const cacheScope = sessionCapabilityScope(username, authRevision, scopedCapabilities)

  useLayoutEffect(() => {
    if (!confirmed) {
      if (wasConfirmed.current) {
        statusRef.current?.focus()
        statusHasFocus.current = true
      }
      wasConfirmed.current = false
      return
    }

    if (!wasConfirmed.current && statusHasFocus.current) {
      const target = restoreFocusTarget.current
      if (target?.isConnected && contentRef.current?.contains(target)) target.focus()
      else contentRef.current?.focus()
      restoreFocusTarget.current = null
      statusHasFocus.current = false
    }
    wasConfirmed.current = true
  }, [confirmed])

  useEffect(() => {
    if (confirmed) return
    // 用户在权限提示显示期间主动移到外部控件后，不再抢回原页面焦点。
    const clearRestoreTarget = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || target === statusRef.current || contentRef.current?.contains(target)) return
      restoreFocusTarget.current = null
      statusHasFocus.current = false
    }
    document.addEventListener('focusin', clearRestoreTarget)
    return () => document.removeEventListener('focusin', clearRestoreTarget)
  }, [confirmed])

  useEffect(() => {
    if (!confirmed) return
    // 每次权限重新读取都使用新数据缓存，迟到的旧请求只能写回旧缓存键。
    queryClient.removeQueries({
      predicate: (cachedQuery) => isCapabilityScopedQueryKey(cachedQuery.queryKey)
        && getCapabilityQueryScope(cachedQuery.queryKey) !== cacheScope,
    })
  }, [cacheScope, confirmed, queryClient])

  return (
    <CapabilityAvailabilityContext.Provider value={{ available: confirmed, cacheScope: scopedCapabilities }}>
      <div
        ref={contentRef}
        className="capabilities-outlet"
        tabIndex={-1}
        hidden={!confirmed}
        inert={!confirmed}
        onFocusCapture={(event) => { if (event.target instanceof HTMLElement) restoreFocusTarget.current = event.target }}
      >
        {confirmed || retained ? <Outlet /> : null}
      </div>
      {!confirmed ? query.isError || (!query.data && !query.isFetching)
        ? <CapabilityStatus ref={statusRef} title="无法读取账号权限" message="权限服务暂时不可用。为保护账号数据，管理页面当前不可访问。" onRetry={() => void query.refetch()} retrying={query.isFetching} />
        : <CapabilityLoading ref={statusRef} /> : null}
    </CapabilityAvailabilityContext.Provider>
  )
}

/** 直接访问页面时重新核对权限；验证期间保留已授权子树并阻止其交互。 */
export function CapabilityPage({ path, children }: { path: string; children: ReactNode | ((capabilities: NativeCapabilities) => ReactNode) }) {
  const query = useCapabilities()
  const location = useLocation()
  const parentAvailability = useContext(CapabilityAvailabilityContext)
  const retained = useRetainedCapabilities(query)
  const confirmed = parentAvailability.available && isCapabilitiesConfirmed(query)
  const currentCapabilities = confirmed ? query.data : undefined
  const canAccess = Boolean(currentCapabilities && canAccessCapabilityPage(path, currentCapabilities))
  const canRetainPage = Boolean(!confirmed && retained && canAccessCapabilityPage(path, retained))

  if (!confirmed && canRetainPage) {
    return (
      <CapabilityAvailabilityContext.Provider value={{ ...parentAvailability, available: false }}>
        <div className="capability-page-content" hidden inert>
          {renderCapabilityChildren(children, retained!)}
        </div>
      </CapabilityAvailabilityContext.Provider>
    )
  }

  if (!confirmed) {
    return <CapabilityAvailabilityContext.Provider value={{ ...parentAvailability, available: false }}><div hidden><CapabilityLoading /></div></CapabilityAvailabilityContext.Provider>
  }

  if (!canAccess) {
    const firstPage = currentCapabilities ? firstAccessibleCapabilityPage(currentCapabilities) : null
    if (location.state === 'after-authentication' && firstPage) return <Navigate to={firstPage.path} replace />
    return <AccessDeniedPage path={path} capabilities={currentCapabilities} onRetry={() => void query.refetch()} retrying={query.isFetching} />
  }

  return (
    <CapabilityAvailabilityContext.Provider value={{ ...parentAvailability, available: true }}>
      <div className="capability-page-content">{renderCapabilityChildren(children, currentCapabilities!)}</div>
    </CapabilityAvailabilityContext.Provider>
  )
}

/** 根路径只在当前会话权限确认后进入首个可访问页面。 */
export function DefaultCapabilityPage() {
  const query = useCapabilities()
  if (!isCapabilitiesConfirmed(query)) return <CapabilityLoading />
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

function renderCapabilityChildren(children: ReactNode | ((capabilities: NativeCapabilities) => ReactNode), capabilities: NativeCapabilities) {
  return typeof children === 'function' ? children(capabilities) : children
}

export function isCapabilitiesConfirmed(query: ReturnType<typeof useCapabilities>): boolean {
  return Boolean(query.data && !query.isFetching && !query.isError && !query.isPlaceholderData)
}

/** 只保留同一登录名最后确认的权限，账号切换时立即隔离旧页面。 */
function useRetainedCapabilities(query: ReturnType<typeof useCapabilities>): NativeCapabilities | undefined {
  const username = useSessionStore((state) => state.user?.username ?? null)
  const [snapshot, setSnapshot] = useState<{ username: string; capabilities: NativeCapabilities } | null>(null)

  useEffect(() => {
    if (username && isCapabilitiesConfirmed(query) && query.data) setSnapshot({ username, capabilities: query.data })
    if (!username) setSnapshot(null)
  }, [query.data, query.isError, query.isFetching, query.isPlaceholderData, username])

  return snapshot?.username === username ? snapshot.capabilities : undefined
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
    <CapabilityAvailabilityContext.Provider value={{ available: false, cacheScope: capabilitiesCacheScope(capabilities, 0) }}>
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
    </CapabilityAvailabilityContext.Provider>
  )
}

const CapabilityLoading = forwardRef<HTMLElement>(function CapabilityLoading(_props, ref) {
  return <section ref={ref} className="capability-status-page" tabIndex={-1} role="status"><Card className="capability-status-card"><Spinner label="正在读取账号权限" /><p>读取完成前不会开放管理页面。</p></Card></section>
})

const CapabilityStatus = forwardRef<HTMLElement, { title: string; message: string; onRetry: () => void; retrying: boolean }>(function CapabilityStatus({ title, message, onRetry, retrying }, ref) {
  return (
    <section ref={ref} className="capability-status-page" tabIndex={-1} role="alert">
      <Card className="capability-status-card">
        <p className="eyebrow">ACCOUNT / PERMISSIONS</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="capability-status-actions"><Button onClick={onRetry} disabled={retrying}>{retrying ? '正在读取…' : '重试'}</Button></div>
      </Card>
    </section>
  )
})
