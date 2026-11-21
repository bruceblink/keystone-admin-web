import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useSessionStore } from '../state/session'

/** 能力数据按登录代次和账号隔离；页面恢复焦点时始终重新向服务端核对。 */
export function useCapabilities() {
  const username = useSessionStore((state) => state.user?.username ?? null)
  const authRevision = useSessionStore((state) => state.authRevision)

  return useQuery({
    queryKey: ['auth', 'capabilities', authRevision, username],
    queryFn: () => apiClient.getCapabilities(),
    enabled: username !== null,
    staleTime: 0,
    retry: false,
    // 外壳和当前页面会订阅同一份权限；仅首次读取和显式焦点/网络恢复触发刷新。
    refetchOnMount: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  })
}
