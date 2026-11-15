import { QueryClient } from '@tanstack/react-query'

// 统一管理页面查询缓存，退出时清理，避免下一个账号短暂看到上一个账号的数据。
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})
