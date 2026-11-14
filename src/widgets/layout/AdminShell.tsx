import { useState } from 'react'
import { Activity, Bell, Building2, ChevronDown, FileClock, KeyRound, LayoutDashboard, ListChecks, ListTree, LogOut, Menu, Settings2, ShieldCheck, UserRoundCog, UsersRound, X } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useSessionStore } from '../../shared/state/session'
import { Button } from '../../shared/ui'

const navItems = [
  { to: '/monitor', label: '运行监控', icon: Activity },
  { to: '/dashboard', label: '总览仪表盘', icon: LayoutDashboard },
  { to: '/users', label: '用户与权限', icon: UsersRound },
  { to: '/roles', label: '角色管理', icon: UserRoundCog },
  { to: '/departments', label: '组织结构', icon: Building2 },
  { to: '/menus', label: '菜单与权限', icon: ListTree },
  { to: '/api-keys', label: 'API Key', icon: KeyRound },
  { to: '/audit/operations', label: '操作审计', icon: ShieldCheck },
  { to: '/audit/login', label: '登录日志', icon: FileClock },
  { to: '/jobs', label: '定时任务', icon: ListChecks },
]

export function AdminShell() {
  const user = useSessionStore((state) => state.user)
  const logout = useSessionStore((state) => state.logout)
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await logout()
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head"><div className="brand-mark"><Activity size={18} /></div><div><strong>KEYSTONE</strong><span>Native Admin</span></div><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={20} /></button></div>
        <nav className="primary-nav" aria-label="主导航">
          <p className="nav-label">工作台</p>
          {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}><Icon size={17} /><span>{label}</span></NavLink>)}
          <p className="nav-label nav-label-spaced">系统</p>
          <button className="nav-item nav-item-disabled" type="button" disabled><Settings2 size={17} /><span>系统设置</span><small>即将推出</small></button>
        </nav>
        <div className="sidebar-foot"><div className="status-dot"><span /> Native API 正常</div><span className="sidebar-version">v0.1.0 · dev</span></div>
      </aside>
      {mobileOpen ? <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} /> : null}
      <div className="shell-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
          <div className="topbar-context"><span className="context-kicker">Keystone Native</span><span className="context-separator">/</span><span>管理工作台</span></div>
          <div className="topbar-actions"><button className="icon-button" type="button" aria-label="通知"><Bell size={18} /><span className="notification-dot" /></button><div className="user-menu"><div className="avatar">{user?.displayName.slice(0, 1) ?? 'U'}</div><div className="user-copy"><strong>{user?.displayName ?? '未登录'}</strong><span>{user?.role ?? '管理员'}</span></div><ChevronDown size={15} /></div><Button variant="ghost" size="sm" className="logout-button" onClick={handleLogout}><LogOut size={16} /><span>退出</span></Button></div>
        </header>
        <main className="shell-main"><Outlet /></main>
      </div>
    </div>
  )
}
