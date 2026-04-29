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
  migrateSessionsRosterOrgs()
  migrateOrganizationsJoinPolicy()
  migrateUserFaceDescriptor()
  seedIfEmpty()
}

function migrateUserFaceDescriptor() {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN face_descriptor TEXT`)
  } catch {
    /* 列已存在 */
  }
}

function migrateOrganizationsJoinPolicy() {
  try {
    db.exec(
      `ALTER TABLE organizations ADD COLUMN join_policy TEXT NOT NULL DEFAULT 'open' CHECK (join_policy IN ('open', 'approval', 'invite_only'))`
    )
  } catch {
    /* 列已存在 */
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS organization_join_requests (
        org_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (org_id, user_id),
        FOREIGN KEY (org_id) REFERENCES organizations(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `)
  } catch {
    /* 表已存在 */
  }
}

function migrateSessionsRosterOrgs() {
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN roster_org_ids TEXT NOT NULL DEFAULT '[]'`)
  } catch {
    /* 列已存在 */
  }
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

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code_hash TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      join_policy TEXT NOT NULL DEFAULT 'open' CHECK (join_policy IN ('open', 'approval', 'invite_only')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS organization_join_requests (
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (org_id, user_id),
      FOREIGN KEY (org_id) REFERENCES organizations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS organization_members (
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
      joined_at TEXT NOT NULL,
      PRIMARY KEY (org_id, user_id),
      FOREIGN KEY (org_id) REFERENCES organizations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
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
    roster_org_ids: parseJsonField(row.roster_org_ids, []),
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

/** @returns {number[] | null} */
export function getUserFaceDescriptorArr(userId) {
  const row = getSqlite().prepare('SELECT face_descriptor FROM users WHERE id = ?').get(userId)
  const arr = parseJsonField(row?.face_descriptor, null)
  if (!Array.isArray(arr) || arr.length !== 128) return null
  const out = []
  for (let i = 0; i < arr.length; i++) {
    const n = Number(arr[i])
    if (!Number.isFinite(n)) return null
    out.push(n)
  }
  return out
}

/** @param {number[]} descriptor */
export function setUserFaceDescriptor(userId, descriptor) {
  getSqlite()
    .prepare('UPDATE users SET face_descriptor = ? WHERE id = ?')
    .run(JSON.stringify(descriptor), userId)
}

/** 模糊匹配用户名或显示名，供管理员点选添加（避免重名昵称歧义） */
export function searchUsersForOrgInvite(rawQuery, orgId, limit = 20) {
  const q = typeof rawQuery === 'string' ? rawQuery.trim() : ''
  if (q.length < 2) return []
  const esc = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const like = `%${esc}%`
  return getSqlite()
    .prepare(
      `SELECT u.id, u.username, u.display_name
       FROM users u
       WHERE (u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')
         AND NOT EXISTS (
           SELECT 1 FROM organization_members m
           WHERE m.org_id = ? AND m.user_id = u.id
         )
       ORDER BY u.username COLLATE NOCASE
       LIMIT ?`
    )
    .all(like, like, orgId, limit)
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
        participant_scope, allowed_user_ids, joined_user_ids, invite_code_hash, geo_config, qr_config, created_at, roster_org_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      s.created_at,
      JSON.stringify(s.roster_org_ids || [])
    )
}

export function updateSessionRow(s) {
  getSqlite()
    .prepare(
      `UPDATE sessions SET title=?, starts_at=?, ends_at=?, checkin_modes=?, cancelled=?,
        participant_scope=?, allowed_user_ids=?, joined_user_ids=?, invite_code_hash=?,
        geo_config=?, qr_config=?, roster_org_ids=? WHERE id=?`
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
      JSON.stringify(s.roster_org_ids || []),
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

/** 批量查询：当前用户在哪些活动已有成功签到记录 */
export function sessionIdsWithSuccessfulCheckinForUser(userId, sessionIds) {
  if (!sessionIds?.length) return new Set()
  const placeholders = sessionIds.map(() => '?').join(',')
  const rows = getSqlite()
    .prepare(
      `SELECT DISTINCT session_id FROM checkin_records
       WHERE user_id = ? AND success = 1 AND session_id IN (${placeholders})`
    )
    .all(userId, ...sessionIds)
  return new Set(rows.map((r) => r.session_id))
}

export function findCheckinById(id) {
  return getSqlite().prepare('SELECT * FROM checkin_records WHERE id = ?').get(id)
}

export function listCheckinsForSession(sessionId) {
  return getSqlite().prepare('SELECT * FROM checkin_records WHERE session_id = ?').all(sessionId)
}

export function normalizeJoinPolicy(p) {
  if (p === 'approval' || p === 'invite_only') return p
  return 'open'
}

export function insertOrganization({ id, name, inviteCodeHash, createdBy, createdAt, joinPolicy }) {
  const policy = normalizeJoinPolicy(joinPolicy ?? 'open')
  getSqlite()
    .prepare(
      `INSERT INTO organizations (id, name, invite_code_hash, created_by, created_at, join_policy) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, name, inviteCodeHash, createdBy, createdAt, policy)
}

export function getOrganizationById(id) {
  return getSqlite().prepare('SELECT * FROM organizations WHERE id = ?').get(id) || null
}

export function deleteOrganizationById(orgId) {
  getSqlite().prepare('DELETE FROM organization_join_requests WHERE org_id = ?').run(orgId)
  getSqlite().prepare('DELETE FROM organization_members WHERE org_id = ?').run(orgId)
  getSqlite().prepare('DELETE FROM organizations WHERE id = ?').run(orgId)
}

export function addOrganizationMember(orgId, userId, role, joinedAt) {
  getSqlite()
    .prepare(`INSERT INTO organization_members (org_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`)
    .run(orgId, userId, role, joinedAt)
}

export function getOrgMemberRole(orgId, userId) {
  const r = getSqlite()
    .prepare('SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?')
    .get(orgId, userId)
  return r?.role ?? null
}

export function countOrgMembers(orgId) {
  return getSqlite().prepare('SELECT COUNT(*) AS c FROM organization_members WHERE org_id = ?').get(orgId).c
}

export function listOrganizationsForUser(userId) {
  return getSqlite()
    .prepare(
      `SELECT o.id, o.name, o.created_at, m.role AS my_role, m.joined_at
       FROM organizations o
       INNER JOIN organization_members m ON m.org_id = o.id AND m.user_id = ?
       ORDER BY o.name COLLATE NOCASE`
    )
    .all(userId)
}

export function listOrgMembersWithProfile(orgId) {
  return getSqlite()
    .prepare(
      `SELECT u.id, u.username, u.display_name, m.role, m.joined_at
       FROM organization_members m
       INNER JOIN users u ON u.id = m.user_id
       WHERE m.org_id = ?
       ORDER BY u.display_name COLLATE NOCASE`
    )
    .all(orgId)
}

export function removeOrganizationMember(orgId, userId) {
  getSqlite().prepare('DELETE FROM organization_members WHERE org_id = ? AND user_id = ?').run(orgId, userId)
}

export function setOrgMemberRole(orgId, userId, role) {
  getSqlite()
    .prepare('UPDATE organization_members SET role = ? WHERE org_id = ? AND user_id = ?')
    .run(role, orgId, userId)
}

export function updateOrganizationName(orgId, name) {
  getSqlite().prepare('UPDATE organizations SET name = ? WHERE id = ?').run(name, orgId)
}

export function updateOrganizationInviteHash(orgId, hash) {
  getSqlite().prepare('UPDATE organizations SET invite_code_hash = ? WHERE id = ?').run(hash, orgId)
}

export function updateOrganizationJoinPolicy(orgId, policy) {
  getSqlite()
    .prepare('UPDATE organizations SET join_policy = ? WHERE id = ?')
    .run(normalizeJoinPolicy(policy), orgId)
}

export function getJoinRequest(orgId, userId) {
  return (
    getSqlite()
      .prepare('SELECT org_id, user_id, created_at FROM organization_join_requests WHERE org_id = ? AND user_id = ?')
      .get(orgId, userId) || null
  )
}

export function insertJoinRequest(orgId, userId, createdAt) {
  getSqlite()
    .prepare('INSERT INTO organization_join_requests (org_id, user_id, created_at) VALUES (?, ?, ?)')
    .run(orgId, userId, createdAt)
}

export function deleteJoinRequest(orgId, userId) {
  getSqlite().prepare('DELETE FROM organization_join_requests WHERE org_id = ? AND user_id = ?').run(orgId, userId)
}

export function listPendingJoinRequestsWithProfile(orgId) {
  return getSqlite()
    .prepare(
      `SELECT r.user_id, r.created_at, u.username, u.display_name
       FROM organization_join_requests r
       INNER JOIN users u ON u.id = r.user_id
       WHERE r.org_id = ?
       ORDER BY r.created_at ASC`
    )
    .all(orgId)
}

/** 与明文加入码匹配的所有组织（相同明文在不同组织会存成不同 bcrypt 盐，但都会校验通过） */
export function findOrganizationIdsByJoinCode(plain) {
  const rows = getSqlite().prepare('SELECT id, invite_code_hash FROM organizations').all()
  const ids = []
  for (const r of rows) {
    if (r.invite_code_hash && bcrypt.compareSync(plain, r.invite_code_hash)) ids.push(r.id)
  }
  return ids
}

/** 明文加入码是否已被任一组织使用（新建/换码时排除当前组织自身） */
export function isPlainJoinCodeTaken(plain, excludeOrgId = null) {
  const ids = findOrganizationIdsByJoinCode(plain)
  if (excludeOrgId == null) return ids.length > 0
  return ids.some((id) => id !== excludeOrgId)
}

export function unionMemberIdsForOrgs(orgIds) {
  if (!orgIds?.length) return new Set()
  const placeholders = orgIds.map(() => '?').join(',')
  const rows = getSqlite()
    .prepare(
      `SELECT DISTINCT user_id FROM organization_members WHERE org_id IN (${placeholders})`
    )
    .all(...orgIds)
  return new Set(rows.map((r) => r.user_id))
}

export function userMemberOfAllOrgs(userId, orgIds) {
  if (!orgIds?.length) return false
  for (const oid of orgIds) {
    if (!getOrgMemberRole(oid, userId)) return false
  }
  return true
}

function seedIfEmpty() {
  if (countUsers() > 0) return
  const now = new Date().toISOString()
  const organizerUserId = randomUUID()
  const aliceId = randomUUID()
  const bobId = randomUUID()
  insertUser({
    id: organizerUserId,
    username: 'organizer',
    passwordHash: bcrypt.hashSync('organizer123', 10),
    displayName: '活动组织者',
    role: 'organizer',
    createdAt: now,
  })
  insertUser({
    id: aliceId,
    username: 'alice',
    passwordHash: bcrypt.hashSync('alice123', 10),
    displayName: '参与者 Alice',
    role: 'participant',
    createdAt: now,
  })
  insertUser({
    id: bobId,
    username: 'bob',
    passwordHash: bcrypt.hashSync('bob123', 10),
    displayName: '参与者 Bob',
    role: 'participant',
    createdAt: now,
  })
  const demoOrgId = randomUUID()
  insertOrganization({
    id: demoOrgId,
    name: '演示组织',
    inviteCodeHash: bcrypt.hashSync('DEMO2026', 10),
    createdBy: organizerUserId,
    createdAt: now,
  })
  addOrganizationMember(demoOrgId, organizerUserId, 'owner', now)
  addOrganizationMember(demoOrgId, aliceId, 'member', now)
  addOrganizationMember(demoOrgId, bobId, 'member', now)
}
