const DEFAULT_RETURN_PATH = '/monitor'
const RETURN_PATH_BASE = 'http://keystone.local'

type ReturnLocation = {
  pathname?: unknown
  search?: unknown
  hash?: unknown
}

// 只接受本站内部且结构完整的返回地址，避免登录后的导航被伪造成外部跳转。
export function getSafeReturnPath(state: unknown): string {
  if (!state || typeof state !== 'object' || !('from' in state)) return DEFAULT_RETURN_PATH

  const from = (state as { from?: unknown }).from
  if (!from || typeof from !== 'object') return DEFAULT_RETURN_PATH

  const { pathname, search, hash } = from as ReturnLocation
  const safeSearch = search ?? ''
  const safeHash = hash ?? ''
  if (
    typeof pathname !== 'string' ||
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    pathname.includes('\\') ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    typeof safeSearch !== 'string' ||
    (safeSearch !== '' && !safeSearch.startsWith('?')) ||
    typeof safeHash !== 'string' ||
    (safeHash !== '' && !safeHash.startsWith('#'))
  ) {
    return DEFAULT_RETURN_PATH
  }

  const candidate = `${pathname}${safeSearch}${safeHash}`
  try {
    const parsed = new URL(candidate, RETURN_PATH_BASE)
    if (
      parsed.origin !== RETURN_PATH_BASE ||
      parsed.pathname !== pathname ||
      parsed.search !== safeSearch ||
      parsed.hash !== safeHash
    ) {
      return DEFAULT_RETURN_PATH
    }
  } catch {
    return DEFAULT_RETURN_PATH
  }

  return candidate
}
