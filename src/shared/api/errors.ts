/**
 * API 服务端错误码目录。
 * 每个服务端错误码只表示一个业务条件；HTTP 状态码只描述传输结果。
 */
export const SERVER_ERROR_CODES = [
  'authentication_required', 'invalid_credential', 'mfa_required', 'mfa_step_up_required',
  'mfa_invalid_code', 'mfa_challenge_invalid', 'mfa_state_conflict', 'active_session_conflict',
  'permission_denied', 'data_scope_denied', 'session_revoked', 'resource_not_found',
  'resource_conflict', 'role_has_members', 'role_protected', 'rate_limited', 'precondition_required', 'payload_too_large',
  'https_required', 'service_unavailable', 'authorization_unavailable', 'internal_error',
  'validation_failed', 'username_already_exists', 'username_invalid_format', 'api_key_name_invalid', 'api_key_expiry_invalid', 'api_key_expiry_out_of_range', 'api_key_expired', 'api_key_page_changed', 'api_key_scope_unavailable', 'profile_display_name_required', 'profile_avatar_required', 'password_same_as_current',
  'password_required', 'password_too_short', 'password_disallowed', 'password_contains_username',
  'password_missing_uppercase', 'password_missing_lowercase', 'password_missing_digit', 'password_missing_special',
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

export type BusinessErrorDefinition = {
  httpStatus: number
  meaning: string
  retryable: boolean
  messageKey: string
  safeMessage: boolean
}

export type BusinessErrorLookup = BusinessErrorDefinition & {
  code: ServerErrorCode
}

/** 跨项目业务错误目录；HTTP 状态是默认值，实际响应状态由接口保持现有约定。 */
export const BUSINESS_ERROR_CATALOG: Record<ServerErrorCode, BusinessErrorDefinition> = {
  authentication_required: { httpStatus: 401, meaning: '请求缺少有效认证', retryable: false, messageKey: 'error.authentication_required', safeMessage: true },
  invalid_credential: { httpStatus: 401, meaning: '凭据无效或已过期', retryable: false, messageKey: 'error.invalid_credential', safeMessage: true },
  mfa_required: { httpStatus: 401, meaning: '需要完成多因素认证', retryable: false, messageKey: 'error.mfa_required', safeMessage: true },
  mfa_step_up_required: { httpStatus: 403, meaning: '需要完成当前操作的多因素认证升级', retryable: false, messageKey: 'error.mfa_step_up_required', safeMessage: true },
  mfa_invalid_code: { httpStatus: 401, meaning: '多因素认证验证码无效', retryable: false, messageKey: 'error.mfa_invalid_code', safeMessage: true },
  mfa_challenge_invalid: { httpStatus: 401, meaning: '多因素认证请求无效或已过期', retryable: false, messageKey: 'error.mfa_challenge_invalid', safeMessage: true },
  mfa_state_conflict: { httpStatus: 409, meaning: '多因素认证状态不允许当前操作', retryable: false, messageKey: 'error.mfa_state_conflict', safeMessage: true },
  active_session_conflict: { httpStatus: 409, meaning: '账号已有活动会话', retryable: false, messageKey: 'error.active_session_conflict', safeMessage: true },
  permission_denied: { httpStatus: 403, meaning: '没有执行该操作的权限', retryable: false, messageKey: 'error.permission_denied', safeMessage: true },
  data_scope_denied: { httpStatus: 403, meaning: '没有访问该数据的权限', retryable: false, messageKey: 'error.data_scope_denied', safeMessage: true },
  session_revoked: { httpStatus: 401, meaning: '会话已撤销或失效', retryable: false, messageKey: 'error.session_revoked', safeMessage: true },
  resource_not_found: { httpStatus: 404, meaning: '请求的资源不存在', retryable: false, messageKey: 'error.resource_not_found', safeMessage: true },
  resource_conflict: { httpStatus: 409, meaning: '资源状态或唯一约束发生冲突', retryable: false, messageKey: 'error.resource_conflict', safeMessage: true },
  role_has_members: { httpStatus: 422, meaning: '角色仍有用户成员', retryable: false, messageKey: 'error.role_has_members', safeMessage: true },
  role_protected: { httpStatus: 422, meaning: '管理员角色受到保护', retryable: false, messageKey: 'error.role_protected', safeMessage: true },
  rate_limited: { httpStatus: 429, meaning: '请求频率超过限制', retryable: true, messageKey: 'error.rate_limited', safeMessage: true },
  precondition_required: { httpStatus: 428, meaning: '完成前置条件后才能继续', retryable: false, messageKey: 'error.precondition_required', safeMessage: true },
  payload_too_large: { httpStatus: 413, meaning: '请求内容超过允许大小', retryable: false, messageKey: 'error.payload_too_large', safeMessage: true },
  https_required: { httpStatus: 426, meaning: '请求必须使用 HTTPS', retryable: false, messageKey: 'error.https_required', safeMessage: true },
  service_unavailable: { httpStatus: 503, meaning: '服务暂不可用', retryable: true, messageKey: 'error.service_unavailable', safeMessage: false },
  authorization_unavailable: { httpStatus: 503, meaning: '认证授权状态暂不可用', retryable: true, messageKey: 'error.authorization_unavailable', safeMessage: false },
  internal_error: { httpStatus: 500, meaning: '服务处理失败', retryable: true, messageKey: 'error.internal_error', safeMessage: false },
  validation_failed: { httpStatus: 422, meaning: '请求参数或业务规则校验失败', retryable: false, messageKey: 'error.validation_failed', safeMessage: true },
  username_already_exists: { httpStatus: 422, meaning: '用户名已存在', retryable: false, messageKey: 'error.username_already_exists', safeMessage: true },
  username_invalid_format: { httpStatus: 422, meaning: '用户名格式无效', retryable: false, messageKey: 'error.username_invalid_format', safeMessage: true },
  password_same_as_current: { httpStatus: 422, meaning: '新密码与已验证的当前密码相同', retryable: false, messageKey: 'error.password_same_as_current', safeMessage: true },
  password_required: { httpStatus: 422, meaning: '密码缺失或为空白', retryable: false, messageKey: 'error.password_required', safeMessage: true },
  password_too_short: { httpStatus: 422, meaning: '密码长度未达到要求', retryable: false, messageKey: 'error.password_too_short', safeMessage: true },
  password_disallowed: { httpStatus: 422, meaning: '密码位于禁止列表中', retryable: false, messageKey: 'error.password_disallowed', safeMessage: true },
  password_contains_username: { httpStatus: 422, meaning: '密码包含用户名', retryable: false, messageKey: 'error.password_contains_username', safeMessage: true },
  password_missing_uppercase: { httpStatus: 422, meaning: '密码缺少大写字母', retryable: false, messageKey: 'error.password_missing_uppercase', safeMessage: true },
  password_missing_lowercase: { httpStatus: 422, meaning: '密码缺少小写字母', retryable: false, messageKey: 'error.password_missing_lowercase', safeMessage: true },
  password_missing_digit: { httpStatus: 422, meaning: '密码缺少数字', retryable: false, messageKey: 'error.password_missing_digit', safeMessage: true },
  password_missing_special: { httpStatus: 422, meaning: '密码缺少特殊字符', retryable: false, messageKey: 'error.password_missing_special', safeMessage: true },
  api_key_name_invalid: { httpStatus: 422, meaning: 'API Key 名称缺失或超过 128 个字符', retryable: false, messageKey: 'error.api_key_name_invalid', safeMessage: true },
  profile_display_name_required: { httpStatus: 422, meaning: '个人资料展示名缺失或为空白', retryable: false, messageKey: 'error.profile_display_name_required', safeMessage: true },
  profile_avatar_required: { httpStatus: 422, meaning: '个人资料头像地址缺失或为空白', retryable: false, messageKey: 'error.profile_avatar_required', safeMessage: true },
  api_key_expiry_invalid: { httpStatus: 422, meaning: 'API Key 到期时间格式无效', retryable: false, messageKey: 'error.api_key_expiry_invalid', safeMessage: true },
  api_key_expiry_out_of_range: { httpStatus: 422, meaning: 'API Key 到期时间不在允许范围内', retryable: false, messageKey: 'error.api_key_expiry_out_of_range', safeMessage: true },
  api_key_expired: { httpStatus: 409, meaning: '已过期的 API Key 不能轮换', retryable: false, messageKey: 'error.api_key_expired', safeMessage: true },
  // 分页回退期间数据再次变化时返回 409，客户端重新读取列表后可重试。
  api_key_page_changed: { httpStatus: 409, meaning: 'API Key 分页回退期间结果再次变化，无法确认有效页码', retryable: true, messageKey: 'error.api_key_page_changed', safeMessage: true },
  api_key_scope_unavailable: { httpStatus: 422, meaning: 'API Key 轮换时原授权范围均不再属于持有人', retryable: false, messageKey: 'error.api_key_scope_unavailable', safeMessage: true },
}

/** 通过错误码反查业务含义，未知代码返回 undefined。 */
export function getBusinessErrorDefinition(code: string | undefined): BusinessErrorDefinition | undefined {
  return lookupBusinessError(code)
}

/**
 * 通过错误码反查完整目录项。
 * 入口统一去除首尾空格，调用方可以直接使用返回的 code 和 meaning 生成排错提示。
 */
export function lookupBusinessError(code: string | undefined): BusinessErrorLookup | undefined {
  const normalized = code?.trim()
  if (!normalized || !(normalized in BUSINESS_ERROR_CATALOG)) return undefined
  return { code: normalized as ServerErrorCode, ...BUSINESS_ERROR_CATALOG[normalized as ServerErrorCode] }
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
  authentication_required: '请先登录后再继续操作',
  invalid_credential: '认证信息无效，请重新登录', mfa_required: '需要完成二次认证',
  mfa_step_up_required: '需要完成二次认证后才能继续', mfa_invalid_code: '验证码错误，请重试',
  mfa_challenge_invalid: '二次认证请求已失效，请重新开始', mfa_state_conflict: '当前 MFA 状态不允许此操作',
  active_session_conflict: '该账号已经在其他位置登录',
  permission_denied: '没有执行此操作的权限', data_scope_denied: '当前账号没有访问这些数据的权限',
  session_revoked: '当前会话已失效，请重新登录', resource_not_found: '请求的资源不存在',
  resource_conflict: '当前资源状态不允许此操作', role_has_members: '角色存在用户，不能删除', role_protected: '管理员角色不能删除', rate_limited: '操作过于频繁，请稍后重试',
  precondition_required: '请先完成账号安全设置', payload_too_large: '提交的数据过大，请缩小后重试',
  https_required: '请使用 HTTPS 访问系统', service_unavailable: '系统服务暂时不可用，请稍后重试', authorization_unavailable: '认证服务暂时不可用，请稍后重试',
  internal_error: '系统处理失败，请稍后重试', validation_failed: '提交的数据无效，请检查后重试',
  username_already_exists: '用户名已存在，请使用其他用户名。', username_invalid_format: '用户名格式无效，请检查后重试。',
  password_same_as_current: '新密码不能与当前密码相同。',
  password_required: '请输入密码。',
  password_too_short: '密码长度未达到系统要求。',
  password_disallowed: '该密码不符合系统安全要求，请选择其他密码。',
  password_contains_username: '密码不能包含用户名。',
  password_missing_uppercase: '密码必须包含大写字母。',
  password_missing_lowercase: '密码必须包含小写字母。',
  password_missing_digit: '密码必须包含数字。',
  password_missing_special: '密码必须包含特殊字符。',
  api_key_name_invalid: 'API Key 名称必须为 1 到 128 个字符。',
  profile_display_name_required: '请输入个人资料展示名。',
  profile_avatar_required: '请输入头像地址。',
  api_key_expiry_invalid: 'API Key 到期时间格式无效，请重新选择时间。',
  api_key_expiry_out_of_range: 'API Key 到期时间必须晚于当前时间且不超过 90 天。',
  api_key_expired: 'API Key 已过期，请新建密钥。',
  api_key_page_changed: 'API Key 列表已变化，请刷新后重试。',
  api_key_scope_unavailable: '原授权范围已不可用，请重新配置权限。',
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
  const definition = lookupBusinessError(error.code)
  const parts = [
    error.code,
    definition?.meaning,
    error.requestId ? `requestId=${error.requestId}` : null,
  ].filter(Boolean)
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
