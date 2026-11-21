import { create } from 'zustand'
import { apiClient, clearLocalAuthentication, setAccessTokenRefreshedHandler, setSessionExpiredHandler } from '../api/client'
import { queryClient } from '../query/queryClient'
import type { User } from '../api/schemas'

type SessionState = {
  user: User | null
  isHydrated: boolean
  authRevision: number
  sessionRevision: number
  message: string | null
  pendingActionNotice: { username: string; sessionRevision: number; message: string } | null
  login: (username: string, password: string, forceLogin?: boolean) => Promise<void>
  verifyMfaLogin: (username: string, challengeId: string, clientId: string, code: string, forceLogin?: boolean) => Promise<void>
  restore: () => Promise<void>
  logout: () => Promise<void>
  clearSession: (message: string) => void
  clearMessage: () => void
  setPendingActionNotice: (message: string, owner?: { username: string; sessionRevision: number }) => void
  dismissPendingActionNotice: () => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  isHydrated: false,
  authRevision: 0,
  sessionRevision: 0,
  message: null,
  pendingActionNotice: null,
  login: async (username, password, forceLogin = false) => {
    const result = await apiClient.login(username, password, forceLogin)
    set((state) => ({ user: result.user, message: null, pendingActionNotice: null, authRevision: state.authRevision + 1, sessionRevision: state.sessionRevision + 1 }))
  },
  verifyMfaLogin: async (username, challengeId, clientId, code, forceLogin = false) => {
    const result = await apiClient.verifyMfaLogin(username, challengeId, clientId, code, forceLogin)
    set((state) => ({ user: result.user, message: null, pendingActionNotice: null, authRevision: state.authRevision + 1, sessionRevision: state.sessionRevision + 1 }))
  },
  restore: async () => {
    const user = await apiClient.restoreSession()
    set((state) => ({ user, isHydrated: true, authRevision: state.authRevision + 1, sessionRevision: state.sessionRevision + 1 }))
  },
  logout: async () => {
    let message = '会话已退出'
    try {
      await apiClient.logout()
    } catch {
      // 本地会话已清除，但服务端会话可能仍然有效。
      message = '本地已退出，但无法确认服务端会话已关闭；再次登录时可能需要强制登录。'
    }
    queryClient.clear()
    set((state) => ({ user: null, message, pendingActionNotice: null, authRevision: state.authRevision + 1, sessionRevision: state.sessionRevision + 1 }))
  },
  clearSession: (message) => {
    clearLocalAuthentication()
    queryClient.clear()
    set((state) => ({ user: null, message, pendingActionNotice: null, authRevision: state.authRevision + 1, sessionRevision: state.sessionRevision + 1 }))
  },
  clearMessage: () => set({ message: null }),
  setPendingActionNotice: (message, owner) => {
    const current = get()
    const noticeOwner = owner ?? (current.user ? {
      username: current.user.username,
      sessionRevision: current.sessionRevision,
    } : null)
    if (!noticeOwner) return
    set((state) => {
      if (state.user?.username !== noticeOwner.username || state.sessionRevision !== noticeOwner.sessionRevision) return {}
      return { pendingActionNotice: { ...noticeOwner, message } }
    })
  },
  dismissPendingActionNotice: () => set({ pendingActionNotice: null }),
}))

setSessionExpiredHandler(() => {
  queryClient.clear()
  useSessionStore.setState((state) => ({ user: null, isHydrated: true, message: '会话已失效，请重新登录', pendingActionNotice: null, authRevision: state.authRevision + 1, sessionRevision: state.sessionRevision + 1 }))
})

setAccessTokenRefreshedHandler(() => {
  // 静默刷新令牌后更换能力查询键，防止继续使用可能已变化的旧授权。
  useSessionStore.setState((state) => ({ authRevision: state.authRevision + 1 }))
})
