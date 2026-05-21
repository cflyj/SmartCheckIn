import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID, randomBytes } from 'crypto'
import { insertRegistrationInvite } from '../db.js'
import { ok, fail } from '../utils/response.js'
import { authRequired } from '../middleware/auth.js'
import { userIsSuperAdmin } from '../services/superAdminEnv.js'

const router = Router()

function generatePlainInviteCode() {
  return randomBytes(9).toString('base64url').slice(0, 14).toUpperCase()
}

router.use(authRequired)

/** 生成注册邀请码：老师生成「学生」码；超级管理员生成「老师」码 */
router.post('/', (req, res) => {
  const rawUses = req.body?.remaining_uses
  let remainingUses = 1
  if (rawUses !== undefined && rawUses !== null && rawUses !== '') {
    const n = parseInt(String(rawUses), 10)
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      return fail(res, 422, 'validation_error', '可用次数须在 1～500 之间')
    }
    remainingUses = n
  }

  let targetRole
  if (userIsSuperAdmin(req.user.id, req.user)) {
    targetRole = 'organizer'
  } else if (req.user.role === 'organizer') {
    targetRole = 'participant'
  } else {
    return fail(res, 403, 'forbidden', '只有老师或平台管理员可以生成注册邀请码')
  }

  const plain = generatePlainInviteCode()
  const now = new Date().toISOString()
  insertRegistrationInvite({
    id: randomUUID(),
    codeHash: bcrypt.hashSync(plain, 10),
    targetRole,
    createdBy: req.user.id,
    createdAt: now,
    remainingUses,
  })

  ok(res, {
    code: plain,
    target_role: targetRole,
    remaining_uses: remainingUses,
    hint:
      targetRole === 'participant'
        ? '将此码发给需要注册为学生账号的用户'
        : '将此码发给需要注册为老师账号的用户',
  })
})

export default router
