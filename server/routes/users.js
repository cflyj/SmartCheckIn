import { Router } from 'express'
import { findUserByUsername, getSqlite } from '../db.js'
import { ok, fail } from '../utils/response.js'
import { authRequired } from '../middleware/auth.js'

const router = Router()
const MAX_RESOLVE = 50

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
