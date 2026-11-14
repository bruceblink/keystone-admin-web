import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// 下载测试只验证文件响应和下载文件名，避免 jsdom 尝试导航到 blob URL。
vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
