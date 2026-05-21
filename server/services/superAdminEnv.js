import { BUILTIN_ADMIN_USERNAME, BUILTIN_SUPER_ADMIN_USER_ID } from '../config/builtinAdmin.js'
import { findUserById } from '../db.js'

/**
 * 平台超级管理员：环境变量 SUPER_ADMIN_USER_IDS（逗号分隔 user id）
 * **加上**固定的内建管理员 UUID（`server/config/builtinAdmin.js`）。
 * @see docs/SUPER_ADMIN_MODERATION_PRD.md
 */
export function resolveSuperAdminUserIds() {
  const raw = process.env.SUPER_ADMIN_USER_IDS ?? ''
  const set = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
  set.add(BUILTIN_SUPER_ADMIN_USER_ID)
  return set
}

/**
 * @param {string} userId
 * @param {{ username?: string } | null} [userRow] 若已加载用户行可传入，避免重复查询
 */
export function userIsSuperAdmin(userId, userRow) {
  if (!userId) return false
  if (resolveSuperAdminUserIds().has(userId)) return true
  const u = userRow ?? findUserById(userId)
  if (u && String(u.username).toLowerCase() === BUILTIN_ADMIN_USERNAME.toLowerCase()) {
    return true
  }
  return false
}
