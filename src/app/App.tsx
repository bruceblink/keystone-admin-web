import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AdminShell } from '../widgets/layout/AdminShell'
import { LoginPage } from '../pages/login/LoginPage'
import { useSessionStore } from '../shared/state/session'
import { Spinner } from '../shared/ui'
import { NotFoundPage } from '../pages/not-found/NotFoundPage'
import { CapabilityPage, DefaultCapabilityPage } from '../shared/auth/CapabilitiesRoutes'
import { useCapabilities } from '../shared/auth/useCapabilities'

// 管理页面按路由延迟加载，首屏只加载登录和管理外壳，避免所有业务页面进入同一个初始包。
const MonitorPage = lazy(() => import('../pages/monitor/MonitorPage').then(({ MonitorPage }) => ({ default: MonitorPage })))
const UsersPage = lazy(() => import('../pages/users/UsersPage').then(({ UsersPage }) => ({ default: UsersPage })))
const OperationsAuditPage = lazy(() => import('../pages/audit/OperationsAuditPage').then(({ OperationsAuditPage }) => ({ default: OperationsAuditPage })))
const DepartmentsPage = lazy(() => import('../pages/departments/DepartmentsPage').then(({ DepartmentsPage }) => ({ default: DepartmentsPage })))
const PostsPage = lazy(() => import('../pages/posts/PostsPage').then(({ PostsPage }) => ({ default: PostsPage })))
const RolesPage = lazy(() => import('../pages/roles/RolesPage').then(({ RolesPage }) => ({ default: RolesPage })))
const MenusPage = lazy(() => import('../pages/menus/MenusPage').then(({ MenusPage }) => ({ default: MenusPage })))
const ApiKeysPage = lazy(() => import('../pages/api-keys/ApiKeysPage').then(({ ApiKeysPage }) => ({ default: ApiKeysPage })))
const LoginLogsPage = lazy(() => import('../pages/audit/LoginLogsPage').then(({ LoginLogsPage }) => ({ default: LoginLogsPage })))
const JobsPage = lazy(() => import('../pages/jobs/JobsPage').then(({ JobsPage }) => ({ default: JobsPage })))
const ConfigsPage = lazy(() => import('../pages/configs/ConfigsPage').then(({ ConfigsPage }) => ({ default: ConfigsPage })))
const DictionariesPage = lazy(() => import('../pages/dictionaries/DictionariesPage').then(({ DictionariesPage }) => ({ default: DictionariesPage })))
const NoticesPage = lazy(() => import('../pages/notices/NoticesPage').then(({ NoticesPage }) => ({ default: NoticesPage })))
const ProfilePage = lazy(() => import('../pages/profile/ProfilePage').then(({ ProfilePage }) => ({ default: ProfilePage })))

export function RequireAuth() {
  const { user, isHydrated } = useSessionStore()
  const location = useLocation()
  if (!isHydrated) return <div className="page-center"><Spinner label="正在恢复会话" /></div>
  if (!user) {
    return <Navigate to="/login" replace state={{ from: { pathname: location.pathname, search: location.search, hash: location.hash } }} />
  }
  return <Outlet />
}

function ProtectedLayout() {
  const capabilitiesQuery = useCapabilities()
  return <AdminShell capabilitiesQuery={capabilitiesQuery} />
}

export function App() {
  const restore = useSessionStore((state) => state.restore)

  useEffect(() => {
    void restore()
  }, [restore])

  return (
    <Suspense fallback={<div className="page-center"><Spinner label="正在加载管理页面" /></div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<ProtectedLayout />}>
            <Route index element={<DefaultCapabilityPage />} />
            <Route path="/monitor" element={<CapabilityPage path="/monitor">{(capabilities) => <MonitorPage capabilities={capabilities} />}</CapabilityPage>} />
            {/* 总览入口与运行监控共用当前实时快照，避免导航项落入通配回退。 */}
            <Route path="/dashboard" element={<CapabilityPage path="/dashboard">{(capabilities) => <MonitorPage capabilities={capabilities} />}</CapabilityPage>} />
            {/* 用户页使用同一份账号能力控制页面内的增删改查操作。 */}
            <Route path="/users" element={<CapabilityPage path="/users">{(capabilities) => <UsersPage capabilities={capabilities} />}</CapabilityPage>} />
            <Route path="/roles" element={<CapabilityPage path="/roles"><RolesPage /></CapabilityPage>} />
            <Route path="/departments" element={<CapabilityPage path="/departments"><DepartmentsPage /></CapabilityPage>} />
            <Route path="/posts" element={<CapabilityPage path="/posts"><PostsPage /></CapabilityPage>} />
            <Route path="/menus" element={<CapabilityPage path="/menus"><MenusPage /></CapabilityPage>} />
            <Route path="/api-keys" element={<CapabilityPage path="/api-keys"><ApiKeysPage /></CapabilityPage>} />
            <Route path="/audit/operations" element={<CapabilityPage path="/audit/operations"><OperationsAuditPage /></CapabilityPage>} />
            <Route path="/audit/login" element={<CapabilityPage path="/audit/login"><LoginLogsPage /></CapabilityPage>} />
            <Route path="/jobs" element={<CapabilityPage path="/jobs"><JobsPage /></CapabilityPage>} />
            <Route path="/configs" element={<CapabilityPage path="/configs"><ConfigsPage /></CapabilityPage>} />
            <Route path="/dictionaries" element={<CapabilityPage path="/dictionaries"><DictionariesPage /></CapabilityPage>} />
            <Route path="/notices" element={<CapabilityPage path="/notices"><NoticesPage /></CapabilityPage>} />
            <Route path="/profile" element={<CapabilityPage path="/profile"><ProfilePage /></CapabilityPage>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/monitor" replace />} />
      </Routes>
    </Suspense>
  )
}
