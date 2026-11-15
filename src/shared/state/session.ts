import { create } from 'zustand'
import { apiClient, setSessionExpiredHandler } from '../api/client'
import { queryClient } from '../query/queryClient'
import type { User } from '../api/schemas'

type SessionState = {
  user: User | null
  isHydrated: boolean
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
  message: null,
  login: async (username, password, forceLogin = false) => {
    const result = await apiClient.login(username, password, forceLogin)
    set({ user: result.user, message: null })
  },
  verifyMfaLogin: async (username, challengeId, clientId, code, forceLogin = false) => {
    const result = await apiClient.verifyMfaLogin(username, challengeId, clientId, code, forceLogin)
    set({ user: result.user, message: null })
  },
  restore: async () => {
    const user = await apiClient.restoreSession()
    set({ user, isHydrated: true })
  },
  logout: async () => {
    await apiClient.logout()
    queryClient.clear()
    set({ user: null, message: '会话已退出' })
  },
  clearSession: (message) => {
    queryClient.clear()
    set({ user: null, message })
  },
  clearMessage: () => set({ message: null }),
}))

setSessionExpiredHandler(() => {
  queryClient.clear()
  useSessionStore.setState({ user: null, isHydrated: true, message: '会话已失效，请重新登录' })
})
