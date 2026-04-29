import { Router } from 'express'
import { findUserByUsername, getSqlite, setUserFaceDescriptor, getUserFaceDescriptorArr, insertFaceDescriptorAudit } from '../db.js'
import { ok, fail } from '../utils/response.js'
import { authRequired } from '../middleware/auth.js'
import {
  buildFaceEnrollmentPolicyPayload,
  getFaceReplacementDenialReason,
} from '../services/faceEnrollmentPolicy.js'
import { assertProbeDetectionAcceptable } from '../services/faceVerify.js'
import { sessionUserPayload } from '../utils/sessionUserPayload.js'

const router = Router()
const MAX_RESOLVE = 50

/** 当前会话用户（前端用于刷新权限与 is_super_admin） */
router.get('/me', authRequired, (req, res) => {
  ok(res, sessionUserPayload(req.user))
})

router.get('/me/profile', authRequired, (req, res) => {
  const arr = getUserFaceDescriptorArr(req.user.id)
  ok(res, {
    has_face_descriptor: !!arr,
    face_enrollment: buildFaceEnrollmentPolicyPayload(req.user.id),
  })
})

/** 录入 / 覆盖人脸样本（仅存 128 维 descriptor JSON，不存储照片）。
 * 「替换」受冷却与活动窗口限制 — `docs/FACE_SIGNIN_ANTI_PROXY_PRD.md`
 */
router.post('/me/face', authRequired, (req, res) => {
  const d = req.body?.descriptor
  if (!Array.isArray(d) || d.length !== 128) {
    return fail(res, 422, 'validation_error', '请提供长度为 128 的人脸特征向量')
  }
  const nums = []
  for (let i = 0; i < d.length; i++) {
    const n = Number(d[i])
    if (!Number.isFinite(n)) {
      return fail(res, 422, 'validation_error', '向量含非法数值')
    }
    nums.push(n)
  }

  const scoreCheck = assertProbeDetectionAcceptable(req.body)
  if (!scoreCheck.ok) {
    return fail(res, 422, scoreCheck.code || 'validation_error', scoreCheck.message || '检测置信度校验失败')
  }

  const existing = getUserFaceDescriptorArr(req.user.id)
  if (existing) {
    const denial = getFaceReplacementDenialReason(req.user.id)
    if (denial) {
      if (denial.code === 'face_enrollment_cooldown') {
        return fail(res, 403, denial.code, denial.message, {
          next_eligible_at: denial.next_eligible_at,
        })
      }
      return fail(res, 403, denial.code, denial.message, {
        locked_session: denial.locked_session,
        locked_until: denial.locked_until_iso,
      })
    }
  }

  try {
    setUserFaceDescriptor(req.user.id, nums)
    insertFaceDescriptorAudit(req.user.id, existing ? 'replace' : 'initial')
  } catch (e) {
    console.error(e)
    return fail(res, 500, 'server_error', '保存失败')
  }
  ok(res, {
    ok: true,
    face_enrollment: buildFaceEnrollmentPolicyPayload(req.user.id),
  })
})

/** 按登录用户名精确查找一人（用于名单制添加成员，不返回全站用户列表） */
router.post('/lookup', authRequired, (req, res) => {
  const raw = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  if (raw.length < 2) {
    return fail(res, 422, 'validation_error', '用户名至少 2 个字符')
  }
  const u = findUserByUsername(raw)
  if (!u) {
    return fail(res, 404, 'user_not_found', '未找到该用户')
  }
  ok(res, {
    user: { id: u.id, username: u.username, display_name: u.display_name },
  })
})

/** 根据 id 批量解析展示信息（编辑活动时还原已选名单，仅限已有 id） */
router.post('/resolve', authRequired, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  const uniq = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))].slice(0, MAX_RESOLVE)
  if (!uniq.length) {
    return ok(res, { users: [] })
  }
  const placeholders = uniq.map(() => '?').join(',')
  const rows = getSqlite()
    .prepare(`SELECT id, username, display_name FROM users WHERE id IN (${placeholders})`)
    .all(...uniq)
  ok(res, { users: rows })
})

export default router
