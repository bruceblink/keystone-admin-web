import { describe, expect, it } from 'vitest'
import type { NativeCapabilities } from '../api/schemas'
import { canAccessCapabilityPage, canReadMonitorResource, firstAccessibleCapabilityPage } from './capabilityRules'

/** 按服务端返回的权限与资源范围验证导航规则和监控分项权限。 */
const emptyResources: NativeCapabilities['resources'] = {
  user: false, department: false, role: false, post: false, menu: false, config: false,
  dictionary: false, notice: false, job: false, audit: false, session: false,
  'api-key': false, profile: false,
}

describe('capabilityRules', () => {
  it('页面读取权限和数据范围必须同时成立', () => {
    const permissionOnly = { permissions: ['user:read'], resources: emptyResources }
    const resourceOnly = { permissions: [], resources: { ...emptyResources, user: true } }
    const allowed = { permissions: ['user:read'], resources: { ...emptyResources, user: true } }

    expect(canAccessCapabilityPage('/users', permissionOnly)).toBe(false)
    expect(canAccessCapabilityPage('/users', resourceOnly)).toBe(false)
    expect(canAccessCapabilityPage('/users', allowed)).toBe(true)
    expect(firstAccessibleCapabilityPage(allowed)?.path).toBe('/users')
  })

  it('监控需要 session 范围和至少一个对应资源读取权限', () => {
    const noScope = { permissions: ['server:read'], resources: emptyResources }
    const noPermission = { permissions: [], resources: { ...emptyResources, session: true } }
    const serverOnly = { permissions: ['server:read'], resources: { ...emptyResources, session: true } }

    expect(canAccessCapabilityPage('/monitor', noScope)).toBe(false)
    expect(canAccessCapabilityPage('/monitor', noPermission)).toBe(false)
    expect(canAccessCapabilityPage('/monitor', serverOnly)).toBe(true)
    expect(canReadMonitorResource('server:read', serverOnly)).toBe(true)
    expect(canReadMonitorResource('cache:refresh', serverOnly)).toBe(false)
    expect(canAccessCapabilityPage('/dashboard', serverOnly)).toBe(true)
  })

  it('审计路由、API Key 与个人资料使用各自的权限范围', () => {
    const audit = { permissions: ['operation-log:read', 'login-log:read'], resources: { ...emptyResources, audit: true } }
    const apiKey = { permissions: ['api-key:read'], resources: { ...emptyResources, 'api-key': true } }
    const profile = { permissions: ['user:read'], resources: { ...emptyResources, user: true, profile: false } }
    const profileAllowed = { ...profile, resources: { ...emptyResources, user: true, profile: true } }

    expect(canAccessCapabilityPage('/audit/operations', audit)).toBe(true)
    expect(canAccessCapabilityPage('/audit/login', audit)).toBe(true)
    expect(canAccessCapabilityPage('/api-keys', apiKey)).toBe(true)
    expect(canAccessCapabilityPage('/profile', profile)).toBe(false)
    expect(canAccessCapabilityPage('/profile', profileAllowed)).toBe(true)
  })
})
