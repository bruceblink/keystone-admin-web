import { describe, expect, it } from 'vitest'
import {
  ApiError,
  errorDiagnostic,
  formatApiError,
  getBusinessErrorDefinition,
  isActiveSessionConflict,
  lookupBusinessError,
} from './errors'

describe('ApiError', () => {
  it('保留服务端业务错误码和请求追踪信息', () => {
    const error = new ApiError('内部英文消息', 409, 'active_session_conflict', null, {
      source: 'server',
      requestId: 'request-1',
      details: { sessionCount: 1 },
      retryAfterSeconds: 3,
    })

    expect(error.source).toBe('server')
    expect(error.code).toBe('active_session_conflict')
    expect(error.requestId).toBe('request-1')
    expect(error.details).toEqual({ sessionCount: 1 })
    expect(error.retryAfterSeconds).toBe(3)
    expect(formatApiError(error)).toBe('该账号已经在其他位置登录')
    expect(errorDiagnostic(error)).toBe('active_session_conflict · 账号已有活动会话 · requestId=request-1')
  })

  it('将客户端本地错误码标记为 client 来源', () => {
    const error = new ApiError('network failed', 0, 'network_error')

    expect(error.source).toBe('client')
    expect(formatApiError(error)).toBe('无法连接系统 API')
  })

  it('活动会话判断使用稳定错误码，不依赖可读消息', () => {
    expect(isActiveSessionConflict(new ApiError('message changed', 409, 'active_session_conflict'))).toBe(true)
    expect(isActiveSessionConflict(new ApiError('message changed', 409, 'permission_denied'))).toBe(false)
  })

  it('可以通过错误码反查目录元数据', () => {
    expect(getBusinessErrorDefinition('active_session_conflict')).toMatchObject({
      httpStatus: 409,
      retryable: false,
      messageKey: 'error.active_session_conflict',
    })
    expect(getBusinessErrorDefinition('unknown_code')).toBeUndefined()
  })

  it('反查时规范化错误码并返回可用于排错的代码和业务含义', () => {
    expect(lookupBusinessError(' permission_denied ')).toMatchObject({
      code: 'permission_denied',
      meaning: '没有执行该操作的权限',
      httpStatus: 403,
    })
    expect(lookupBusinessError(undefined)).toBeUndefined()
  })

  it.each([
    // 相同密码使用独立代码，不能与其他密码策略失败混淆。
    ['password_same_as_current', '新密码不能与当前密码相同。', '新密码与已验证的当前密码相同'],
    ['password_required', '请输入密码。', '密码缺失或为空白'],
    ['password_too_short', '密码长度未达到系统要求。', '密码长度未达到要求'],
    ['password_disallowed', '该密码不符合系统安全要求，请选择其他密码。', '密码位于禁止列表中'],
    ['password_contains_username', '密码不能包含用户名。', '密码包含用户名'],
    ['password_missing_uppercase', '密码必须包含大写字母。', '密码缺少大写字母'],
    ['password_missing_lowercase', '密码必须包含小写字母。', '密码缺少小写字母'],
    ['password_missing_digit', '密码必须包含数字。', '密码缺少数字'],
    ['password_missing_special', '密码必须包含特殊字符。', '密码缺少特殊字符'],
    ['api_key_name_invalid', 'API Key 名称必须为 1 到 128 个字符。', 'API Key 名称缺失或超过 128 个字符'],
    ['notice_type_invalid', '公告类型不能超过 32 个字符。', '公告类型超过 32 个 Unicode 码点'],
    ['profile_display_name_required', '请输入个人资料展示名。', '个人资料展示名缺失或为空白'],
    ['profile_avatar_required', '请输入头像地址。', '个人资料头像地址缺失或为空白'],
    ['api_key_expiry_invalid', 'API Key 到期时间格式无效，请重新选择时间。', 'API Key 到期时间格式无效'],
    ['api_key_expiry_out_of_range', 'API Key 到期时间必须晚于当前时间且不超过 90 天。', 'API Key 到期时间不在允许范围内'],
    ['api_key_scope_unavailable', '原授权范围已不可用，请重新配置权限。', 'API Key 轮换时原授权范围均不再属于持有人'],
  ] as const)('业务错误码 %s 可反查为独立条件并保留 422', (code, message, meaning) => {
    const error = new ApiError('服务端消息', 422, code)

    expect(error.status).toBe(422)
    expect(lookupBusinessError(code)).toMatchObject({ code, httpStatus: 422, meaning })
    expect(formatApiError(error)).toBe(message)
    expect(errorDiagnostic(error)).toContain(`${code} · ${meaning}`)
  })

  it('通过独立错误码提示已过期的 API Key 不可轮换', () => {
    const error = new ApiError('服务端消息', 409, 'api_key_expired')

    expect(lookupBusinessError(error.code)).toMatchObject({ httpStatus: 409, meaning: '已过期的 API Key 不能轮换' })
    expect(formatApiError(error)).toBe('API Key 已过期，请新建密钥。')
  })

  // 保持 HTTP 状态、重试属性、用户提示和可复制的诊断含义一致。
  it('通过可重试错误码提示 API Key 列表变化并要求刷新', () => {
    const error = new ApiError('服务端消息', 409, 'api_key_page_changed')

    expect(lookupBusinessError(error.code)).toMatchObject({
      httpStatus: 409,
      retryable: true,
      meaning: 'API Key 分页回退期间结果再次变化，无法确认有效页码',
    })
    expect(formatApiError(error)).toBe('API Key 列表已变化，请刷新后重试。')
    expect(errorDiagnostic(error)).toContain('api_key_page_changed · API Key 分页回退期间结果再次变化，无法确认有效页码')
  })
})
