import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { customAlphabet } from 'nanoid'
import { randomUUID } from 'crypto'
import {
  addOrganizationMember,
  countOrgMembers,
  deleteJoinRequest,
  deleteOrganizationById,
  findOrganizationIdsByJoinCode,
  isPlainJoinCodeTaken,
  findUserById,
  findUserByUsername,
  searchUsersForOrgInvite,
  getJoinRequest,
  getOrgMemberRole,
  getOrganizationById,
  insertJoinRequest,
  insertOrganization,
  listOrgMembersWithProfile,
  listOrganizationsForUser,
  listPendingJoinRequestsWithProfile,
  normalizeJoinPolicy,
  removeOrganizationMember,
  setOrgMemberRole,
  unionMemberIdsForOrgs,
  updateOrganizationInviteHash,
  updateOrganizationJoinPolicy,
  updateOrganizationName,
  userMemberOfAllOrgs,
} from '../db.js'
import { ok, fail } from '../utils/response.js'
import { authRequired } from '../middleware/auth.js'

const router = Router()
const genJoinCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8)

function orgJoinPolicy(row) {
  return row?.join_policy || 'open'
}

/** @returns {{ orgId: string } | { error: string }} */
function resolveOrgIdForJoinCode(plain, requestedOrgId) {
  const ids = findOrganizationIdsByJoinCode(plain)
  if (ids.length === 0) return { error: 'invalid' }
  if (ids.length === 1) {
    const only = ids[0]
    if (requestedOrgId && requestedOrgId !== only) return { error: 'org_mismatch' }
    return { orgId: only }
  }
  if (!requestedOrgId || typeof requestedOrgId !== 'string') return { error: 'ambiguous' }
  if (!ids.includes(requestedOrgId)) return { error: 'org_not_in_list' }
  return { orgId: requestedOrgId }
}

function allocateUniqueJoinPlain() {
  for (let i = 0; i < 48; i += 1) {
    const plain = genJoinCode()
    if (!isPlainJoinCodeTaken(plain)) return plain
  }
  throw new Error('join_code_collision')
}

router.use(authRequired)

/** 名单制：所选组织的成员并集（发起者须为每个所选组织的成员） */
router.get('/roster-candidates', (req, res) => {
  const raw = typeof req.query.org_ids === 'string' ? req.query.org_ids : ''
  const orgIds = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))]
  if (!orgIds.length) {
    return fail(res, 422, 'validation_error', '请指定至少一个组织 id')
  }
  if (!userMemberOfAllOrgs(req.user.id, orgIds)) {
    return fail(res, 403, 'forbidden', '你只能从你已加入的组织中选择成员范围')
  }
  const pool = unionMemberIdsForOrgs(orgIds)
  const byOrg = new Map()
  for (const oid of orgIds) {
    for (const m of listOrgMembersWithProfile(oid)) {
      if (!byOrg.has(m.id)) byOrg.set(m.id, m)
    }
  }
  const users = [...byOrg.values()].filter((u) => pool.has(u.id))
  users.sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh-CN'))
  ok(res, { users })
})

/** 校验加入码并返回组织信息与策略（不写入成员）；多组织同码时返回 candidates 需用户选定 org_id */
router.post('/preview-join', (req, res) => {
  const plain = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  if (plain.length < 4) {
    return fail(res, 422, 'validation_error', '加入码至少 4 位')
  }
  const ids = findOrganizationIdsByJoinCode(plain)
  if (ids.length === 0) {
    return fail(res, 422, 'join_code_invalid', '加入码不正确')
  }
  if (ids.length > 1) {
    const candidates = ids.map((oid) => {
      const o = getOrganizationById(oid)
      return {
        id: o.id,
        name: o.name,
        join_policy: orgJoinPolicy(o),
        already_member: !!getOrgMemberRole(oid, req.user.id),
        has_pending_request: !!getJoinRequest(oid, req.user.id),
      }
    })
    return ok(res, { ambiguous: true, candidates })
  }
  const orgId = ids[0]
  const org = getOrganizationById(orgId)
  const policy = orgJoinPolicy(org)
  ok(res, {
    ambiguous: false,
    org: { id: org.id, name: org.name, join_policy: policy },
    already_member: !!getOrgMemberRole(orgId, req.user.id),
    has_pending_request: !!getJoinRequest(orgId, req.user.id),
  })
})

router.post('/join', (req, res) => {
  const plain = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  if (plain.length < 4) {
    return fail(res, 422, 'validation_error', '加入码至少 4 位')
  }
  const requestedOrgId = typeof req.body?.org_id === 'string' ? req.body.org_id.trim() : ''
  const resolved = resolveOrgIdForJoinCode(plain, requestedOrgId || null)
  if (resolved.error === 'invalid') {
    return fail(res, 422, 'join_code_invalid', '加入码不正确')
  }
  if (resolved.error === 'ambiguous') {
    return fail(
      res,
      422,
      'join_code_ambiguous',
      '该加入码对应多个组织，请先在预览页选择要加入的组织'
    )
  }
  if (resolved.error === 'org_mismatch' || resolved.error === 'org_not_in_list') {
    return fail(res, 422, 'org_id_invalid', '所选组织与加入码不匹配')
  }
  const orgId = resolved.orgId
  const org = getOrganizationById(orgId)
  const policy = orgJoinPolicy(org)

  if (policy === 'invite_only') {
    return fail(
      res,
      403,
      'join_disabled',
      '该组织已关闭「加入码自助入组」，请联系管理员将你加入'
    )
  }

  if (getOrgMemberRole(orgId, req.user.id)) {
    return fail(res, 409, 'already_member', '你已在该组织中')
  }

  const now = new Date().toISOString()

  if (policy === 'approval') {
    if (getJoinRequest(orgId, req.user.id)) {
      return fail(res, 409, 'join_pending', '你已提交申请，请等待管理员审核')
    }
    insertJoinRequest(orgId, req.user.id, now)
    return ok(res, {
      org: { id: org.id, name: org.name },
      pending_approval: true,
    })
  }

  addOrganizationMember(orgId, req.user.id, 'member', now)
  ok(res, {
    org: { id: org.id, name: org.name },
    joined: true,
  })
})

router.get('/', (_req, res) => {
  const list = listOrganizationsForUser(_req.user.id)
  ok(res, {
    organizations: list.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      my_role: r.my_role,
      joined_at: r.joined_at,
    })),
  })
})

router.post('/', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (name.length < 2 || name.length > 60) {
    return fail(res, 422, 'validation_error', '组织名称 2～60 字')
  }
  let plain = typeof req.body?.join_code === 'string' ? req.body.join_code.trim() : ''
  if (plain && plain.length < 4) {
    return fail(res, 422, 'validation_error', '自定义加入码至少 4 位，或留空由系统生成')
  }
  if (!plain) {
    try {
      plain = allocateUniqueJoinPlain()
    } catch {
      return fail(res, 500, 'server_error', '无法生成唯一加入码，请稍后重试')
    }
  } else if (isPlainJoinCodeTaken(plain)) {
    return fail(res, 409, 'join_code_taken', '该加入码已被其他组织使用，请换一个')
  }
  const id = randomUUID()
  const now = new Date().toISOString()
  const hash = bcrypt.hashSync(plain, 10)
  const joinPolicy = normalizeJoinPolicy(req.body?.join_policy)
  insertOrganization({
    id,
    name,
    inviteCodeHash: hash,
    createdBy: req.user.id,
    createdAt: now,
    joinPolicy,
  })
  addOrganizationMember(id, req.user.id, 'owner', now)
  ok(res, {
    org: { id, name, created_at: now, my_role: 'owner', join_policy: joinPolicy },
    join_code: plain,
  })
})

router.get('/:id/join-requests', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const role = getOrgMemberRole(org.id, req.user.id)
  if (role !== 'owner' && role !== 'admin') {
    return fail(res, 403, 'forbidden', '仅负责人或管理员可查看入组申请')
  }
  const requests = listPendingJoinRequestsWithProfile(org.id)
  ok(res, { requests })
})

router.post('/:id/join-requests/:userId/approve', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const role = getOrgMemberRole(org.id, req.user.id)
  if (role !== 'owner' && role !== 'admin') {
    return fail(res, 403, 'forbidden', '仅负责人或管理员可审核')
  }
  const targetId = req.params.userId
  if (!getJoinRequest(org.id, targetId)) {
    return fail(res, 404, 'no_pending_request', '没有待审核的申请')
  }
  const now = new Date().toISOString()
  if (!getOrgMemberRole(org.id, targetId)) {
    addOrganizationMember(org.id, targetId, 'member', now)
  }
  deleteJoinRequest(org.id, targetId)
  ok(res, { approved: true })
})

router.post('/:id/join-requests/:userId/reject', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const role = getOrgMemberRole(org.id, req.user.id)
  if (role !== 'owner' && role !== 'admin') {
    return fail(res, 403, 'forbidden', '仅负责人或管理员可审核')
  }
  const targetId = req.params.userId
  if (!getJoinRequest(org.id, targetId)) {
    return fail(res, 404, 'no_pending_request', '没有待审核的申请')
  }
  deleteJoinRequest(org.id, targetId)
  ok(res, { rejected: true })
})

/** 按登录用户名或显示名关键字搜索可添加的用户（已在本组织的会排除），避免昵称重名时加错人 */
router.get('/:id/member-lookup', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const role = getOrgMemberRole(org.id, req.user.id)
  if (role !== 'owner' && role !== 'admin') {
    return fail(res, 403, 'forbidden', '仅负责人或管理员可搜索用户')
  }
  const rawQ = req.query.q
  const q =
    typeof rawQ === 'string'
      ? rawQ.trim()
      : Array.isArray(rawQ) && rawQ[0]
        ? String(rawQ[0]).trim()
        : ''
  if (q.length < 2) {
    return fail(res, 422, 'validation_error', '搜索关键字至少 2 个字符')
  }
  const users = searchUsersForOrgInvite(q, org.id, 20)
  ok(res, { users })
})

router.get('/:id', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const role = getOrgMemberRole(org.id, req.user.id)
  if (!role) return fail(res, 403, 'forbidden', '你不是该组织成员')
  const members = listOrgMembersWithProfile(org.id)
  const join_policy = orgJoinPolicy(org)
  const pending_join_requests =
    role === 'owner' || role === 'admin' ? listPendingJoinRequestsWithProfile(org.id) : undefined
  ok(res, {
    org: {
      id: org.id,
      name: org.name,
      created_at: org.created_at,
      join_policy,
      my_role: role,
      member_count: members.length,
      members,
      pending_join_requests,
    },
  })
})

router.put('/:id', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const role = getOrgMemberRole(org.id, req.user.id)
  if (!role || (role !== 'owner' && role !== 'admin')) {
    return fail(res, 403, 'forbidden', '仅负责人或管理员可修改组织信息')
  }
  const body = req.body || {}
  const wantsName = Object.prototype.hasOwnProperty.call(body, 'name')
  const wantsPolicy = typeof body.join_policy === 'string'
  if (!wantsName && !wantsPolicy) {
    return fail(res, 422, 'validation_error', '请提供要修改的组织名称或加入策略')
  }
  if (wantsName) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name.length < 2 || name.length > 60) {
      return fail(res, 422, 'validation_error', '组织名称 2～60 字')
    }
    updateOrganizationName(org.id, name)
  }
  if (wantsPolicy) {
    if (role !== 'owner') {
      return fail(res, 403, 'forbidden', '仅负责人可修改加入策略')
    }
    updateOrganizationJoinPolicy(org.id, body.join_policy)
  }
  const updated = getOrganizationById(org.id)
  ok(res, {
    org: {
      id: updated.id,
      name: updated.name,
      join_policy: orgJoinPolicy(updated),
    },
  })
})

router.post('/:id/regenerate-code', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const role = getOrgMemberRole(org.id, req.user.id)
  if (role !== 'owner' && role !== 'admin') {
    return fail(res, 403, 'forbidden', '仅负责人或管理员可重置加入码')
  }
  let plain
  try {
    plain = allocateUniqueJoinPlain()
  } catch {
    return fail(res, 500, 'server_error', '无法生成唯一加入码，请稍后重试')
  }
  updateOrganizationInviteHash(org.id, bcrypt.hashSync(plain, 10))
  ok(res, { join_code: plain })
})

router.post('/:id/members', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const role = getOrgMemberRole(org.id, req.user.id)
  if (role !== 'owner' && role !== 'admin') {
    return fail(res, 403, 'forbidden', '仅负责人或管理员可添加成员')
  }
  const userId = typeof req.body?.user_id === 'string' ? req.body.user_id.trim() : ''
  const uname = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  let u = null
  if (userId) {
    u = findUserById(userId)
    if (!u) return fail(res, 404, 'user_not_found', '未找到该用户')
  } else if (uname.length >= 2) {
    u = findUserByUsername(uname)
    if (!u) return fail(res, 404, 'user_not_found', '未找到该用户')
  } else {
    return fail(
      res,
      422,
      'validation_error',
      '请先搜索并点选要添加的人，或输入对方的完整登录用户名'
    )
  }
  if (getOrgMemberRole(org.id, u.id)) {
    return fail(res, 409, 'already_member', '该用户已在组织中')
  }
  const now = new Date().toISOString()
  addOrganizationMember(org.id, u.id, 'member', now)
  ok(res, {
    user: { id: u.id, username: u.username, display_name: u.display_name },
    added: true,
  })
})

router.delete('/:id/members/:userId', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const targetId = req.params.userId
  const myRole = getOrgMemberRole(org.id, req.user.id)
  if (!myRole) return fail(res, 403, 'forbidden', '你不是该组织成员')

  if (targetId === req.user.id) {
    return fail(res, 422, 'validation_error', '退出组织请使用「退出组织」')
  }
  if (myRole !== 'owner' && myRole !== 'admin') {
    return fail(res, 403, 'forbidden', '无权移除他人')
  }
  const targetRole = getOrgMemberRole(org.id, targetId)
  if (!targetRole) return fail(res, 404, 'not_member', '该用户不在组织中')
  if (targetRole === 'owner') {
    return fail(res, 403, 'forbidden', '不能移除负责人，请先转让负责人')
  }
  if (targetRole === 'admin' && myRole !== 'owner') {
    return fail(res, 403, 'forbidden', '只有负责人可移除管理员')
  }
  removeOrganizationMember(org.id, targetId)
  ok(res, { removed: true })
})

router.post('/:id/leave', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  const role = getOrgMemberRole(org.id, req.user.id)
  if (!role) return fail(res, 404, 'not_member', '你不在该组织中')

  const n = countOrgMembers(org.id)
  if (role === 'owner') {
    if (n > 1) {
      return fail(
        res,
        409,
        'owner_must_transfer',
        '你是负责人且组织中还有其他成员，请先转让负责人后再退出，或解散组织（仅剩你一人时可退出并解散）'
      )
    }
    deleteOrganizationById(org.id)
    return ok(res, { left: true, org_deleted: true })
  }
  removeOrganizationMember(org.id, req.user.id)
  ok(res, { left: true })
})

router.post('/:id/transfer-owner', (req, res) => {
  const org = getOrganizationById(req.params.id)
  if (!org) return fail(res, 404, 'org_not_found', '组织不存在')
  if (getOrgMemberRole(org.id, req.user.id) !== 'owner') {
    return fail(res, 403, 'forbidden', '仅负责人可转让')
  }
  const newOwnerId = typeof req.body?.user_id === 'string' ? req.body.user_id.trim() : ''
  if (!newOwnerId || newOwnerId === req.user.id) {
    return fail(res, 422, 'validation_error', '请选择新的负责人（不能是自己）')
  }
  const nr = getOrgMemberRole(org.id, newOwnerId)
  if (!nr) return fail(res, 404, 'not_member', '新负责人必须是组织成员')
  setOrgMemberRole(org.id, req.user.id, 'admin')
  setOrgMemberRole(org.id, newOwnerId, 'owner')
  ok(res, { transferred: true })
})

export default router
