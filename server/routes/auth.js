import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { findUserByUsername, insertUser } from '../db.js'
import { ok, fail } from '../utils/response.js'
import { signToken } from '../middleware/auth.js'
import { sessionUserPayload } from '../utils/sessionUserPayload.js'

const router = Router()

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,32}$/

router.post('/register', (req, res) => {
  const { username, password, display_name } = req.body || {}
  const name = typeof username === 'string' ? username.trim() : ''
  const pass = typeof password === 'string' ? password : ''
  const disp = typeof display_name === 'string' ? display_name.trim() : ''

  if (!name || !pass || !disp) {
    return fail(res, 422, 'validation_error', '请填写用户名、密码与显示名称')
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
  if (findUserByUsername(name)) {
    return fail(res, 409, 'username_taken', '该用户名已被注册')
  }

  const role = 'participant'

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
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    },
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
