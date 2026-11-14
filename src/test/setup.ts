import '@testing-library/jest-dom/vitest'
// 下载测试只验证文件响应和下载文件名，避免 jsdom 尝试导航到 blob URL。
Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
  configurable: true,
  value: () => undefined,
})
