import { nanoid } from 'nanoid'
import { getQrStateRow, upsertQrState, parseJsonField } from '../db.js'

const DEFAULT_TTL = 60

export function defaultQrConfig() {
  return {
    strategy: 'rotating_token',
    ttl_seconds: DEFAULT_TTL,
    allow_reuse_within_ttl: false,
  }
}

export function mergeQrConfig(stored) {
  return { ...defaultQrConfig(), ...parseJsonField(stored, {}) }
}

export function rotateQrForSession(sessionId, qrConfig) {
  const ttl = Number(qrConfig.ttl_seconds) || DEFAULT_TTL
  const token = nanoid(36)
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
  upsertQrState(sessionId, token, expiresAt)
  return { token, expires_at: expiresAt, ttl_seconds: ttl }
}

export function ensureQrRow(sessionId, qrConfig) {
  const row = getQrStateRow(sessionId)
  if (!row) return rotateQrForSession(sessionId, qrConfig)
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return rotateQrForSession(sessionId, qrConfig)
  }
  return {
    token: row.token,
    expires_at: row.expires_at,
    ttl_seconds: Number(qrConfig.ttl_seconds) || DEFAULT_TTL,
  }
}

export function getQrState(sessionId) {
  return getQrStateRow(sessionId) || null
}
