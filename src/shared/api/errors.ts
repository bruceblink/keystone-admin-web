/** Native API 调用错误；保留 HTTP 状态和统一错误分类供页面决定反馈方式。 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
