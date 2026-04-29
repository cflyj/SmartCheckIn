/**
 * 人脸样本「替换」治理：冷却 + 人脸类活动开始前冻结窗口。
 * @see docs/FACE_SIGNIN_ANTI_PROXY_PRD.md
 */

import { getSqlite, hydrateSession, getUserFaceDescriptorArr } from '../db.js'

const SESSION_MODES_WITH_FACE = new Set(['FACE', 'GEO_FACE', 'GEO_QR_FACE'])

function envNum(name, def) {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v >= 0 ? v : def
}

/** 冷却小时数；配置的 0 视为未设置，避免误关掉冷却 */
export function getCooldownHours() {
  const raw = envNum('FACE_ENROLLMENT_COOLDOWN_HOURS', 168)
  return raw > 0 ? raw : 168
}

/** 活动开始前冻结窗口（小时）；0 视为未配置，回退 48 */
export function getPresessionFreezeHours() {
  const raw = envNum('FACE_ENROLLMENT_PRESSESSION_FREEZE_HOURS', 48)
  return raw > 0 ? raw : 48
}

/** 最近一次成功写入人脸特征的时间锚点（毫秒）：face_updated_at 与审计较晚者 */
export function getFaceCooldownAnchorMs(userId) {
  const row = getSqlite()
    .prepare(
      `SELECT u.face_updated_at AS fu,
       (SELECT MAX(occurred_at) FROM face_descriptor_audit a WHERE a.user_id = u.id) AS last_audit
       FROM users u WHERE u.id = ?`
    )
    .get(userId)
  const vals = []
  if (row?.fu) {
    const t = new Date(row.fu).getTime()
    if (!Number.isNaN(t)) vals.push(t)
  }
  if (row?.last_audit) {
    const t = new Date(row.last_audit).getTime()
    if (!Number.isNaN(t)) vals.push(t)
  }
  if (!vals.length) return null
  return Math.max(...vals)
}

function normalizeParticipantScope(raw) {
  if (raw === 'roster' || raw === 'invite') return raw
  return 'open'
}

/** 用户是否算作该活动的「需考虑代签风险」的参与者（名单/已加入邀请） */
export function userParticipatesForFacePolicy(row, userId) {
  if (row.cancelled) return false
  const scope = normalizeParticipantScope(row.participant_scope)
  if (scope === 'roster') return (row.allowed_user_ids || []).includes(userId)
  if (scope === 'invite') return (row.joined_user_ids || []).includes(userId)
  return false
}

export function sessionUsesFace(checkinModes) {
  return SESSION_MODES_WITH_FACE.has(checkinModes)
}

/**
 * 处于 [starts_at - freeze, ends_at) 且活动未结束时，禁止「替换」样本（仍允许首次录入）
 */
export function isInPresessionReplacementFreeze(row, freezeMs, nowMs = Date.now()) {
  if (!sessionUsesFace(row.checkin_modes)) return false
  const start = new Date(row.starts_at).getTime()
  const end = new Date(row.ends_at).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return false
  if (nowMs >= end) return false
  const freezeStart = start - freezeMs
  return nowMs >= freezeStart
}

export function listNonEndedSessions() {
  const nowIso = new Date().toISOString()
  return getSqlite()
    .prepare(
      `SELECT * FROM sessions WHERE cancelled = 0 AND datetime(ends_at) > datetime(?)`
    )
    .all(nowIso)
    .map((row) => hydrateSession(row))
}

/**
 * @returns {{ code: 'face_enrollment_cooldown', next_eligible_at: string, message: string } | { code: 'face_enrollment_session_lock', message: string, locked_session: { id: string, title: string }, locked_until_iso: string } | null}
 */
export function getFaceReplacementDenialReason(userId) {
  const existing = getUserFaceDescriptorArr(userId)
  if (!existing) return null

  const freezeH = getPresessionFreezeHours()
  const cooldownH = getCooldownHours()
  const freezeMs = freezeH * 3600000
  const cooldownMs = cooldownH * 3600000
  const now = Date.now()

  const sessions = listNonEndedSessions()
  for (const row of sessions) {
    if (!sessionUsesFace(row.checkin_modes)) continue
    if (!userParticipatesForFacePolicy(row, userId)) continue
    if (!isInPresessionReplacementFreeze(row, freezeMs, now)) continue
    const endIso = row.ends_at
    return {
      code: 'face_enrollment_session_lock',
      message: `你在活动「${row.title}」的人脸相关签到窗口内（含开始前 ${freezeH} 小时至活动结束），暂不能更换人脸样本，以防临场换绑代签。活动结束后可再试。`,
      locked_session: { id: row.id, title: row.title },
      locked_until_iso: endIso,
    }
  }

  const anchorMs = getFaceCooldownAnchorMs(userId)
  if (anchorMs != null && now - anchorMs < cooldownMs) {
    const next = new Date(anchorMs + cooldownMs).toISOString()
    return {
      code: 'face_enrollment_cooldown',
      next_eligible_at: next,
      message: `人脸样本在 ${cooldownH} 小时内仅允许成功保存一次（防频繁换人代签）。约 ${next} 后可再次更换。`,
    }
  }

  return null
}

/**
 * 供 GET /users/me/profile
 */
export function buildFaceEnrollmentPolicyPayload(userId) {
  const has = !!getUserFaceDescriptorArr(userId)
  const cooldownH = getCooldownHours()
  const freezeH = getPresessionFreezeHours()
  const first = !has

  if (first) {
    return {
      cooldown_hours: cooldownH,
      presession_freeze_hours: freezeH,
      is_first_enrollment: true,
      can_submit_new_sample: true,
      blocked_by: null,
      next_replace_eligible_at: null,
      locked_session: null,
      locked_until_session_ends: null,
      policy_note:
        '首次录入完成后，再次更换样本将受冷却与活动窗口限制，以降低代签风险。详见说明文案。',
    }
  }

  const denial = getFaceReplacementDenialReason(userId)

  if (!denial) {
    return {
      cooldown_hours: cooldownH,
      presession_freeze_hours: freezeH,
      is_first_enrollment: false,
      can_submit_new_sample: true,
      blocked_by: null,
      next_replace_eligible_at: null,
      locked_session: null,
      locked_until_session_ends: null,
      policy_note: `更换样本后需间隔至少 ${cooldownH} 小时；若已加入含人脸签到的未结束活动，在活动开始前 ${freezeH} 小时至结束期间不可更换（防临场换绑代签）。`,
    }
  }

  let nextEducational = null
  const anchorHint = getFaceCooldownAnchorMs(userId)
  if (anchorHint != null) {
    nextEducational = new Date(anchorHint + cooldownH * 3600000).toISOString()
  }

  const blockedBy = denial.code === 'face_enrollment_cooldown' ? 'cooldown' : 'session_lock'
  return {
    cooldown_hours: cooldownH,
    presession_freeze_hours: freezeH,
    is_first_enrollment: false,
    can_submit_new_sample: false,
    blocked_by: blockedBy,
    next_replace_eligible_at:
      denial.code === 'face_enrollment_cooldown'
        ? denial.next_eligible_at
        : nextEducational,
    locked_session: denial.locked_session ?? null,
    locked_until_session_ends: denial.locked_until_iso ?? null,
    policy_note: denial.message,
  }
}
