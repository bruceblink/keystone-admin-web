import { create } from 'zustand'
import { apiClient } from '../api/client'
import type { User } from '../api/schemas'

type SessionState = {
  user: User | null
  isHydrated: boolean
  message: string | null
  login: (username: string, password: string) => Promise<void>
  verifyMfaLogin: (username: string, challengeId: string, clientId: string, code: string) => Promise<void>
  restore: () => Promise<void>
  logout: () => Promise<void>
  clearSession: (message: string) => void
  clearMessage: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  isHydrated: false,
  message: null,
  login: async (username, password) => {
    const result = await apiClient.login(username, password)
    set({ user: result.user, message: null })
  },
  verifyMfaLogin: async (username, challengeId, clientId, code) => {
    const result = await apiClient.verifyMfaLogin(username, challengeId, clientId, code)
    set({ user: result.user, message: null })
  },
  restore: async () => {
    const user = await apiClient.restoreSession()
    set({ user, isHydrated: true })
  },
  logout: async () => {
    await apiClient.logout()
    set({ user: null, message: '会话已退出' })
  },
  clearSession: (message) => set({ user: null, message }),
  clearMessage: () => set({ message: null }),
}))
