import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AdminShell } from '../widgets/layout/AdminShell'
import { LoginPage } from '../pages/login/LoginPage'
import { MonitorPage } from '../pages/monitor/MonitorPage'
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
          <Route path="*" element={<MonitorPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/monitor" replace />} />
    </Routes>
  )
}
