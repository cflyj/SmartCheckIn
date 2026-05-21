import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { BUILTIN_ADMIN_USERNAME } from '../config/builtinAdmin.js'
import { findUserByUsername, insertUser, tryConsumeRegistrationInvite } from '../db.js'
import { ok, fail } from '../utils/response.js'
import { signToken } from '../middleware/auth.js'
import { sessionUserPayload } from '../utils/sessionUserPayload.js'

const router = Router()

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,32}$/

router.post('/register', (req, res) => {
  const { username, password, display_name, registration_identity, invite_code } = req.body || {}
  const name = typeof username === 'string' ? username.trim() : ''
  const pass = typeof password === 'string' ? password : ''
  const disp = typeof display_name === 'string' ? display_name.trim() : ''
  const identityRaw =
    typeof registration_identity === 'string' ? registration_identity.trim().toLowerCase() : ''

  if (!name || !pass || !disp) {
    return fail(res, 422, 'validation_error', '请填写用户名、密码与显示名称')
  }
  if (identityRaw !== 'student' && identityRaw !== 'teacher') {
    return fail(res, 422, 'validation_error', '请选择注册身份：学生或老师')
  }
  const invite =
    typeof invite_code === 'string' ? invite_code.trim() : ''
  if (!invite) {
    return fail(res, 422, 'validation_error', '请填写邀请码（学生向老师索取，老师向平台管理员索取）')
  }
  if (!USERNAME_RE.test(name)) {
    return fail(res, 422, 'validation_error', '用户名为 2～32 位字母、数字、下划线或中文')
  }
  if (pass.length < 8) {
    return fail(res, 422, 'validation_error', '密码至少 8 位')
  }
  if (disp.length < 1 || disp.length > 40) {
    return fail(res, 422, 'validation_error', '显示名称 1～40 字')
  }
  if (name.toLowerCase() === BUILTIN_ADMIN_USERNAME.toLowerCase()) {
    return fail(res, 422, 'validation_error', `用户名为系统保留，请使用其它用户名`)
  }
  if (findUserByUsername(name)) {
    return fail(res, 409, 'username_taken', '该用户名已被注册')
  }

  const role = identityRaw === 'teacher' ? 'organizer' : 'participant'
  const targetInviteRole = role

  let consumed = false
  try {
    consumed = tryConsumeRegistrationInvite(invite, targetInviteRole)
  } catch (e) {
    console.error(e)
    return fail(res, 500, 'server_error', '邀请码校验失败，请稍后重试')
  }
  if (!consumed) {
    return fail(
      res,
      422,
      'invalid_invite',
      identityRaw === 'teacher'
        ? '老师邀请码无效或已用尽，请联系平台管理员获取新的邀请码'
        : '学生邀请码无效或已用尽，请联系老师获取新的邀请码'
    )
  }

  const id = randomUUID()
  const now = new Date().toISOString()
  insertUser({
    id,
    username: name,
    passwordHash: bcrypt.hashSync(pass, 10),
    displayName: disp,
    role,
    createdAt: now,
  })

  const user = findUserByUsername(name)
  const token = signToken(user)
  ok(res, {
    token,
    user: sessionUserPayload(user),
  })
})

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return fail(res, 422, 'validation_error', '请输入用户名和密码')
  }
  const user = findUserByUsername(username.trim())
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return fail(res, 401, 'unauthorized', '用户名或密码错误')
  }
  if ((user.account_status || 'active') === 'banned') {
    return fail(res, 403, 'account_banned', '账号已被停用。如有异议请联系平台管理员')
  }
  const token = signToken(user)
  ok(res, {
    token,
    user: sessionUserPayload(user),
  })
})

export default router
