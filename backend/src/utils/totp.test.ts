import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateTotp, generateTotpSecret, verifyTotp } from './totp.js'

describe('totp', () => {
  it('generates and verifies a code for the current window', () => {
    const secret = generateTotpSecret()
    const token = generateTotp(secret)
    assert.equal(token.length, 6)
    assert.equal(verifyTotp(secret, token), true)
  })

  it('rejects wrong codes', () => {
    const secret = generateTotpSecret()
    assert.equal(verifyTotp(secret, '000000'), false)
  })
})
