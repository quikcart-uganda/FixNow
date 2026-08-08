import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertSameDataEnvironment,
  documentDataEnvironment,
  environmentBucket,
} from '../sandbox/dataEnvironment.js'

describe('sandbox dataEnvironment isolation', () => {
  it('buckets sandbox vs production', () => {
    assert.equal(environmentBucket('sandbox'), 'sandbox')
    assert.equal(environmentBucket('production'), 'production')
    assert.equal(environmentBucket('archived'), 'archived')
  })

  it('reads document environment with production default', () => {
    assert.equal(documentDataEnvironment({ dataEnvironment: 'sandbox' }), 'sandbox')
    assert.equal(documentDataEnvironment({}), 'production')
  })

  it('blocks cross-environment interactions', () => {
    assert.throws(
      () => assertSameDataEnvironment('sandbox', 'production', 'cross-env blocked'),
      /cross-env blocked|Sandbox|environment/i,
    )
    assert.doesNotThrow(() => assertSameDataEnvironment('sandbox', 'sandbox'))
  })
})
