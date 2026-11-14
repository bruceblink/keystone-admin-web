import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AdminShell } from '../widgets/layout/AdminShell'
import { LoginPage } from '../pages/login/LoginPage'
import { useSessionStore } from '../shared/state/session'
import { Spinner } from '../shared/ui'

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

function RequireAuth() {
  const { user, isHydrated } = useSessionStore()
  if (!isHydrated) return <div className="page-center"><Spinner label="正在恢复会话" /></div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function ProtectedLayout() {
  return <AdminShell />
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
            <Route index element={<Navigate to="/monitor" replace />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/menus" element={<MenusPage />} />
            <Route path="/api-keys" element={<ApiKeysPage />} />
            <Route path="/audit/operations" element={<OperationsAuditPage />} />
            <Route path="/audit/login" element={<LoginLogsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/configs" element={<ConfigsPage />} />
            <Route path="/dictionaries" element={<DictionariesPage />} />
            <Route path="/notices" element={<NoticesPage />} />
            <Route path="*" element={<MonitorPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/monitor" replace />} />
      </Routes>
    </Suspense>
  )
}
