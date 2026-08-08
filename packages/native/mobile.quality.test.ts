import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveDeepLink,
  resolvePushTarget,
  isRoutableAppPath,
  APP_SCHEME,
  APP_LINK_HOSTS,
} from './deepLinks.ts'
import { getPlatform, isNativePlatform, platformTag } from './platform.ts'

describe('deepLinks', () => {
  it('resolves custom scheme paths', () => {
    assert.equal(resolveDeepLink(`${APP_SCHEME}://customer/jobs/1`), '/customer/jobs/1')
  })

  it('maps payment scheme aliases under customer', () => {
    assert.equal(resolveDeepLink(`${APP_SCHEME}://payments/success`), '/customer/payments/success')
  })

  it('accepts known app-link hosts', () => {
    assert.ok(APP_LINK_HOSTS.includes('fixnow.app'))
    assert.equal(resolveDeepLink('https://fixnow.app/technician/dashboard'), '/technician/dashboard')
  })

  it('rejects unknown hosts', () => {
    assert.equal(resolveDeepLink('https://evil.example/customer/home'), null)
  })

  it('resolves bare in-app paths', () => {
    assert.equal(resolveDeepLink('/customer/home'), '/customer/home')
  })

  it('push target falls back to role inbox', () => {
    assert.equal(resolvePushTarget({}, 'customer'), '/customer/notifications')
    assert.equal(resolvePushTarget({ href: '/customer/jobs/9' }, 'customer'), '/customer/jobs/9')
  })

  it('detects routable roots', () => {
    assert.equal(isRoutableAppPath('/customer/home'), true)
    assert.equal(isRoutableAppPath('/unknown/x'), false)
  })
})

describe('platform (web defaults)', () => {
  beforeEach(() => {
    // Ensure Capacitor is absent in Node unit runs.
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
    })
  })

  it('defaults to web', () => {
    assert.equal(getPlatform(), 'web')
    assert.equal(isNativePlatform(), false)
    assert.equal(platformTag(), 'web')
  })
})
