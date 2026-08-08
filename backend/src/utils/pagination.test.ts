import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { paginationMeta, parseSort, escapeRegex } from './pagination.js'

describe('pagination', () => {
  it('builds meta with next/prev', () => {
    const meta = paginationMeta(45, 2, 20)
    assert.equal(meta.totalPages, 3)
    assert.equal(meta.hasNext, true)
    assert.equal(meta.hasPrev, true)
  })

  it('clamps empty totals to one page', () => {
    const meta = paginationMeta(0, 1, 20)
    assert.equal(meta.totalPages, 1)
    assert.equal(meta.hasNext, false)
  })

  it('parses sort fields', () => {
    assert.deepEqual(parseSort('-createdAt'), { createdAt: -1 })
    assert.deepEqual(parseSort('updatedAt', ['updatedAt']), { updatedAt: 1 })
    assert.deepEqual(parseSort('hacked', ['createdAt']), { createdAt: -1 })
  })

  it('escapes regex metacharacters', () => {
    assert.equal(escapeRegex('a+b*(c)'), 'a\\+b\\*\\(c\\)')
  })
})
