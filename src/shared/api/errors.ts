/**
 * API 服务端错误码目录。
 * 每个服务端错误码只表示一个业务条件；HTTP 状态码只描述传输结果。
 */
export const SERVER_ERROR_CODES = [
  'authentication_required', 'invalid_credentials', 'invalid_credential', 'mfa_required',
  'mfa_step_up_required', 'mfa_invalid_code', 'mfa_challenge_invalid', 'active_session_conflict',
  'permission_denied', 'data_scope_denied', 'session_revoked', 'resource_not_found',
  'resource_conflict', 'rate_limited', 'precondition_required', 'payload_too_large',
  'service_unavailable', 'authorization_unavailable', 'internal_error', 'validation_failed',
] as const

/** 客户端本地错误码，不应与后端业务错误码混用。 */
export const CLIENT_ERROR_CODES = [
  'network_error', 'invalid_response', 'mfa_step_up_in_progress', 'mfa_step_up_cancelled',
] as const

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number]
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number]
export type ApiErrorCode = ServerErrorCode | ClientErrorCode | (string & {})
export type ApiErrorSource = 'server' | 'client'
export type ApiErrorMetadata = {
  source?: ApiErrorSource
  requestId?: string
  details?: unknown
  fields?: Record<string, unknown>
  retryAfterSeconds?: number
}

const clientErrorCodeSet = new Set<string>(CLIENT_ERROR_CODES)

export function isClientErrorCode(code: string | undefined): code is ClientErrorCode {
  return code !== undefined && clientErrorCodeSet.has(code)
}

export function isActiveSessionConflict(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false
  // 409 兼容旧后端；新后端必须返回唯一的 active_session_conflict。
  return error.code === 'active_session_conflict' || (!error.code && error.status === 409)
}

const errorMessages: Record<string, string> = {
  authentication_required: '请先登录后再继续操作', invalid_credentials: '用户名或密码错误',
  invalid_credential: '认证信息无效，请重新登录', mfa_required: '需要完成二次认证',
  mfa_step_up_required: '需要完成二次认证后才能继续', mfa_invalid_code: '验证码错误，请重试',
  mfa_challenge_invalid: '二次认证请求已失效，请重新开始', active_session_conflict: '该账号已经在其他位置登录',
  permission_denied: '没有执行此操作的权限', data_scope_denied: '当前账号没有访问这些数据的权限',
  session_revoked: '当前会话已失效，请重新登录', resource_not_found: '请求的资源不存在',
  resource_conflict: '当前资源状态不允许此操作', rate_limited: '操作过于频繁，请稍后重试',
  precondition_required: '请先完成账号安全设置', payload_too_large: '提交的数据过大，请缩小后重试',
  service_unavailable: '系统服务暂时不可用，请稍后重试', authorization_unavailable: '认证服务暂时不可用，请稍后重试',
  internal_error: '系统处理失败，请稍后重试', validation_failed: '提交的数据无效，请检查后重试',
  network_error: '无法连接系统 API', invalid_response: '系统 API 返回了无效响应',
  mfa_step_up_in_progress: '已有 MFA 验证请求正在处理', mfa_step_up_cancelled: 'MFA 验证已取消',
}

/** 返回安全的页面提示，诊断信息通过 ApiError.code/requestId 单独保留。 */
export function formatApiError(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (error instanceof ApiError) {
    const mapped = error.code ? errorMessages[error.code] : undefined
    if (mapped) return mapped
    return error.source === 'client' ? fallback : error.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

/** 为错误面板提供可复制的稳定诊断标识。 */
export function errorDiagnostic(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const parts = [error.code, error.requestId ? `requestId=${error.requestId}` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Native API 调用错误；保留 HTTP 状态和业务错误码供页面决定反馈方式。 */
export class ApiError extends Error {
  readonly source: ApiErrorSource
  readonly code?: ApiErrorCode
  readonly data?: unknown
  readonly requestId?: string
  readonly details?: unknown
  readonly fields?: Record<string, unknown>
  readonly retryAfterSeconds?: number

  constructor(message: string, readonly status: number, code?: string, data?: unknown, metadata: ApiErrorMetadata = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.data = data
    this.source = metadata.source ?? (isClientErrorCode(code) ? 'client' : 'server')
    this.requestId = metadata.requestId
    this.details = metadata.details
    this.fields = metadata.fields
    this.retryAfterSeconds = metadata.retryAfterSeconds
  }
}
