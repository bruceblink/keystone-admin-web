import { Fragment, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Bell, BookOpen, BriefcaseBusiness, Building2, ChevronDown, FileClock, FileText, KeyRound, ListChecks, ListTree, LogOut, Megaphone, Menu, Settings2, ShieldCheck, UserRoundCog, UsersRound, X } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../../shared/state/session'
import { apiClient } from '../../shared/api/client'
import { canAccessCapabilityPage } from '../../shared/auth/capabilityRules'
import { CapabilitiesContent } from '../../shared/auth/CapabilitiesRoutes'
import { useCapabilities } from '../../shared/auth/useCapabilities'
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

export function AdminShell({ capabilitiesQuery }: { capabilitiesQuery: ReturnType<typeof useCapabilities> }) {
  const capabilities = capabilitiesQuery.isError ? undefined : capabilitiesQuery.data
  const user = useSessionStore((state) => state.user)
  const logout = useSessionStore((state) => state.logout)
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  // 通知页码进入查询键，翻页后不会把上一页数据当作当前页内容。
  const [notificationPage, setNotificationPage] = useState(1)
  // 跨页请求尚未返回时，铃铛继续显示当前账号最近一次读取的未读总数。
  const [lastKnownUnread, setLastKnownUnread] = useState({ username: user?.username, count: 0 })
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const notificationsQuery = useQuery({ queryKey: ['notifications', user?.username, notificationPage], queryFn: () => apiClient.listNotificationsPage(notificationPage), staleTime: 30_000, refetchInterval: 30_000 })
  const readNotification = useMutation({ mutationFn: (id: string) => apiClient.readNotification(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.username] }) })
  const currentUnreadCount = notificationsQuery.data?.unreadCount
  const unreadCount = currentUnreadCount
    ?? (lastKnownUnread.username === user?.username ? lastKnownUnread.count : 0)
  const visibleNavItems = capabilities ? navItems.filter((item) => item.external || canAccessCapabilityPage(item.to, capabilities)) : []

  useEffect(() => {
    if (currentUnreadCount !== undefined) {
      setLastKnownUnread({ username: user?.username, count: currentUnreadCount })
    }
  }, [currentUnreadCount, user?.username])

  async function handleLogout() {
    await logout()
  }

  function toggleNotifications() {
    setNotificationOpen((open) => !open)
    setSelectedNotificationId(null)
    readNotification.reset()
    if (!notificationOpen) {
      setNotificationPage(1)
      void queryClient.invalidateQueries({ queryKey: ['notifications', user?.username, 1] })
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head"><div className="brand-mark"><Activity size={18} /></div><div><strong>KEYSTONE</strong><span>Admin Console</span></div><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={20} /></button></div>
        <nav className="primary-nav" aria-label="主导航">
          {visibleNavItems.map(({ to, label, icon: Icon, external }, index) => <Fragment key={to}>{to.startsWith('/audit/') && !visibleNavItems[index - 1]?.to.startsWith('/audit/') ? <p className="nav-label nav-label-spaced">运维审计</p> : null}{external ? <a href={to} target="_blank" rel="noreferrer" onClick={() => setMobileOpen(false)} className="nav-item"><Icon size={17} /><span>{label}</span></a> : <NavLink to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}><Icon size={17} /><span>{label}</span></NavLink>}</Fragment>)}
        </nav>
        <div className="sidebar-foot"><div className="status-dot"><span /> API 正常</div><span className="sidebar-version">v0.1.0 · dev</span></div>
      </aside>
      {mobileOpen ? <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} /> : null}
      <div className="shell-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
          <div className="topbar-context"><span className="context-kicker">Keystone</span><span className="context-separator">/</span></div>
          <div className="topbar-actions"><div className="notification-menu"><button className="icon-button" type="button" aria-label={unreadCount ? `通知，${unreadCount} 条未读` : '通知'} aria-expanded={notificationOpen} onClick={toggleNotifications}><Bell size={18} />{unreadCount ? <span className="notification-dot" /> : null}</button>{notificationOpen ? <NotificationPopover notices={notificationsQuery.data?.items ?? []} page={notificationPage} hasMore={notificationsQuery.data?.hasMore ?? false} loading={notificationsQuery.isLoading} error={!notificationsQuery.data && notificationsQuery.isError ? '无法读取站内通知' : null} refreshError={notificationsQuery.data && notificationsQuery.isError ? '通知刷新失败' : null} selected={notificationsQuery.data?.items.find((notice) => notice.id === selectedNotificationId) ?? null} readError={readNotification.isError ? '无法标记已读，请重试' : null} onSelect={(notice) => { setSelectedNotificationId(notice.id); if (!notice.readAt || readNotification.isError) readNotification.mutate(notice.id) }} onBack={() => { setSelectedNotificationId(null); readNotification.reset() }} onPageChange={(page) => { setNotificationPage(page); setSelectedNotificationId(null); readNotification.reset() }} onRetry={() => void notificationsQuery.refetch()} onClose={() => { setNotificationOpen(false); setSelectedNotificationId(null); readNotification.reset() }} /> : null}</div>{capabilities && canAccessCapabilityPage('/profile', capabilities) ? <button className="user-menu user-menu-button" type="button" aria-label="打开个人资料" onClick={() => navigate('/profile')}><div className="avatar">{user?.displayName.slice(0, 1) ?? 'U'}</div><div className="user-copy"><strong>{user?.displayName ?? '未登录'}</strong><span>{user?.role ?? '管理员'}</span></div><ChevronDown size={15} /></button> : null}{/* 移动端隐藏文字时仍提供退出按钮名称。 */}<Button variant="ghost" size="sm" className="logout-button" aria-label="退出" onClick={handleLogout}><LogOut size={16} /><span>退出</span></Button></div>
        </header>
        <main className="shell-main"><CapabilitiesContent query={capabilitiesQuery} /></main>
      </div>
    </div>
  )
}
