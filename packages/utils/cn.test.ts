import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cn, initials } from './cn.ts'

describe('cn', () => {
  it('joins truthy class names', () => {
    assert.equal(cn('a', false, null, 'b', undefined, ''), 'a b')
  })
})

describe('initials', () => {
  it('builds two-letter initials', () => {
    assert.equal(initials('King Junior'), 'KJ')
    assert.equal(initials('Ada'), 'A')
  })
})
