import { describe, expect, it } from 'vitest'
import { getSafeReturnPath } from './safeReturnPath'

describe('getSafeReturnPath', () => {
  // 登录返回地址必须保留站内筛选，并拒绝外部地址或登录循环。
  it('保留站内路径、查询参数和锚点', () => {
    expect(getSafeReturnPath({ from: { pathname: '/dictionaries', search: '?keyword=notice', hash: '#results' } }))
      .toBe('/dictionaries?keyword=notice#results')
  })

  it.each([
    { pathname: 'https://attacker.example/path', search: '', hash: '' },
    { pathname: '//attacker.example/path', search: '', hash: '' },
    { pathname: '/\\attacker.example/path', search: '', hash: '' },
    { pathname: '/login', search: '?loop=1', hash: '' },
    { pathname: '/safe/../login', search: '', hash: '' },
  ])('无效返回地址回退到监控页：%o', (from) => {
    expect(getSafeReturnPath({ from })).toBe('/monitor')
  })
})
