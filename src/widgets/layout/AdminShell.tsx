import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Bell, BookOpen, BriefcaseBusiness, Building2, ChevronDown, FileClock, FileText, KeyRound, ListChecks, ListTree, LogOut, Megaphone, Menu, Settings2, ShieldCheck, UserRoundCog, UsersRound, X } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../../shared/state/session'
import { apiClient } from '../../shared/api/client'
import { Button } from '../../shared/ui'
import { NotificationPopover } from './NotificationPopover'

const navItems = [
  { to: '/monitor', label: '运行监控', icon: Activity },
  { to: '/users', label: '用户与权限', icon: UsersRound },
  { to: '/roles', label: '角色管理', icon: UserRoundCog },
  { to: '/departments', label: '组织结构', icon: Building2 },
  { to: '/posts', label: '岗位管理', icon: BriefcaseBusiness },
  { to: '/menus', label: '菜单与权限', icon: ListTree },
  { to: '/api-keys', label: 'API Key', icon: KeyRound },
  { to: '/api/swagger', label: '接口文档', icon: FileText, external: true },
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
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null)
  const notificationsQuery = useQuery({ queryKey: ['public-notifications'], queryFn: () => apiClient.listPublicNotices(), staleTime: 30_000 })

  async function handleLogout() {
    await logout()
  }

  function toggleNotifications() {
    setNotificationOpen((open) => !open)
    setSelectedNotificationId(null)
    if (notificationsQuery.isError) void notificationsQuery.refetch()
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head"><div className="brand-mark"><Activity size={18} /></div><div><strong>KEYSTONE</strong><span>Admin Console</span></div><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={20} /></button></div>
        <nav className="primary-nav" aria-label="主导航">
          {navItems.map(({ to, label, icon: Icon, external }) => <Fragment key={to}>{to === '/audit/operations' ? <p className="nav-label nav-label-spaced">运维审计</p> : null}{external ? <a href={to} target="_blank" rel="noreferrer" onClick={() => setMobileOpen(false)} className="nav-item"><Icon size={17} /><span>{label}</span></a> : <NavLink to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}><Icon size={17} /><span>{label}</span></NavLink>}</Fragment>)}
        </nav>
        <div className="sidebar-foot"><div className="status-dot"><span /> API 正常</div><span className="sidebar-version">v0.1.0 · dev</span></div>
      </aside>
      {mobileOpen ? <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} /> : null}
      <div className="shell-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
          <div className="topbar-context"><span className="context-kicker">Keystone</span><span className="context-separator">/</span><span>管理工作台</span></div>
          <div className="topbar-actions"><div className="notification-menu"><button className="icon-button" type="button" aria-label="通知" aria-expanded={notificationOpen} onClick={toggleNotifications}><Bell size={18} />{notificationsQuery.data?.length ? <span className="notification-dot" /> : null}</button>{notificationOpen ? <NotificationPopover notices={notificationsQuery.data ?? []} loading={notificationsQuery.isLoading} error={notificationsQuery.error instanceof Error ? notificationsQuery.error.message : notificationsQuery.isError ? '无法读取站内通知' : null} selected={notificationsQuery.data?.find((notice) => notice.id === selectedNotificationId) ?? null} onSelect={(notice) => setSelectedNotificationId(notice.id)} onBack={() => setSelectedNotificationId(null)} onRetry={() => void notificationsQuery.refetch()} onClose={() => { setNotificationOpen(false); setSelectedNotificationId(null) }} /> : null}</div><button className="user-menu user-menu-button" type="button" aria-label="打开个人资料" onClick={() => navigate('/profile')}><div className="avatar">{user?.displayName.slice(0, 1) ?? 'U'}</div><div className="user-copy"><strong>{user?.displayName ?? '未登录'}</strong><span>{user?.role ?? '管理员'}</span></div><ChevronDown size={15} /></button><Button variant="ghost" size="sm" className="logout-button" onClick={handleLogout}><LogOut size={16} /><span>退出</span></Button></div>
        </header>
        <main className="shell-main"><Outlet /></main>
      </div>
    </div>
  )
}
