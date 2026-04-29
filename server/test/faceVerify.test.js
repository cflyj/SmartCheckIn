import test from 'node:test'
import assert from 'node:assert/strict'
import { euclideanDistance, descriptorsMatch } from '../services/faceVerify.js'

test('equal descriptors distance 0 & match ok', () => {
  const a = Array.from({ length: 128 }, () => Math.random())
  const d = euclideanDistance(a, a)
  assert.ok(d === 0)
  const r = descriptorsMatch(a, [...a])
  assert.ok(r.ok)
})

test('mismatched descriptors usually fail threshold', () => {
  const a = Array.from({ length: 128 }, () => 0)
  const b = Array.from({ length: 128 }, () => 1)
  assert.ok(descriptorsMatch(a, b, 0.2).ok === false)
})
