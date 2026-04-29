import { userIsSuperAdmin } from '../services/superAdminEnv.js'

/** 返回给前端与 JWT 展示的公开用户信息（不含 password_hash） */
export function sessionUserPayload(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    account_status: user.account_status || 'active',
    is_super_admin: userIsSuperAdmin(user.id),
  }
}
