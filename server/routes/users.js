import { Router } from 'express'
import { listParticipantUsers } from '../db.js'
import { ok } from '../utils/response.js'
import { authRequired, requireOrganizer } from '../middleware/auth.js'

const router = Router()

router.get('/participants', authRequired, requireOrganizer, (_req, res) => {
  const users = listParticipantUsers()
  ok(res, { users })
})

export default router
