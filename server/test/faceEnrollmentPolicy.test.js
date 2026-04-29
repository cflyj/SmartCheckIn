import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isInPresessionReplacementFreeze,
  sessionUsesFace,
} from '../services/faceEnrollmentPolicy.js'

const freezeMs = 48 * 3600000

test('sessionUsesFace', () => {
  assert.equal(sessionUsesFace('FACE'), true)
  assert.equal(sessionUsesFace('GEO'), false)
})

test('freeze window: inside [start-48h, end)', () => {
  const start = Date.now() + 24 * 3600000
  const end = start + 3600000
  const row = {
    checkin_modes: 'FACE',
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(end).toISOString(),
    cancelled: false,
  }
  const t1 = start - 47 * 3600000
  assert.equal(isInPresessionReplacementFreeze(row, freezeMs, t1), true)
  const t0 = start - 49 * 3600000
  assert.equal(isInPresessionReplacementFreeze(row, freezeMs, t0), false)
})
