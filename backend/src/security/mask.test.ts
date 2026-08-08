import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { maskSensitive, maskEmail, isSensitiveKey, sanitizeErrorMessage } from '../security/mask.js'
import { categorizeError, ERROR_CODES, ERROR_CATEGORIES } from '../constants/errorCodes.js'
import { AppError } from '../utils/AppError.js'

describe('maskSensitive', () => {
  it('redacts sensitive keys', () => {
    const out = maskSensitive({ password: 'secret', email: 'ab@fixnow.app', ok: true })
    assert.equal(out.password, '[redacted]')
    assert.match(String(out.email), /\*\*\*/)
    assert.equal(out.ok, true)
  })

  it('detects sensitive keys', () => {
    assert.equal(isSensitiveKey('refreshToken'), true)
    assert.equal(isSensitiveKey('fullName'), false)
  })

  it('masks emails', () => {
    assert.match(maskEmail('king@fixnow.app'), /^ki\*\*\*@fixnow\.app$/i)
  })

  it('sanitizes production error paths', () => {
    const withPath = sanitizeErrorMessage('ENOENT C:\\Users\\x\\app\\file.ts', true)
    assert.match(withPath, /\[path\]/)
    assert.equal(withPath.includes('Users'), false)

    const withStack = sanitizeErrorMessage('fail at C:\\Users\\x\\app\\file.ts', true)
    assert.equal(withStack, 'fail')
    assert.equal(withStack.includes('Users'), false)
  })
})

describe('error categorisation', () => {
  it('maps codes to categories', () => {
    assert.equal(categorizeError(ERROR_CODES.UNAUTHORIZED, 401), ERROR_CATEGORIES.AUTH)
    assert.equal(categorizeError(ERROR_CODES.VALIDATION_ERROR, 422), ERROR_CATEGORIES.VALIDATION)
    assert.equal(categorizeError(ERROR_CODES.CIRCUIT_OPEN, 503), ERROR_CATEGORIES.DEPENDENCY)
  })

  it('AppError helpers set codes', () => {
    assert.equal(AppError.notFound().code, ERROR_CODES.NOT_FOUND)
    assert.equal(AppError.circuitOpen().statusCode, 503)
  })
})