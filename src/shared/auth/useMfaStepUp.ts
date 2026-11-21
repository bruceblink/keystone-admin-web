import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { apiClient } from '../api/client'
import { ApiError, formatApiError } from '../api/errors'
import type { NativeMfaStepUpChallenge } from '../api/schemas'
import { CapabilityAvailabilityContext } from './CapabilityAvailability'
import { useSessionStore } from '../state/session'

type Operation<T> = () => Promise<T>
type SessionOwner = { username: string; sessionRevision: number }
type OperationPhase = 'starting' | 'beginning' | 'waiting' | 'verifying' | 'executing'
type PendingOperation = {
  operation: Operation<unknown>
  owner: SessionOwner
  phase: OperationPhase
  resolve?: (value: unknown) => void
  reject?: (reason?: unknown) => void
  settled: boolean
  abandoned: boolean
  detached: boolean
  revalidationStarted: boolean
  noticeSent: boolean
}

const cancelled = () => new ApiError('权限重新确认期间，MFA 操作已取消', 409, 'mfa_step_up_cancelled')

/** 只在服务端要求 step-up 时暂停敏感写操作，并在权限仍有效时重试原操作。 */
export function useMfaStepUp() {
  const [open, setOpen] = useState(false)
  const [challenge, setChallenge] = useState<NativeMfaStepUpChallenge | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operationRef = useRef<PendingOperation | null>(null)
  const mountedRef = useRef(false)
  const availability = useContext(CapabilityAvailabilityContext)
  const availabilityRef = useRef(availability.available)
  const user = useSessionStore((state) => state.user)
  const sessionRevision = useSessionStore((state) => state.sessionRevision)
  const setPendingActionNotice = useSessionStore((state) => state.setPendingActionNotice)
  const ownerRef = useRef<SessionOwner | null>(null)

  availabilityRef.current = availability.available
  ownerRef.current = user ? { username: user.username, sessionRevision } : null

  if (availability.available && operationRef.current) operationRef.current.revalidationStarted = false
  if (!availability.available && operationRef.current) operationRef.current.revalidationStarted = true

  const notify = useCallback((operation: PendingOperation, message: string) => {
    if (operation.noticeSent) return
    operation.noticeSent = true
    setPendingActionNotice(message, operation.owner)
  }, [setPendingActionNotice])

  const settle = useCallback((operation: PendingOperation, result: { ok: true; value: unknown } | { ok: false; error: unknown }) => {
    if (operation.settled) return
    operation.settled = true
    if (result.ok) operation.resolve?.(result.value)
    else operation.reject?.(result.error)
    if (operationRef.current === operation) operationRef.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const operation = operationRef.current
      if (!operation) return
      operation.abandoned = true
      if (operation.phase === 'executing' || operation.phase === 'starting') {
        // 已发出的写请求不可安全撤回；等服务端返回后再报告真实结果。
        operation.detached = true
        return
      }
      settle(operation, { ok: false, error: cancelled() })
      notify(operation, '权限已变化，尚未完成的 MFA 操作已取消。请重新确认权限后再检查或重试。')
    }
  }, [notify, settle])

  const run = useCallback(async <T,>(operation: Operation<T>): Promise<T> => {
    const owner = ownerRef.current
    if (!owner || !mountedRef.current) throw cancelled()
    if (operationRef.current) throw new ApiError('已有 MFA 验证请求正在处理', 409, 'mfa_step_up_in_progress')

    const pendingOperation: PendingOperation = {
      operation: operation as Operation<unknown>,
      owner,
      phase: 'starting',
      settled: false,
      abandoned: false,
      detached: false,
      revalidationStarted: false,
      noticeSent: false,
    }
    operationRef.current = pendingOperation

    try {
      const result = await operation()
      if (pendingOperation.detached || pendingOperation.revalidationStarted || !mountedRef.current) {
        notify(pendingOperation, '原操作已完成，但权限页面已变化。请重新确认权限后刷新列表核对结果。')
      }
      return result
    } catch (cause) {
      if (!isMfaStepUpRequired(cause)) {
        if (pendingOperation.detached || pendingOperation.revalidationStarted || !mountedRef.current) {
          notify(pendingOperation, `原操作未能确认完成：${formatApiError(cause, '请求失败')}。请重新确认权限后刷新列表核对结果。`)
        }
        throw cause
      }

      pendingOperation.phase = 'beginning'
      if (pendingOperation.detached || !mountedRef.current) {
        notify(pendingOperation, '原操作需要 MFA 验证，但权限页面已变化，写入未继续。请重新确认权限后重试。')
        throw cancelled()
      }
      const nextChallenge = await apiClient.beginMfaStepUp()
      if (pendingOperation.abandoned || !mountedRef.current) {
        notify(pendingOperation, '权限已变化，尚未完成的 MFA 操作已取消。请重新确认权限后再检查或重试。')
        throw cancelled()
      }
      if (pendingOperation.revalidationStarted || !availabilityRef.current) {
        pendingOperation.revalidationStarted = true
        notify(pendingOperation, '权限正在重新确认，MFA 操作已取消。权限恢复后可重新提交。')
        throw cancelled()
      }

      setChallenge(nextChallenge)
      setError(null)
      setOpen(true)
      pendingOperation.phase = 'waiting'
      return await new Promise<T>((resolve, reject) => {
        pendingOperation.resolve = resolve as (value: unknown) => void
        pendingOperation.reject = reject
      })
    } finally {
      if (pendingOperation.settled && operationRef.current === pendingOperation) operationRef.current = null
      if (pendingOperation.phase !== 'waiting' && operationRef.current === pendingOperation && !pendingOperation.detached) operationRef.current = null
    }
  }, [notify])

  const submit = useCallback(async (code: string): Promise<void> => {
    const pendingOperation = operationRef.current
    if (!pendingOperation || !challenge || !availabilityRef.current) return
    pendingOperation.phase = 'verifying'
    setPending(true)
    setError(null)
    try {
      await apiClient.verifyMfaStepUp(challenge.challengeId, code)
      if (pendingOperation.abandoned || !mountedRef.current) return
      if (pendingOperation.revalidationStarted || !availabilityRef.current) {
        pendingOperation.abandoned = true
        setOpen(false)
        setChallenge(null)
        settle(pendingOperation, { ok: false, error: cancelled() })
        notify(pendingOperation, '权限正在重新确认，MFA 操作已取消。权限恢复后可重新提交。')
        return
      }

      pendingOperation.phase = 'executing'
      setOpen(false)
      setChallenge(null)
      try {
        const value = await pendingOperation.operation()
        settle(pendingOperation, { ok: true, value })
        if (pendingOperation.detached || pendingOperation.revalidationStarted || !mountedRef.current) {
          notify(pendingOperation, '原操作已完成，但权限页面已变化。请重新确认权限后刷新列表核对结果。')
        }
      } catch (cause) {
        settle(pendingOperation, { ok: false, error: cause })
        if (pendingOperation.detached || pendingOperation.revalidationStarted || !mountedRef.current) {
          notify(pendingOperation, `原操作未能确认完成：${formatApiError(cause, '请求失败')}。请重新确认权限后刷新列表核对结果。`)
        }
      }
    } catch (cause) {
      if (!pendingOperation.abandoned && mountedRef.current) {
        if (isStepUpVerificationError(cause)) setError(errorMessage(cause))
        else {
          setOpen(false)
          setChallenge(null)
          settle(pendingOperation, { ok: false, error: cause })
        }
      }
    } finally {
      if (mountedRef.current) setPending(false)
    }
  }, [challenge, notify, settle])

  const cancel = useCallback(() => {
    if (pending) return
    const pendingOperation = operationRef.current
    setOpen(false)
    setChallenge(null)
    setError(null)
    if (pendingOperation) settle(pendingOperation, { ok: false, error: new ApiError('MFA step-up 已取消', 499, 'mfa_step_up_cancelled') })
  }, [pending, settle])

  return {
    run,
    modal: { open, challenge, pending, error, onClose: cancel, onSubmit: submit },
  }
}

/** 只识别服务端明确返回的最近 MFA step-up 要求，避免把普通权限错误误导入 MFA 流程。 */
export function isMfaStepUpRequired(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.status !== 403) return false
  return error.code === 'mfa_step_up_required' || error.code === 'mfa_required'
}

function isStepUpVerificationError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  return ['mfa_invalid_code', 'mfa_challenge_invalid', 'invalid_credential', 'validation_failed', 'rate_limited'].includes(error.code ?? '')
}

function errorMessage(error: unknown): string {
  return formatApiError(error, 'MFA 验证失败，请重试。')
}
