import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, comparePassword } from './password.js'

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('Password1')
    assert.notEqual(hash, 'Password1')
    assert.equal(await comparePassword('Password1', hash), true)
    assert.equal(await comparePassword('wrong', hash), false)
  })
})
