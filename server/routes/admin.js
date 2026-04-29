import { Router } from 'express'
import { randomUUID } from 'crypto'
import {
  adminCancelSession,
  banUser,
  countOrganizationsTotal,
  countSessionsTotal,
  countUsersTotal,
  deleteOrganizationById,
  findUserById,
  getOrganizationById,
  getSessionById,
  insertAdminAuditLog,
  listAdminAuditLogs,
  listOrganizationsGlobal,
  listSessionsForAdminRecent,
  listUsersForAdminSearch,
  stripOrgFromAllSessionRosters,
  unbanUser,
} from '../db.js'
import { ok, fail } from '../utils/response.js'
import { authRequired } from '../middleware/auth.js'
import { superAdminRequired } from '../middleware/superAdmin.js'
import { resolveSuperAdminUserIds } from '../services/superAdminEnv.js'

const router = Router()

router.use(authRequired)
router.use(superAdminRequired)

router.get('/overview', (_req, res) => {
  ok(res, {
    users: countUsersTotal(),
    organizations: countOrganizationsTotal(),
    sessions: countSessionsTotal(),
  })
})

router.get('/audit-log', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50
  const action = typeof req.query.action === 'string' ? req.query.action.trim() : ''
  const rows = listAdminAuditLogs(limit, action)
  ok(res, { entries: rows })
})

router.get('/organizations', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : ''
  ok(res, { organizations: listOrganizationsGlobal(q) })
})

router.delete('/organizations/:id', (req, res) => {
  const orgId = req.params.id
  const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  const org = getOrganizationById(orgId)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  stripOrgFromAllSessionRosters(orgId)
  deleteOrganizationById(orgId)
  const createdAt = new Date().toISOString()
  insertAdminAuditLog({
    id: randomUUID(),
    actor_user_id: req.user.id,
    action: 'delete_org',
    target_type: 'organization',
    target_id: orgId,
    reason: rawReason || null,
    meta_json: { name_snapshot: org.name },
    created_at: createdAt,
  })
  ok(res, { ok: true })
})

router.get('/users', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : ''
  const limit = parseInt(req.query.limit, 10) || 40
  const filterRaw = typeof req.query.account === 'string' ? req.query.account.trim().toLowerCase() : ''
  const account =
    filterRaw === 'banned' ? 'banned' : filterRaw === 'active' ? 'active' : 'all'
  ok(res, { users: listUsersForAdminSearch(q, limit, account) })
})

router.post('/users/:id/ban', (req, res) => {
  const targetId = req.params.id
  if (targetId === req.user.id) {
    return fail(res, 403, 'cannot_ban_self', '不可封禁当前登录账号')
  }
  if (resolveSuperAdminUserIds().has(targetId)) {
    return fail(res, 403, 'cannot_ban_super_admin', '不可封禁平台管理员账号')
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (reason.length < 2) {
    return fail(res, 422, 'validation_error', '请填写封号原因（至少 2 个字符）')
  }
  const u = findUserById(targetId)
  if (!u) return fail(res, 404, 'user_not_found', '用户不存在')
  banUser(targetId, { bannedBy: req.user.id, reason })
  insertAdminAuditLog({
    id: randomUUID(),
    actor_user_id: req.user.id,
    action: 'ban_user',
    target_type: 'user',
    target_id: targetId,
    reason,
    meta_json: { username: u.username },
    created_at: new Date().toISOString(),
  })
  ok(res, { ok: true })
})

router.post('/users/:id/unban', (req, res) => {
  const targetId = req.params.id
  const u = findUserById(targetId)
  if (!u) return fail(res, 404, 'user_not_found', '用户不存在')
  unbanUser(targetId)
  insertAdminAuditLog({
    id: randomUUID(),
    actor_user_id: req.user.id,
    action: 'unban_user',
    target_type: 'user',
    target_id: targetId,
    reason: typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 400) || null : null,
    meta_json: { username: u.username },
    created_at: new Date().toISOString(),
  })
  ok(res, { ok: true })
})

router.get('/sessions', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 80
  const raw = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : ''
  const status =
    raw === 'active' ? 'active' : raw === 'cancelled' ? 'cancelled' : 'all'
  ok(res, { sessions: listSessionsForAdminRecent(limit, status) })
})

router.post('/sessions/:id/cancel', (req, res) => {
  const sessionId = req.params.id
  const row = getSessionById(sessionId)
  if (!row) return fail(res, 404, 'session_not_found', '活动不存在')
  adminCancelSession(sessionId, true)
  const rawReason =
    typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 600) : ''
  insertAdminAuditLog({
    id: randomUUID(),
    actor_user_id: req.user.id,
    action: 'cancel_session',
    target_type: 'session',
    target_id: sessionId,
    reason: rawReason || null,
    meta_json: { title: row.title, organizer_id: row.organizer_id },
    created_at: new Date().toISOString(),
  })
  ok(res, { ok: true })
})

export default router
