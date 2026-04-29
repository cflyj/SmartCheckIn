/**
 * 平台超级管理员账号：仅由 SUPER_ADMIN_USER_IDS（逗号分隔 user id）静态配置，
 * 与 docs/SUPER_ADMIN_MODERATION_PRD.md 一致。
 */
export function resolveSuperAdminUserIds() {
  const raw = process.env.SUPER_ADMIN_USER_IDS ?? ''
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

/** @param {string} userId */
export function userIsSuperAdmin(userId) {
  if (!userId) return false
  return resolveSuperAdminUserIds().has(userId)
}
