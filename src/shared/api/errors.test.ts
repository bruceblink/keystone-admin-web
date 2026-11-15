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
})
