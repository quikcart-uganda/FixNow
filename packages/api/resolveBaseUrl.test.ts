import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isDevLoopbackHost,
  isPrivateLanHost,
  rewriteDevLoopbackUrl,
} from './resolveBaseUrl.ts'

describe('resolveBaseUrl LAN rewrite', () => {
  it('detects loopback and private LAN hosts', () => {
    assert.equal(isDevLoopbackHost('localhost'), true)
    assert.equal(isDevLoopbackHost('127.0.0.1'), true)
    assert.equal(isDevLoopbackHost('192.168.1.20'), false)
    assert.equal(isPrivateLanHost('192.168.1.20'), true)
    assert.equal(isPrivateLanHost('10.0.0.5'), true)
    assert.equal(isPrivateLanHost('172.16.4.2'), true)
    assert.equal(isPrivateLanHost('8.8.8.8'), false)
    assert.equal(isPrivateLanHost('localhost'), false)
  })

  it('keeps localhost for desktop browser on localhost', () => {
    const url = rewriteDevLoopbackUrl('http://localhost:4000/api/v1', {
      pageHostname: 'localhost',
      isNative: false,
      isAndroid: false,
      lanHost: null,
    })
    assert.equal(url, 'http://localhost:4000/api/v1')
  })

  it('rewrites localhost to page LAN IP for mobile browser', () => {
    const url = rewriteDevLoopbackUrl('http://localhost:4000/api/v1', {
      pageHostname: '192.168.1.20',
      isNative: false,
      isAndroid: false,
      lanHost: null,
    })
    assert.equal(url, 'http://192.168.1.20:4000/api/v1')
  })

  it('prefers explicit VITE_DEV_LAN_HOST over page hostname', () => {
    const url = rewriteDevLoopbackUrl('http://127.0.0.1:4000/api/v1', {
      pageHostname: '192.168.1.20',
      isNative: true,
      isAndroid: true,
      lanHost: '192.168.1.55',
    })
    assert.equal(url, 'http://192.168.1.55:4000/api/v1')
  })

  it('uses Android emulator alias when native and no LAN context', () => {
    const url = rewriteDevLoopbackUrl('http://localhost:4000/api/v1', {
      pageHostname: 'app.fixnow.local',
      isNative: true,
      isAndroid: true,
      lanHost: null,
    })
    assert.equal(url, 'http://10.0.2.2:4000/api/v1')
  })

  it('does not rewrite non-loopback production hosts', () => {
    const url = rewriteDevLoopbackUrl('https://api.fixnow.app/api/v1', {
      pageHostname: '192.168.1.20',
      isNative: true,
      isAndroid: true,
      lanHost: '192.168.1.20',
    })
    assert.equal(url, 'https://api.fixnow.app/api/v1')
  })

  it('rewrites socket origin the same way', () => {
    const url = rewriteDevLoopbackUrl('http://localhost:4000', {
      pageHostname: '10.0.0.8',
      isNative: false,
      lanHost: null,
    })
    assert.equal(url, 'http://10.0.0.8:4000')
  })
})
