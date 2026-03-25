import { Router } from 'express'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import {
  getSqlite,
  sessionComputedStatus,
  parseJsonField,
  hydrateSession,
  findUserById,
  getSessionById,
  insertSession,
  updateSessionRow,
  deleteQrState,
  insertCheckinRecord,
  findSuccessfulCheckin,
  sessionIdsWithSuccessfulCheckinForUser,
  findCheckinById,
  listCheckinsForSession,
  appendJoinedUser,
  unionMemberIdsForOrgs,
  userMemberOfAllOrgs,
} from '../db.js'
import { ok, fail } from '../utils/response.js'
import { authRequired } from '../middleware/auth.js'
import { haversineMeters } from '../utils/geo.js'
import {
  defaultQrConfig,
  mergeQrConfig,
  rotateQrForSession,
  ensureQrRow,
  getQrState,
} from '../services/qrToken.js'

const router = Router()

function hasGeo(mode) {
  return mode === 'GEO' || mode === 'BOTH'
}

function hasQr(mode) {
  return mode === 'QR' || mode === 'BOTH'
}

function normalizeScope(s) {
  if (s === 'roster' || s === 'invite') return s
  return 'open'
}

/** 新建活动仅允许名单制 / 邀请码制 */
function scopeForCreate(s) {
  return s === 'roster' || s === 'invite' ? s : null
}

function canAttendSession(row, user) {
  if (!row || row.cancelled) return false
  const scope = normalizeScope(row.participant_scope)
  if (scope === 'open') return true
  if (scope === 'roster') return (row.allowed_user_ids || []).includes(user.id)
  if (scope === 'invite') {
    if (row.organizer_id === user.id) return true
    return (row.joined_user_ids || []).includes(user.id)
  }
  return false
}

function isSessionOwner(row, user) {
  return row.organizer_id === user.id
}

function participantListedSession(row, user) {
  const scope = normalizeScope(row.participant_scope)
  // 不再在「可参加活动」列表里展示历史「任何人可签到」活动，减少无关打扰（仍可通过直链访问与签到）
  if (scope === 'open') return false
  if (scope === 'roster') return (row.allowed_user_ids || []).includes(user.id)
  // 邀请制：未加入也应出现在列表，进入详情页输入口令后加入（与 GET /:id 的 join_required 一致）
  if (scope === 'invite') return true
  return false
}

function mapSessionRow(row) {
  if (!row) return null
  const status = sessionComputedStatus(row)
  return {
    id: row.id,
    title: row.title,
    organizer_id: row.organizer_id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    checkin_modes: row.checkin_modes,
    status,
    participant_scope: normalizeScope(row.participant_scope),
    geo_config: parseJsonField(row.geo_config),
    qr_config: mergeQrConfig(row.qr_config),
    created_at: row.created_at,
  }
}

function mapSessionDetail(reqUser, row, extra = {}) {
  const base = { ...mapSessionRow(row), ...extra }
  if (isSessionOwner(row, reqUser)) {
    base.allowed_user_ids = [...(row.allowed_user_ids || [])]
    base.joined_user_ids = [...(row.joined_user_ids || [])]
    base.roster_org_ids = [...(row.roster_org_ids || [])]
    base.has_invite_code = normalizeScope(row.participant_scope) === 'invite' && !!row.invite_code_hash
  }
  return base
}

function loadSession(id) {
  return getSessionById(id)
}

function listSessionsHosted(user) {
  const all = getSqlite()
    .prepare('SELECT * FROM sessions WHERE cancelled = 0')
    .all()
    .map(hydrateSession)
  return all.filter((s) => s.organizer_id === user.id)
}

function listSessionsAttendable(user) {
  const all = getSqlite()
    .prepare('SELECT * FROM sessions WHERE cancelled = 0')
    .all()
    .map(hydrateSession)
  return all.filter((s) => participantListedSession(s, user))
}

function assertSessionAccess(req, res, row) {
  if (!row) {
    fail(res, 404, 'session_not_found', '活动不存在')
    return true
  }
  if (row.cancelled && req.user.role === 'participant') {
    fail(res, 404, 'session_not_found', '活动不存在')
    return true
  }
  return false
}

function assertTimeWindow(res, status) {
  if (status === 'scheduled') {
    fail(res, 409, 'session_not_started', '签到尚未开始')
    return true
  }
  if (status === 'ended') {
    fail(res, 409, 'session_ended', '签到已结束')
    return true
  }
  if (status === 'cancelled') {
    fail(res, 409, 'session_ended', '活动已取消')
    return true
  }
  return false
}

function assertCanCheckIn(req, res, row) {
  if (canAttendSession(row, req.user)) return false
  if (isSessionOwner(row, req.user)) {
    fail(
      res,
      403,
      'organizer_not_in_roster',
      '你是活动发起者但未满足参与条件（例如名单制未包含你，或邀请制需先输入活动邀请码）。'
    )
    return true
  }
  fail(
    res,
    403,
    'not_on_roster',
    '你无权签到该活动。若为邀请制，请先输入邀请码；若为名单制，请联系组织者。'
  )
  return true
}

function validateRosterIds(allowedIds) {
  if (!Array.isArray(allowedIds) || allowedIds.length === 0) {
    return '名单模式下至少选择一名成员，或勾选「我也参与签到」'
  }
  const uniq = [...new Set(allowedIds)]
  const userMap = new Map(getSqlite().prepare('SELECT id FROM users').all().map((u) => [u.id, true]))
  for (const uid of uniq) {
    if (!userMap.get(uid)) return '存在无效的用户'
  }
  return null
}

/** 名单中所有人须属于所选组织并集；发起者须为每个所选组织的成员 */
function validateRosterWithOrgs(allowedIds, rosterOrgIds, organizerId) {
  const err = validateRosterIds(allowedIds)
  if (err) return err
  const orgIds = Array.isArray(rosterOrgIds) ? [...new Set(rosterOrgIds.map(String).filter(Boolean))] : []
  if (orgIds.length === 0) return '名单制需至少选择一个组织，用于限定可选签到成员范围'
  if (!userMemberOfAllOrgs(organizerId, orgIds)) return '你只能从你已加入的组织中选择范围'
  const pool = unionMemberIdsForOrgs(orgIds)
  for (const uid of [...new Set(allowedIds)]) {
    if (!pool.has(uid)) return '名单中有人不在所选组织的成员范围内'
  }
  return null
}

router.use(authRequired)

router.get('/', (req, res) => {
  const mine = req.query.mine === '1' || req.query.mine === 'true'
  const rows = mine ? listSessionsHosted(req.user) : listSessionsAttendable(req.user)
  rows.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
  const sessionIds = rows.map((r) => r.id)
  const checkedInSet = sessionIdsWithSuccessfulCheckinForUser(req.user.id, sessionIds)
  ok(res, {
    sessions: rows.map((row) => ({
      ...mapSessionRow(row),
      has_checked_in: checkedInSet.has(row.id),
    })),
  })
})

router.post('/', (req, res) => {
  const {
    title,
    starts_at,
    ends_at,
    checkin_modes,
    geo_config,
    qr_config: bodyQr,
    participant_scope: scopeIn,
    allowed_user_ids: allowedIn,
    invite_code: invitePlain,
    roster_org_ids: rosterOrgIdsIn,
  } = req.body || {}

  if (!title || !starts_at || !ends_at || !checkin_modes) {
    return fail(res, 422, 'validation_error', '请填写标题与时间')
  }
  if (!['GEO', 'QR', 'BOTH'].includes(checkin_modes)) {
    return fail(res, 422, 'validation_error', '签到方式须为 GEO、QR 或 BOTH')
  }

  const participant_scope = scopeForCreate(scopeIn)
  if (!participant_scope) {
    return fail(
      res,
      422,
      'validation_error',
      '请选择「仅指定成员」或「邀请码」；已不再提供「任何人可签到」，避免无关用户收到干扰'
    )
  }
  let allowed_user_ids = Array.isArray(allowedIn) ? [...new Set(allowedIn)] : []
  let roster_org_ids = Array.isArray(rosterOrgIdsIn) ? [...new Set(rosterOrgIdsIn.map(String).filter(Boolean))] : []
  let joined_user_ids = []
  let invite_code_hash = null

  if (participant_scope === 'roster') {
    const err = validateRosterWithOrgs(allowed_user_ids, roster_org_ids, req.user.id)
    if (err) return fail(res, 422, 'validation_error', err)
  } else {
    const code = typeof invitePlain === 'string' ? invitePlain.trim() : ''
    if (code.length < 4) {
      return fail(res, 422, 'validation_error', '邀请码至少 4 位，请设置后告知参与者')
    }
    invite_code_hash = bcrypt.hashSync(code, 10)
    joined_user_ids = [req.user.id]
    roster_org_ids = []
    allowed_user_ids = []
  }

  if (hasGeo(checkin_modes)) {
    const g = geo_config
    if (!g?.center || typeof g.center.lat !== 'number' || typeof g.center.lng !== 'number') {
      return fail(res, 422, 'validation_error', '地理签到需要中心点坐标')
    }
    if (typeof g.radius_m !== 'number' || g.radius_m <= 0) {
      return fail(res, 422, 'validation_error', '请设置有效围栏半径（米）')
    }
  }

  const id = randomUUID()
  const now = new Date().toISOString()
  const geoJson =
    hasGeo(checkin_modes) && geo_config ? JSON.stringify(geo_config) : null
  const qrMerged = hasQr(checkin_modes) ? { ...defaultQrConfig(), ...bodyQr } : null
  const qrJson = qrMerged ? JSON.stringify(qrMerged) : null

  try {
    insertSession({
      id,
      title,
      organizer_id: req.user.id,
      starts_at,
      ends_at,
      checkin_modes,
      cancelled: false,
      participant_scope,
      allowed_user_ids,
      joined_user_ids,
      invite_code_hash,
      geo_config: geoJson,
      qr_config: qrJson,
      created_at: now,
      roster_org_ids,
    })
    if (hasQr(checkin_modes)) {
      rotateQrForSession(id, qrMerged)
    }
    ok(res, { session: mapSessionDetail(req.user, loadSession(id)) })
  } catch (e) {
    console.error(e)
    return fail(res, 500, 'server_error', '创建失败')
  }
})

router.put('/:id', (req, res) => {
  const row = loadSession(req.params.id)
  if (!row || row.organizer_id !== req.user.id) {
    return fail(res, 404, 'session_not_found', '活动不存在')
  }

  const {
    title,
    starts_at,
    ends_at,
    checkin_modes,
    geo_config,
    qr_config: bodyQr,
    cancelled,
    participant_scope: scopeIn,
    allowed_user_ids: allowedIn,
    invite_code: invitePlain,
    roster_org_ids: rosterOrgIdsBody,
  } = req.body || {}

  const modes = checkin_modes || row.checkin_modes
  if (!['GEO', 'QR', 'BOTH'].includes(modes)) {
    return fail(res, 422, 'validation_error', '签到方式无效')
  }

  if (scopeIn === 'open') {
    return fail(
      res,
      422,
      'validation_error',
      '已不再支持「任何人可签到」，请改为「仅指定成员」或「邀请码」'
    )
  }
  const participant_scope =
    scopeIn === 'roster' || scopeIn === 'invite'
      ? scopeIn
      : normalizeScope(row.participant_scope)

  let allowed_user_ids = row.allowed_user_ids || []
  if (Array.isArray(allowedIn)) {
    allowed_user_ids = [...new Set(allowedIn)]
  }

  let joined_user_ids = [...(row.joined_user_ids || [])]
  let invite_code_hash = row.invite_code_hash
  let roster_org_ids = [...(row.roster_org_ids || [])]

  if (participant_scope === 'roster') {
    if (Array.isArray(rosterOrgIdsBody)) {
      roster_org_ids = [...new Set(rosterOrgIdsBody.map(String).filter(Boolean))]
    }
    const err = validateRosterWithOrgs(allowed_user_ids, roster_org_ids, req.user.id)
    if (err) return fail(res, 422, 'validation_error', err)
    invite_code_hash = null
  } else if (participant_scope === 'invite') {
    allowed_user_ids = []
    roster_org_ids = []
    if (!joined_user_ids.includes(req.user.id)) joined_user_ids.push(req.user.id)
    if (typeof invitePlain === 'string' && invitePlain.trim().length >= 4) {
      invite_code_hash = bcrypt.hashSync(invitePlain.trim(), 10)
    }
    if (!invite_code_hash) {
      return fail(res, 422, 'validation_error', '邀请制需设置邀请码（至少 4 位），或保留原邀请码不填新码时勿清空')
    }
  } else {
    /* 历史 participant_scope === open：未改为 roster/invite 时保留原字段，避免误清空 */
    if (Array.isArray(allowedIn)) allowed_user_ids = [...new Set(allowedIn)]
    if (Array.isArray(rosterOrgIdsBody)) {
      roster_org_ids = [...new Set(rosterOrgIdsBody.map(String).filter(Boolean))]
    }
    invite_code_hash = row.invite_code_hash
    joined_user_ids = [...(row.joined_user_ids || [])]
  }

  let geoJson = row.geo_config
  if (typeof row.geo_config === 'string') {
    /* keep */
  }
  if (hasGeo(modes)) {
    if (geo_config) geoJson = JSON.stringify(geo_config)
  } else {
    geoJson = null
  }

  let qrJson = row.qr_config
  if (typeof row.qr_config === 'string') {
    /* */
  }
  if (hasQr(modes)) {
    const merged = { ...mergeQrConfig(row.qr_config), ...bodyQr }
    qrJson = JSON.stringify(merged)
  } else {
    qrJson = null
    deleteQrState(row.id)
  }

  row.title = title ?? row.title
  row.starts_at = starts_at ?? row.starts_at
  row.ends_at = ends_at ?? row.ends_at
  row.checkin_modes = modes
  row.cancelled = typeof cancelled === 'boolean' ? cancelled : row.cancelled
  row.participant_scope = participant_scope
  row.allowed_user_ids = allowed_user_ids
  row.joined_user_ids = joined_user_ids
  row.invite_code_hash = invite_code_hash
  row.roster_org_ids = roster_org_ids
  row.geo_config = geoJson
  row.qr_config = qrJson

  updateSessionRow(row)

  if (hasQr(modes)) {
    rotateQrForSession(row.id, mergeQrConfig(qrJson))
  }

  ok(res, { session: mapSessionDetail(req.user, loadSession(row.id)) })
})

router.post('/:id/join', (req, res) => {
  const row = loadSession(req.params.id)
  if (assertSessionAccess(req, res, row)) return
  if (normalizeScope(row.participant_scope) !== 'invite') {
    return fail(res, 409, 'not_invite_mode', '该活动不是邀请码制，无需加入')
  }
  const { code } = req.body || {}
  const plain = typeof code === 'string' ? code.trim() : ''
  if (!plain) {
    return fail(res, 422, 'validation_error', '请输入邀请码')
  }
  if (!row.invite_code_hash || !bcrypt.compareSync(plain, row.invite_code_hash)) {
    return fail(res, 422, 'invite_code_invalid', '邀请码不正确')
  }
  appendJoinedUser(row.id, req.user.id)
  ok(res, { session: mapSessionDetail(req.user, loadSession(row.id)), joined: true })
})

router.get('/:id/qr/current', (req, res) => {
  const row = loadSession(req.params.id)
  if (!row || row.organizer_id !== req.user.id) {
    return fail(res, 404, 'session_not_found', '活动不存在')
  }
  if (!hasQr(row.checkin_modes)) {
    return fail(res, 409, 'mode_not_allowed', '该活动未开启二维码签到')
  }
  const qrConfig = mergeQrConfig(row.qr_config)
  const state = ensureQrRow(row.id, qrConfig)
  ok(res, {
    token: state.token,
    expires_at: state.expires_at,
    checkin_url: `/participant/sessions/${row.id}?token=${encodeURIComponent(state.token)}`,
  })
})

router.post('/:id/checkin/geo', (req, res) => {
  const row = loadSession(req.params.id)
  if (assertSessionAccess(req, res, row)) return
  if (assertCanCheckIn(req, res, row)) return

  const status = sessionComputedStatus(row)
  if (assertTimeWindow(res, status)) return

  if (!hasGeo(row.checkin_modes)) {
    return fail(res, 409, 'mode_not_allowed', '该活动未开启地理位置签到')
  }

  const geo = parseJsonField(row.geo_config)
  if (!geo?.center) {
    return fail(res, 422, 'validation_error', '活动未配置地理围栏')
  }

  const { lat, lng, accuracy_m, client_time } = req.body || {}
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return fail(res, 422, 'validation_error', '请提供有效经纬度')
  }

  if (geo.min_accuracy_m != null && geo.min_accuracy_m > 0) {
    if (accuracy_m != null && typeof accuracy_m === 'number' && accuracy_m > geo.min_accuracy_m) {
      return fail(
        res,
        422,
        'accuracy_too_low',
        `定位精度约 ${Math.round(accuracy_m)} 米，活动要求不劣于 ${geo.min_accuracy_m} 米。可到室外重试，或请组织者关闭精度限制 / 增大阈值。`
      )
    }
  }

  const dist = haversineMeters(lat, lng, geo.center.lat, geo.center.lng)
  const serverAt = new Date().toISOString()

  const existing = findSuccessfulCheckin(row.id, req.user.id)
  if (existing) {
    return ok(res, {
      record: formatRecord(existing),
      already_checked_in: true,
    })
  }

  if (dist > geo.radius_m) {
    const failId = randomUUID()
    try {
      insertCheckinRecord({
        id: failId,
        session_id: row.id,
        user_id: req.user.id,
        method: 'geo',
        success: false,
        failure_code: 'outside_geofence',
        client_reported_at: client_time || null,
        server_at: serverAt,
        latitude: lat,
        longitude: lng,
        accuracy_m: accuracy_m ?? null,
        raw_meta: null,
      })
    } catch (e) {
      console.error(e)
    }
    return fail(res, 422, 'outside_geofence', `当前位置超出允许范围（约 ${Math.round(dist)} 米）`)
  }

  const succId = randomUUID()
  try {
    insertCheckinRecord({
      id: succId,
      session_id: row.id,
      user_id: req.user.id,
      method: 'geo',
      success: true,
      failure_code: null,
      client_reported_at: client_time || null,
      server_at: serverAt,
      latitude: lat,
      longitude: lng,
      accuracy_m: accuracy_m ?? null,
      raw_meta: null,
    })
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      const r = findSuccessfulCheckin(row.id, req.user.id)
      return ok(res, { record: formatRecord(r), already_checked_in: true })
    }
    throw e
  }

  const created = findCheckinById(succId)
  ok(res, { record: formatRecord(created), already_checked_in: false })
})

router.post('/:id/checkin/qr', (req, res) => {
  const row = loadSession(req.params.id)
  if (assertSessionAccess(req, res, row)) return
  if (assertCanCheckIn(req, res, row)) return

  const status = sessionComputedStatus(row)
  if (assertTimeWindow(res, status)) return

  if (!hasQr(row.checkin_modes)) {
    return fail(res, 409, 'mode_not_allowed', '该活动未开启二维码签到')
  }

  const { token } = req.body || {}
  if (!token || typeof token !== 'string') {
    return fail(res, 422, 'validation_error', '请提供签到令牌')
  }

  const qrConfig = mergeQrConfig(row.qr_config)
  const state = getQrState(row.id)
  if (!state) {
    return fail(res, 422, 'qr_token_invalid', '二维码无效')
  }

  const expired = new Date(state.expires_at).getTime() <= Date.now()
  if (expired) {
    return fail(res, 422, 'qr_token_expired', '二维码已过期，请刷新后重扫')
  }
  if (state.token !== token.trim()) {
    return fail(res, 422, 'qr_token_invalid', '二维码无效或已更新')
  }

  const serverAt = new Date().toISOString()

  const existing = findSuccessfulCheckin(row.id, req.user.id)
  if (existing) {
    return ok(res, {
      record: formatRecord(existing),
      already_checked_in: true,
    })
  }

  const succId = randomUUID()
  try {
    insertCheckinRecord({
      id: succId,
      session_id: row.id,
      user_id: req.user.id,
      method: 'qr',
      success: true,
      failure_code: null,
      client_reported_at: null,
      server_at: serverAt,
      latitude: null,
      longitude: null,
      accuracy_m: null,
      raw_meta: null,
    })
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      const r = findSuccessfulCheckin(row.id, req.user.id)
      return ok(res, { record: formatRecord(r), already_checked_in: true })
    }
    throw e
  }

  if (!qrConfig.allow_reuse_within_ttl) {
    rotateQrForSession(row.id, qrConfig)
  }

  const created = findCheckinById(succId)
  ok(res, { record: formatRecord(created), already_checked_in: false })
})

router.get('/:id/stats', (req, res) => {
  const row = loadSession(req.params.id)
  if (!row || row.organizer_id !== req.user.id) {
    return fail(res, 404, 'session_not_found', '活动不存在')
  }

  const recs = listCheckinsForSession(row.id)
  const successCount = recs.filter((r) => r.success).length
  const byMethod = { geo: 0, qr: 0 }
  recs.filter((r) => r.success).forEach((r) => {
    if (r.method === 'geo') byMethod.geo += 1
    if (r.method === 'qr') byMethod.qr += 1
  })
  const failMap = {}
  recs
    .filter((r) => !r.success && r.failure_code)
    .forEach((r) => {
      failMap[r.failure_code] = (failMap[r.failure_code] || 0) + 1
    })
  const failure_top = Object.entries(failMap)
    .map(([failure_code, c]) => ({ failure_code, c }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 10)

  ok(res, {
    session_id: row.id,
    success_count: successCount,
    total_attempts: recs.length,
    by_method: byMethod,
    failure_top,
  })
})

router.get('/:id/records', (req, res) => {
  const row = loadSession(req.params.id)
  if (!row || row.organizer_id !== req.user.id) {
    return fail(res, 404, 'session_not_found', '活动不存在')
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30))

  let list = listCheckinsForSession(row.id)
  if (req.query.success === 'true') list = list.filter((r) => r.success)
  else if (req.query.success === 'false') list = list.filter((r) => !r.success)
  list.sort((a, b) => new Date(b.server_at) - new Date(a.server_at))
  const offset = (page - 1) * limit
  const slice = list.slice(offset, offset + limit)

  const records = slice.map((r) => {
    const u = findUserById(r.user_id)
    return {
      ...formatRecord(r),
      user_display_name: u?.display_name,
      username: u?.username,
    }
  })

  ok(res, { records, page, limit })
})

router.get('/:id/export', (req, res) => {
  const row = loadSession(req.params.id)
  if (!row || row.organizer_id !== req.user.id) {
    return fail(res, 404, 'session_not_found', '活动不存在')
  }

  const records = listCheckinsForSession(row.id)
    .filter((r) => r.success)
    .sort((a, b) => new Date(a.server_at) - new Date(b.server_at))

  const users = getSqlite().prepare('SELECT id, username, display_name FROM users').all()
  const umap = new Map(users.map((u) => [u.id, u]))

  const header = 'display_name,username,method,server_at\n'
  const lines = records.map((r) => {
    const u = umap.get(r.user_id)
    return [csvEscape(u?.display_name), csvEscape(u?.username), r.method, r.server_at].join(',')
  })
  const body = header + lines.join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="checkin-${row.id.slice(0, 8)}.csv"`
  )
  res.send('\uFEFF' + body)
})

router.get('/:id', (req, res) => {
  const row = loadSession(req.params.id)
  if (assertSessionAccess(req, res, row)) return

  const owner = isSessionOwner(row, req.user)
  const scope = normalizeScope(row.participant_scope)

  if (!owner) {
    if (scope === 'roster' && !(row.allowed_user_ids || []).includes(req.user.id)) {
      return fail(
        res,
        403,
        'not_on_roster',
        '你不在该活动的签到名单中，请联系组织者。'
      )
    }
    if (
      scope === 'invite' &&
      row.organizer_id !== req.user.id &&
      !(row.joined_user_ids || []).includes(req.user.id)
    ) {
      return ok(res, {
        session: {
          id: row.id,
          title: row.title,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          checkin_modes: row.checkin_modes,
          status: sessionComputedStatus(row),
          participant_scope: 'invite',
          join_required: true,
          created_at: row.created_at,
        },
      })
    }
  }

  ok(res, { session: mapSessionDetail(req.user, row) })
})

function csvEscape(s) {
  if (s == null) return ''
  const t = String(s)
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}

function formatRecord(r) {
  return {
    id: r.id,
    session_id: r.session_id,
    user_id: r.user_id,
    method: r.method,
    success: !!r.success,
    failure_code: r.failure_code,
    client_reported_at: r.client_reported_at,
    server_at: r.server_at,
    latitude: r.latitude,
    longitude: r.longitude,
    accuracy_m: r.accuracy_m,
  }
}

export default router
