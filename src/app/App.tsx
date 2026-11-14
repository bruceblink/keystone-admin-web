import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AdminShell } from '../widgets/layout/AdminShell'
import { LoginPage } from '../pages/login/LoginPage'
import { MonitorPage } from '../pages/monitor/MonitorPage'
import { UsersPage } from '../pages/users/UsersPage'
import { OperationsAuditPage } from '../pages/audit/OperationsAuditPage'
import { DepartmentsPage } from '../pages/departments/DepartmentsPage'
import { RolesPage } from '../pages/roles/RolesPage'
import { MenusPage } from '../pages/menus/MenusPage'
import { ApiKeysPage } from '../pages/api-keys/ApiKeysPage'
import { LoginLogsPage } from '../pages/audit/LoginLogsPage'
import { JobsPage } from '../pages/jobs/JobsPage'
import { ConfigsPage } from '../pages/configs/ConfigsPage'
import { DictionariesPage } from '../pages/dictionaries/DictionariesPage'
import { NoticesPage } from '../pages/notices/NoticesPage'
import { useSessionStore } from '../shared/state/session'
import { Spinner } from '../shared/ui'

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<ProtectedLayout />}>
          <Route index element={<Navigate to="/monitor" replace />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/departments" element={<DepartmentsPage />} />
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
  )
}
