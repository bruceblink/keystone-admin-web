import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DefaultError, QueryKey, UseQueryOptions, UseQueryResult } from '@tanstack/react-query'
import { useSessionStore } from '../state/session'
import type { NativeCapabilities } from '../api/schemas'

export type CapabilityAvailability = { available: boolean; cacheScope: string }

/** 标记当前路由的权限是否已重新确认，并提供本次授权范围的缓存版本。 */
export const CapabilityAvailabilityContext = createContext<CapabilityAvailability>({ available: true, cacheScope: 'unscoped' })

/** 每次服务端重新确认都创建新缓存代次，覆盖响应未包含的数据范围变化。 */
export function capabilitiesCacheScope(capabilities: NativeCapabilities | undefined, confirmedVersion: number): string {
  if (!capabilities) return `unconfirmed:${confirmedVersion}`
  const permissions = [...capabilities.permissions].sort()
  const resources = Object.entries(capabilities.resources).sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify([confirmedVersion, permissions, resources])
}

/** 在资源键后附加会话和授权版本，防止旧会话或旧数据范围的结果被复用。 */
export function capabilityScopedQueryKey(queryKey: QueryKey, cacheScope: string): QueryKey {
  return [...queryKey, { capabilityScope: cacheScope }]
}

/** 识别本功能添加的缓存范围标记，便于确认权限后清理旧范围缓存。 */
export function isCapabilityScopedQueryKey(queryKey: QueryKey): boolean {
  const scope = queryKey.at(-1)
  return typeof scope === 'object' && scope !== null && 'capabilityScope' in scope
}

/** 返回资源查询键记录的登录人和授权版本。 */
export function getCapabilityQueryScope(queryKey: QueryKey): string | null {
  const scope = queryKey.at(-1)
  if (typeof scope !== 'object' || scope === null || !('capabilityScope' in scope)) return null
  return typeof scope.capabilityScope === 'string' ? scope.capabilityScope : null
}

/** 组合会话代次和服务端授权读取时间，隔离不可见的数据范围变化。 */
export function sessionCapabilityScope(username: string | null, authRevision: number, cacheScope: string): string {
  return JSON.stringify([username, authRevision, cacheScope])
}

/** 隐藏受保护页面时暂停新查询，并保留已有查询结果供授权恢复后使用。 */
export function useCapabilityQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
>(options: UseQueryOptions<TQueryFnData, TError, TData, QueryKey>): UseQueryResult<TData, TError> {
  const availability = useContext(CapabilityAvailabilityContext)
  const username = useSessionStore((state) => state.user?.username ?? null)
  const authRevision = useSessionStore((state) => state.authRevision)
  const requestedEnabled = options.enabled
  const cacheScope = sessionCapabilityScope(username, authRevision, availability.cacheScope)

  return useQuery({
    ...options,
    queryKey: capabilityScopedQueryKey(options.queryKey, cacheScope),
    enabled: (query) => availability.available && (typeof requestedEnabled === 'function' ? requestedEnabled(query) : requestedEnabled ?? true),
  })
}
