import { nativeUserImportResultSchema, type NativeUserImportResult } from './schemas'
import { ApiError } from './errors'

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** 入口只接受 Excel Open XML 文件名；实际工作簿内容仍由 Native 端校验。 */
export function isXlsxFilename(filename: string): boolean {
  return filename.trim().toLowerCase().endsWith('.xlsx')
}

type JsonRequest = <T>(path: string, init?: RequestInit) => Promise<T>
type FileRequest = (path: string, init?: RequestInit) => Promise<Response>

type UserFileClientOptions = {
  request: JsonRequest
  requestFile: FileRequest
  mockFallbackEnabled: () => boolean
}

function filenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null
  const encoded = value.match(/filename\*=(?:UTF-8'')?([^;]+)/i)?.[1]
  const plain = value.match(/filename="?([^";]+)"?/i)?.[1]
  const candidate = encoded ?? plain
  if (!candidate) return null
  try {
    return decodeURIComponent(candidate.trim())
  } catch {
    return candidate.trim()
  }
}

async function readXlsxResponse(response: Response): Promise<{ blob: Blob; filename: string }> {
  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== XLSX_MIME_TYPE) throw new ApiError('Native API 返回的文件类型不是 .xlsx', 502, 'invalid_response')
  const filename = filenameFromContentDisposition(response.headers.get('Content-Disposition'))
  if (!filename || !isXlsxFilename(filename)) throw new ApiError('Native API 返回的文件名不是 .xlsx', 502, 'invalid_response')
  const blob = await response.blob()
  if (blob.size === 0) throw new ApiError('Native API 返回了空的 .xlsx 文件', 502, 'invalid_response')
  return { blob, filename }
}

/** 用户 XLSX 导入导出调用；认证头和令牌刷新由主 API 客户端提供。 */
export function createUserFileClient({ request, requestFile, mockFallbackEnabled }: UserFileClientOptions) {
  return {
    async importUsers(file: File): Promise<NativeUserImportResult> {
      if (!isXlsxFilename(file.name)) throw new ApiError('只支持 .xlsx 文件', 422, 'validation_failed')
      const formData = new FormData()
      formData.append('file', file, file.name)
      try {
        return nativeUserImportResultSchema.parse(await request<unknown>('/users/import', { method: 'POST', body: formData }))
      } catch (error) {
        // 开发 Mock 只替代网络不可用；AAL2、API Key 和权限错误必须原样展示。
        if (error instanceof ApiError && error.status !== 0) throw error
        if (!mockFallbackEnabled()) throw error
        return { total: 1, success: 1, failed: [] }
      }
    },

    async exportUsers(filters: { username?: string; displayName?: string; deptId?: string; enabled?: boolean } = {}): Promise<{ blob: Blob; filename: string }> {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, String(value).trim())
      }
      const query = params.toString()
      try {
        return await readXlsxResponse(await requestFile(`/users/export${query ? `?${query}` : ''}`))
      } catch (error) {
        if (error instanceof ApiError && error.status !== 0) throw error
        if (!mockFallbackEnabled()) throw error
        return { blob: new Blob(['mock xlsx workbook'], { type: XLSX_MIME_TYPE }), filename: 'users.xlsx' }
      }
    },
  }
}
