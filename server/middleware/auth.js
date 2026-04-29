import jwt from 'jsonwebtoken'
import { fail } from '../utils/response.js'
import { findUserById } from '../db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      display_name: user.display_name,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

export function authRequired(req, res, next) {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) {
    return fail(res, 401, 'unauthorized', '请先登录')
  }
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET)
    const user = findUserById(payload.sub)
    if (!user) return fail(res, 401, 'unauthorized', '用户不存在')
    if ((user.account_status || 'active') === 'banned') {
      return fail(res, 403, 'account_banned', '账号已被停用')
    }
    req.user = user
    next()
  } catch {
    return fail(res, 401, 'unauthorized', '登录已失效')
  }
}

export function requireOrganizer(req, res, next) {
  if (req.user.role !== 'organizer') {
    return fail(res, 403, 'forbidden', '需要组织者权限')
  }
  next()
}
