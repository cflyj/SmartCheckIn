import { fail } from '../utils/response.js'
import { userIsSuperAdmin } from '../services/superAdminEnv.js'

/** 须在 authRequired 之后使用 */
export function superAdminRequired(req, res, next) {
  if (!userIsSuperAdmin(req.user?.id)) {
    return fail(res, 403, 'forbidden', '需要平台管理员权限')
  }
  next()
}
