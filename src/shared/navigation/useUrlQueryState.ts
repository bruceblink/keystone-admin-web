import { useCallback, useEffect, useState } from 'react'

type QueryState = Record<string, string | number>

type Options = {
  /** 给页面查询参数加前缀，避免不同页面之间复用同名参数。 */
  namespace: string
}

function readState<T extends QueryState>(defaults: T, options: Options): T {
  if (typeof window === 'undefined') return defaults
  const params = new URLSearchParams(window.location.search)
  const state = { ...defaults }
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = params.get(`${options.namespace}_${key}`)
    if (value === null || value === '') continue
    if (typeof fallback === 'number') {
      const parsed = parseNumericQueryValue(value, fallback)
      if (parsed !== null) state[key as keyof T] = parsed as T[keyof T]
    } else {
      state[key as keyof T] = value as T[keyof T]
    }
  }
  return state
}

function parseNumericQueryValue(value: string, fallback: number): number | null {
  const parsed = Number(value)
  // 页面分页参数必须是正整数；非法深链接回退到安全的默认页，避免把负数或小数传给后端。
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) return fallback >= 1 ? fallback : null
  return parsed
}

function writeState<T extends QueryState>(state: T, defaults: T, options: Options) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const [key, fallback] of Object.entries(defaults)) {
    const queryKey = `${options.namespace}_${key}`
    const value = state[key]
    if (value === fallback || value === '' || value === null || value === undefined) {
      url.searchParams.delete(queryKey)
    } else {
      url.searchParams.set(queryKey, String(value))
    }
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

/**
 * 保存管理页面的筛选和分页状态。
 * 页面刷新、复制链接或浏览器前进后退时可以恢复同一组查询条件。
 */
export function useUrlQueryState<T extends QueryState>(defaults: T, options: Options) {
  const [state, setState] = useState<T>(() => readState(defaults, options))

  useEffect(() => {
    const onPopState = () => setState(readState(defaults, options))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [defaults, options])

  const update = useCallback((patch: Partial<T>) => {
    setState((current) => {
      const next = { ...current, ...patch } as T
      writeState(next, defaults, options)
      return next
    })
  }, [defaults, options])

  return [state, update] as const
}
