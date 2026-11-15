import { useState } from 'react'
import { Activity, Bell, BookOpen, BriefcaseBusiness, Building2, ChevronDown, FileClock, KeyRound, LayoutDashboard, ListChecks, ListTree, LogOut, Megaphone, Menu, Settings2, ShieldCheck, UserRoundCog, UsersRound, X } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../../shared/state/session'
import { Button } from '../../shared/ui'

const navItems = [
  { to: '/monitor', label: '运行监控', icon: Activity },
  { to: '/dashboard', label: '总览仪表盘', icon: LayoutDashboard },
  { to: '/users', label: '用户与权限', icon: UsersRound },
  { to: '/roles', label: '角色管理', icon: UserRoundCog },
  { to: '/departments', label: '组织结构', icon: Building2 },
  { to: '/posts', label: '岗位管理', icon: BriefcaseBusiness },
  { to: '/menus', label: '菜单与权限', icon: ListTree },
  { to: '/api-keys', label: 'API Key', icon: KeyRound },
  { to: '/audit/operations', label: '操作审计', icon: ShieldCheck },
  { to: '/audit/login', label: '登录日志', icon: FileClock },
  { to: '/jobs', label: '定时任务', icon: ListChecks },
  { to: '/configs', label: '系统配置', icon: Settings2 },
  { to: '/dictionaries', label: '字典管理', icon: BookOpen },
  { to: '/notices', label: '通知公告', icon: Megaphone },
]

export function AdminShell() {
  const user = useSessionStore((state) => state.user)
  const logout = useSessionStore((state) => state.logout)
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await logout()
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head"><div className="brand-mark"><Activity size={18} /></div><div><strong>KEYSTONE</strong><span>Admin Console</span></div><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={20} /></button></div>
        <nav className="primary-nav" aria-label="主导航">
          <p className="nav-label">工作台</p>
          {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}><Icon size={17} /><span>{label}</span></NavLink>)}
          <p className="nav-label nav-label-spaced">系统</p>
        </nav>
        <div className="sidebar-foot"><div className="status-dot"><span /> API 正常</div><span className="sidebar-version">v0.1.0 · dev</span></div>
      </aside>
      {mobileOpen ? <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} /> : null}
      <div className="shell-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
          <div className="topbar-context"><span className="context-kicker">Keystone</span><span className="context-separator">/</span><span>管理工作台</span></div>
          <div className="topbar-actions"><button className="icon-button" type="button" aria-label="通知" onClick={() => navigate('/notices')}><Bell size={18} /><span className="notification-dot" /></button><button className="user-menu user-menu-button" type="button" aria-label="打开个人资料" onClick={() => navigate('/profile')}><div className="avatar">{user?.displayName.slice(0, 1) ?? 'U'}</div><div className="user-copy"><strong>{user?.displayName ?? '未登录'}</strong><span>{user?.role ?? '管理员'}</span></div><ChevronDown size={15} /></button><Button variant="ghost" size="sm" className="logout-button" onClick={handleLogout}><LogOut size={16} /><span>退出</span></Button></div>
        </header>
        <main className="shell-main"><Outlet /></main>
      </div>
    </div>
  )
}
