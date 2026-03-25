import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {DatabaseSync} */
let db

export function initDb() {
  const path = process.env.SQLITE_PATH || join(__dirname, 'app.db')
  db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  createTables()
  seedIfEmpty()
}

export function getSqlite() {
  if (!db) throw new Error('DB not initialized')
  return db
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('organizer', 'participant')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      organizer_id TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      checkin_modes TEXT NOT NULL,
      cancelled INTEGER NOT NULL DEFAULT 0,
      participant_scope TEXT NOT NULL DEFAULT 'open',
      allowed_user_ids TEXT NOT NULL DEFAULT '[]',
      joined_user_ids TEXT NOT NULL DEFAULT '[]',
      invite_code_hash TEXT,
      geo_config TEXT,
      qr_config TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organizer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS checkin_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      method TEXT NOT NULL,
      success INTEGER NOT NULL,
      failure_code TEXT,
      client_reported_at TEXT,
      server_at TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      accuracy_m REAL,
      raw_meta TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_success ON checkin_records(session_id, user_id) WHERE success = 1;

    CREATE TABLE IF NOT EXISTS session_qr_state (
      session_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions(organizer_id);
    CREATE INDEX IF NOT EXISTS idx_records_session ON checkin_records(session_id);
  `)
}

export function parseJsonField(str, fallback = null) {
  if (str == null || str === '') return fallback
  if (typeof str === 'object') return str
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

export function hydrateSession(row) {
  if (!row) return null
  return {
    ...row,
    cancelled: !!row.cancelled,
    allowed_user_ids: parseJsonField(row.allowed_user_ids, []),
    joined_user_ids: parseJsonField(row.joined_user_ids, []),
  }
}

export function sessionComputedStatus(row) {
  if (row.cancelled) return 'cancelled'
  const now = Date.now()
  const start = new Date(row.starts_at).getTime()
  const end = new Date(row.ends_at).getTime()
  if (now < start) return 'scheduled'
  if (now > end) return 'ended'
  return 'active'
}

export function findUserByUsername(username) {
  return getSqlite()
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(username)
}

export function findUserById(id) {
  const u = getSqlite().prepare('SELECT id, username, display_name, role, created_at FROM users WHERE id = ?').get(id)
  return u || null
}

export function countUsers() {
  return getSqlite().prepare('SELECT COUNT(*) AS c FROM users').get().c
}

export function insertUser({ id, username, passwordHash, displayName, role, createdAt }) {
  getSqlite()
    .prepare(
      `INSERT INTO users (id, username, password_hash, display_name, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, username, passwordHash, displayName, role, createdAt)
}

export function listParticipantUsers() {
  return getSqlite()
    .prepare(
      `SELECT id, username, display_name FROM users WHERE role = 'participant' ORDER BY display_name COLLATE NOCASE`
    )
    .all()
}

export function listAllSessionsRaw() {
  return getSqlite().prepare('SELECT * FROM sessions').all()
}

export function getSessionById(id) {
  const row = getSqlite().prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  return hydrateSession(row)
}

export function insertSession(s) {
  getSqlite()
    .prepare(
      `INSERT INTO sessions (id, title, organizer_id, starts_at, ends_at, checkin_modes, cancelled,
        participant_scope, allowed_user_ids, joined_user_ids, invite_code_hash, geo_config, qr_config, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      s.id,
      s.title,
      s.organizer_id,
      s.starts_at,
      s.ends_at,
      s.checkin_modes,
      s.cancelled ? 1 : 0,
      s.participant_scope,
      JSON.stringify(s.allowed_user_ids || []),
      JSON.stringify(s.joined_user_ids || []),
      s.invite_code_hash ?? null,
      s.geo_config ?? null,
      s.qr_config ?? null,
      s.created_at
    )
}

export function updateSessionRow(s) {
  getSqlite()
    .prepare(
      `UPDATE sessions SET title=?, starts_at=?, ends_at=?, checkin_modes=?, cancelled=?,
        participant_scope=?, allowed_user_ids=?, joined_user_ids=?, invite_code_hash=?,
        geo_config=?, qr_config=? WHERE id=?`
    ).run(
      s.title,
      s.starts_at,
      s.ends_at,
      s.checkin_modes,
      s.cancelled ? 1 : 0,
      s.participant_scope,
      JSON.stringify(s.allowed_user_ids || []),
      JSON.stringify(s.joined_user_ids || []),
      s.invite_code_hash ?? null,
      s.geo_config ?? null,
      s.qr_config ?? null,
      s.id
    )
}

export function deleteQrState(sessionId) {
  getSqlite().prepare('DELETE FROM session_qr_state WHERE session_id = ?').run(sessionId)
}

export function upsertQrState(sessionId, token, expiresAt) {
  getSqlite()
    .prepare(
      `INSERT INTO session_qr_state (session_id, token, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at`
    )
    .run(sessionId, token, expiresAt)
}

export function getQrStateRow(sessionId) {
  return getSqlite().prepare('SELECT token, expires_at FROM session_qr_state WHERE session_id = ?').get(sessionId)
}

export function appendJoinedUser(sessionId, userId) {
  const s = getSessionById(sessionId)
  if (!s) return false
  const j = [...(s.joined_user_ids || [])]
  if (j.includes(userId)) return true
  j.push(userId)
  getSqlite()
    .prepare('UPDATE sessions SET joined_user_ids = ? WHERE id = ?')
    .run(JSON.stringify(j), sessionId)
  return true
}

export function insertCheckinRecord(r) {
  getSqlite()
    .prepare(
      `INSERT INTO checkin_records (id, session_id, user_id, method, success, failure_code, client_reported_at, server_at, latitude, longitude, accuracy_m, raw_meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      r.id,
      r.session_id,
      r.user_id,
      r.method,
      r.success ? 1 : 0,
      r.failure_code ?? null,
      r.client_reported_at ?? null,
      r.server_at,
      r.latitude ?? null,
      r.longitude ?? null,
      r.accuracy_m ?? null,
      r.raw_meta ?? null
    )
}

export function findSuccessfulCheckin(sessionId, userId) {
  return getSqlite()
    .prepare(
      `SELECT * FROM checkin_records WHERE session_id = ? AND user_id = ? AND success = 1`
    )
    .get(sessionId, userId)
}

export function findCheckinById(id) {
  return getSqlite().prepare('SELECT * FROM checkin_records WHERE id = ?').get(id)
}

export function listCheckinsForSession(sessionId) {
  return getSqlite().prepare('SELECT * FROM checkin_records WHERE session_id = ?').all(sessionId)
}

function seedIfEmpty() {
  if (countUsers() > 0) return
  const now = new Date().toISOString()
  const orgId = randomUUID()
  const partId = randomUUID()
  insertUser({
    id: orgId,
    username: 'organizer',
    passwordHash: bcrypt.hashSync('organizer123', 10),
    displayName: '活动组织者',
    role: 'organizer',
    createdAt: now,
  })
  insertUser({
    id: partId,
    username: 'alice',
    passwordHash: bcrypt.hashSync('alice123', 10),
    displayName: '参与者 Alice',
    role: 'participant',
    createdAt: now,
  })
  insertUser({
    id: randomUUID(),
    username: 'bob',
    passwordHash: bcrypt.hashSync('bob123', 10),
    displayName: '参与者 Bob',
    role: 'participant',
    createdAt: now,
  })
}
