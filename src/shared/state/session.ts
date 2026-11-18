import { create } from 'zustand'
import { apiClient, setAccessTokenRefreshedHandler, setSessionExpiredHandler } from '../api/client'
import { queryClient } from '../query/queryClient'
import type { User } from '../api/schemas'

type SessionState = {
  user: User | null
  isHydrated: boolean
  authRevision: number
  message: string | null
  login: (username: string, password: string, forceLogin?: boolean) => Promise<void>
  verifyMfaLogin: (username: string, challengeId: string, clientId: string, code: string, forceLogin?: boolean) => Promise<void>
  restore: () => Promise<void>
  logout: () => Promise<void>
  clearSession: (message: string) => void
  clearMessage: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  isHydrated: false,
  authRevision: 0,
  message: null,
  login: async (username, password, forceLogin = false) => {
    const result = await apiClient.login(username, password, forceLogin)
    set((state) => ({ user: result.user, message: null, authRevision: state.authRevision + 1 }))
  },
  verifyMfaLogin: async (username, challengeId, clientId, code, forceLogin = false) => {
    const result = await apiClient.verifyMfaLogin(username, challengeId, clientId, code, forceLogin)
    set((state) => ({ user: result.user, message: null, authRevision: state.authRevision + 1 }))
  },
  restore: async () => {
    const user = await apiClient.restoreSession()
    set((state) => ({ user, isHydrated: true, authRevision: state.authRevision + 1 }))
  },
  logout: async () => {
    await apiClient.logout()
    queryClient.clear()
    set((state) => ({ user: null, message: '会话已退出', authRevision: state.authRevision + 1 }))
  },
  clearSession: (message) => {
    queryClient.clear()
    set((state) => ({ user: null, message, authRevision: state.authRevision + 1 }))
  },
  clearMessage: () => set({ message: null }),
}))

setSessionExpiredHandler(() => {
  queryClient.clear()
  useSessionStore.setState((state) => ({ user: null, isHydrated: true, message: '会话已失效，请重新登录', authRevision: state.authRevision + 1 }))
})

setAccessTokenRefreshedHandler(() => {
  // 静默刷新令牌后更换能力查询键，防止继续使用可能已变化的旧授权。
  useSessionStore.setState((state) => ({ authRevision: state.authRevision + 1 }))
})
