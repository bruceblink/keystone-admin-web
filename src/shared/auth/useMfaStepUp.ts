import { useCallback, useRef, useState } from 'react'
import { apiClient } from '../api/client'
import { ApiError, formatApiError } from '../api/errors'
import type { NativeMfaStepUpChallenge } from '../api/schemas'

type Operation<T> = () => Promise<T>
type PendingOperation = {
  operation: Operation<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

/** 只在服务端要求 step-up 时暂停敏感写操作，并在验证后重试原操作。 */
export function useMfaStepUp() {
  const [open, setOpen] = useState(false)
  const [challenge, setChallenge] = useState<NativeMfaStepUpChallenge | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operationRef = useRef<PendingOperation | null>(null)

  const run = useCallback(async <T,>(operation: Operation<T>): Promise<T> => {
    try {
      return await operation()
    } catch (cause) {
      if (!isMfaStepUpRequired(cause)) throw cause
      if (operationRef.current) throw new ApiError('已有 MFA 验证请求正在处理', 409, 'mfa_step_up_in_progress')
      try {
        const nextChallenge = await apiClient.beginMfaStepUp()
        setChallenge(nextChallenge)
        setError(null)
        setOpen(true)
        return await new Promise<T>((resolve, reject) => {
          operationRef.current = { operation: operation as Operation<unknown>, resolve: resolve as (value: unknown) => void, reject }
        })
      } catch (beginError) {
        setChallenge(null)
        setOpen(false)
        throw beginError
      }
    }
  }, [])

  const submit = useCallback(async (code: string): Promise<void> => {
    const pendingOperation = operationRef.current
    if (!pendingOperation || !challenge) return
    setPending(true)
    setError(null)
    try {
      await apiClient.verifyMfaStepUp(challenge.challengeId, code)
      operationRef.current = null
      setOpen(false)
      setChallenge(null)
      pendingOperation.resolve(await pendingOperation.operation())
    } catch (cause) {
      if (isStepUpVerificationError(cause)) {
        setError(errorMessage(cause))
        return
      }
      operationRef.current = null
      setOpen(false)
      setChallenge(null)
      pendingOperation.reject(cause)
    } finally {
      setPending(false)
    }
  }, [challenge])

  const cancel = useCallback(() => {
    if (pending) return
    const pendingOperation = operationRef.current
    operationRef.current = null
    setOpen(false)
    setChallenge(null)
    setError(null)
    pendingOperation?.reject(new ApiError('MFA step-up 已取消', 499, 'mfa_step_up_cancelled'))
  }, [pending])

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
