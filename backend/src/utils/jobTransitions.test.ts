import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assertJobTransition, isTerminalJobStatus, JOB_TRANSITIONS } from './jobTransitions.js'
import { JOB_STATUS } from '../models/shared/enums.js'

describe('jobTransitions', () => {
  it('allows posted → assigned', () => {
    assert.doesNotThrow(() => assertJobTransition(JOB_STATUS.POSTED, JOB_STATUS.ASSIGNED))
  })

  it('rejects posted → completed', () => {
    assert.throws(() => assertJobTransition(JOB_STATUS.POSTED, JOB_STATUS.COMPLETED), /Illegal job status/)
  })

  it('marks archived as terminal', () => {
    assert.equal(isTerminalJobStatus(JOB_STATUS.ARCHIVED), true)
    assert.equal(isTerminalJobStatus(JOB_STATUS.COMPLETED), false)
  })

  it('has no transitions from archived', () => {
    assert.deepEqual(JOB_TRANSITIONS[JOB_STATUS.ARCHIVED], [])
  })
})
