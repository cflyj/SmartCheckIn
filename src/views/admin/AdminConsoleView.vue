<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import { useAuthStore } from '../../stores/auth.js'
import AppPageShell from '../../components/AppPageShell.vue'

const router = useRouter()
const auth = useAuthStore()

/** @type {import('vue').Ref<'overview'|'organizations'|'users'|'sessions'|'audit'>} */
const tab = ref('overview')

const feedback = ref({
  open: false,
  title: '',
  message: '',
  /** @type {'error' | 'success' | 'info'} */
  variant: 'error',
})

const booting = ref(true)
const sectionBusy = ref(false)

const overview = ref({ users: 0, organizations: 0, sessions: 0 })
const orgs = ref([])
const orgSearchDraft = ref('')

const users = ref([])
const userQueryDraft = ref('')
const userAccount = ref('all')

const sessions = ref([])
const sessionStatus = ref('all')
const sessionKeyword = ref('')

const auditEntries = ref([])
const auditAction = ref('')

const orgDeleting = ref(false)
const orgDeleteConfirm = ref({ open: false, orgId: '', name: '', reason: '' })

const banConfirm = ref({ open: false, userId: '', username: '', reason: '' })
const banning = ref(false)

const cancelConfirm = ref({ open: false, sessionId: '', title: '', reason: '' })
const cancelling = ref(false)

const tabs = [
  { id: 'overview', label: '概览' },
  { id: 'organizations', label: '组织' },
  { id: 'users', label: '用户' },
  { id: 'sessions', label: '活动' },
  { id: 'audit', label: '审计' },
]

const AUDIT_LABELS = {
  delete_org: '解散组织',
  ban_user: '封号',
  unban_user: '解除封号',
  cancel_session: '下架活动',
}

const SESSION_STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '仅进行中' },
  { value: 'cancelled', label: '仅已下架' },
]

const USER_ACCOUNT_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '正常可登录' },
  { value: 'banned', label: '已停用' },
]

const AUDIT_FILTER_OPTIONS = [
  { value: '', label: '全部动作' },
  { value: 'delete_org', label: '解散组织' },
  { value: 'ban_user', label: '封号' },
  { value: 'unban_user', label: '解除封号' },
  { value: 'cancel_session', label: '下架活动' },
]

const filteredSessions = computed(() => {
  const k = sessionKeyword.value.trim().toLowerCase()
  let list = sessions.value || []
  if (!k) return list
  return list.filter((s) => {
    const t = `${s.title || ''} ${s.id || ''} ${s.organizer_username || ''} ${s.organizer_display_name || ''}`.toLowerCase()
    return t.includes(k)
  })
})

function formatRange(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) return ''
  const a = String(isoStart).slice(0, 16).replace('T', ' ')
  const b = String(isoEnd).slice(0, 16).replace('T', ' ')
  return `${a} → ${b}`
}

function closeFeedback() {
  feedback.value = { ...feedback.value, open: false }
}

/**
 * @param {string} title
 * @param {string} message
 * @param {'error'|'success'|'info'} [variant]
 */
function openFeedback(title, message, variant = 'error') {
  feedback.value = {
    open: true,
    title,
    message,
    variant,
  }
}

async function copyText(text, label = '内容') {
  const t = String(text || '').trim()
  if (!t) return
  try {
    await navigator.clipboard?.writeText(t)
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = t
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    } catch {
      openFeedback('复制失败', `无法复制「${label}」，请长按手动拷贝`, 'error')
      return
    }
  }
  closeFeedback()
}

async function loadOverviewOnly() {
  overview.value = await api('/admin/overview')
}

async function loadOrganizationsSection() {
  const q = orgSearchDraft.value.trim()
  const path = q
    ? `/admin/organizations?q=${encodeURIComponent(q)}`
    : '/admin/organizations'
  orgs.value = (await api(path)).organizations || []
}

async function loadUsersSection() {
  const q = userQueryDraft.value.trim()
  const ac = userAccount.value
  let path = `/admin/users?limit=60&account=${encodeURIComponent(ac)}`
  if (q.length >= 2) {
    path += `&q=${encodeURIComponent(q)}`
  }
  users.value = (await api(path)).users || []
}

async function loadSessionsSection() {
  const st = sessionStatus.value
  sessions.value =
    (
      await api(
        `/admin/sessions?limit=100&status=${encodeURIComponent(st === 'cancelled' ? 'cancelled' : st === 'active' ? 'active' : 'all')}`
      )
    ).sessions || []
}

async function loadAuditSection() {
  const act = auditAction.value.trim()
  const suf = act ? `?limit=80&action=${encodeURIComponent(act)}` : '?limit=80'
  auditEntries.value = (await api(`/admin/audit-log${suf}`)).entries || []
}

async function runSectionLoader() {
  sectionBusy.value = true
  closeFeedback()
  try {
    if (tab.value === 'overview') await loadOverviewOnly()
    else if (tab.value === 'organizations') await loadOrganizationsSection()
    else if (tab.value === 'users') await loadUsersSection()
    else if (tab.value === 'sessions') await loadSessionsSection()
    else if (tab.value === 'audit') await loadAuditSection()
  } catch (e) {
    openFeedback(
      '列表加载失败',
      e instanceof ApiError ? e.message : '请稍后重试',
      'error'
    )
  } finally {
    sectionBusy.value = false
  }
}

watch(tab, () => {
  runSectionLoader()
})

watch(userAccount, () => {
  if (tab.value === 'users') runSectionLoader()
})

watch([sessionStatus], () => {
  if (tab.value === 'sessions') loadSessionsSection().catch(() => {})
})

watch([auditAction], () => {
  if (tab.value === 'audit') loadAuditSection().catch(() => {})
})

function setTab(id) {
  tab.value = id
}

function clearOrgSearch() {
  orgSearchDraft.value = ''
  if (tab.value === 'organizations') runSectionLoader()
}

async function applyOrgSearch() {
  tab.value = 'organizations'
}

async function applyUserSearch() {
  if (userQueryDraft.value.trim() && userQueryDraft.value.trim().length < 2) {
    openFeedback('检索条件不完整', '用户关键字至少需要 2 个字符；或清空关键字查看最新列表', 'info')
    return
  }
  tab.value = 'users'
}

async function confirmDeleteOrg() {
  orgDeleting.value = true
  closeFeedback()
  try {
    await api(`/admin/organizations/${orgDeleteConfirm.value.orgId}`, {
      method: 'DELETE',
      body: {
        reason: orgDeleteConfirm.value.reason.trim().slice(0, 600) || undefined,
      },
    })
    orgDeleteConfirm.value = { open: false, orgId: '', name: '', reason: '' }
    await loadOverviewOnly()
    await loadOrganizationsSection()
    await loadAuditSection()
    openFeedback(
      '解散成功',
      '该组织及成员关系已删除，活动名单中的引用已摘除。详情请查看「审计」。',
      'success'
    )
  } catch (e) {
    openFeedback(
      '解散失败',
      e instanceof ApiError ? e.message : '服务器未接受此次操作',
      'error'
    )
  } finally {
    orgDeleting.value = false
  }
}

async function confirmBanUser() {
  banning.value = true
  closeFeedback()
  try {
    await api(`/admin/users/${banConfirm.value.userId}/ban`, {
      method: 'POST',
      body: { reason: banConfirm.value.reason.trim() },
    })
    banConfirm.value = { open: false, userId: '', username: '', reason: '' }
    await loadOverviewOnly()
    await loadUsersSection()
    await loadAuditSection()
    openFeedback('帐号已停用', '该用户将无法登录直至你解除停用。', 'success')
  } catch (e) {
    openFeedback(
      '封号失败',
      e instanceof ApiError ? e.message : '服务器未接受此次操作',
      'error'
    )
  } finally {
    banning.value = false
  }
}

async function unbanOne(userId) {
  try {
    await api(`/admin/users/${userId}/unban`, { method: 'POST', body: {} })
    await loadOverviewOnly()
    await loadUsersSection()
    await loadAuditSection()
    openFeedback('已解除停用', '该用户可以重新登录。', 'success')
  } catch (e) {
    openFeedback(
      '解除失败',
      e instanceof ApiError ? e.message : '服务器未接受此次操作',
      'error'
    )
  }
}

async function confirmCancelSession() {
  cancelling.value = true
  closeFeedback()
  try {
    await api(`/admin/sessions/${cancelConfirm.value.sessionId}/cancel`, {
      method: 'POST',
      body: { reason: cancelConfirm.value.reason.trim().slice(0, 600) || undefined },
    })
    cancelConfirm.value = { open: false, sessionId: '', title: '', reason: '' }
    await loadOverviewOnly()
    await loadSessionsSection()
    await loadAuditSection()
    openFeedback('活动已下架', '参与者将无法继续签到（历史签到仍保留）。', 'success')
  } catch (e) {
    openFeedback(
      '下架失败',
      e instanceof ApiError ? e.message : '服务器未接受此次操作',
      'error'
    )
  } finally {
    cancelling.value = false
  }
}

function openOrgDelete(org) {
  orgDeleteConfirm.value = { open: true, orgId: org.id, name: org.name || '', reason: '' }
}

function openBan(u) {
  banConfirm.value = { open: true, userId: u.id, username: u.username, reason: '' }
}

function openCancelSes(s) {
  cancelConfirm.value = { open: true, sessionId: s.id, title: s.title || '', reason: '' }
}

onMounted(async () => {
  await auth.refreshProfile()
  if (!auth.user?.is_super_admin) {
    router.replace({ name: 'home' })
    return
  }
  booting.value = true
  try {
    await Promise.all([
      loadOverviewOnly(),
      loadOrganizationsSection(),
      loadUsersSection(),
      loadSessionsSection(),
      loadAuditSection(),
    ])
  } catch (e) {
    openFeedback(
      '控制台加载异常',
      e instanceof ApiError ? e.message : '无法拉取控制台数据',
      'error'
    )
  } finally {
    booting.value = false
  }
})
</script>

<template>
  <AppPageShell
    nav-title="平台治理"
    page-class="page--admin"
    @back="router.push({ name: 'home' })"
  >
    <template #nav-right>
      <button type="button" class="nav-bar__action" @click="router.push({ name: 'home' })">首页</button>
    </template>

    <div class="content stack stack--md">
      <!-- 常驻说明：业务能力边界 -->
      <div class="admin-callout card card-pad" role="region" aria-labelledby="admin-callout-title">
        <div class="admin-callout__title" id="admin-callout-title">治理范围与安全说明</div>
        <ul class="admin-callout__list">
          <li>
            <strong>组织</strong>：解散后成员关系与入会申请清空，并从活动名单配置中摘除该组织 id。
          </li>
          <li>
            <strong>用户</strong>：停用后禁止登录（含既有 token）；平台管理员帐号不可被封。
          </li>
          <li>
            <strong>活动</strong>：下架等同于「已取消」，不删除历史签到。
          </li>
          <li>
            <strong>审计</strong>：所有高危操作可追溯；事由建议填写以利复盘。
          </li>
        </ul>
        <p v-if="auth.user?.username" class="muted text-body-sm u-mb-0 admin-callout__foot">
          当前操作帐号：<strong>@{{ auth.user.username }}</strong> · 会话 id 可复制用于配置
          <code>SUPER_ADMIN_USER_IDS</code>（见 PRD）。
        </p>
      </div>

      <div class="tabs" role="tablist" aria-label="平台治理分区">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="tab"
          role="tab"
          :aria-selected="tab === t.id"
          :class="{ 'tab--active': tab === t.id }"
          @click="setTab(t.id)"
        >
          {{ t.label }}
        </button>
      </div>

      <div v-if="booting" class="spinner-wrap muted" role="status">首次加载数据中…</div>

      <template v-else>
        <!-- 概览 -->
        <section v-show="tab === 'overview'" class="home-section">
          <h2 class="home-section__label">平台概要</h2>
          <p class="muted text-body-sm u-mt-2">用于快速对照「是否要进下一标签做具体操作」。</p>
          <div class="admin-stat-grid u-mt-2">
            <div class="admin-stat card card-pad">
              <span class="admin-stat__value">{{ overview.users }}</span>
              <span class="muted">注册用户数</span>
            </div>
            <div class="admin-stat card card-pad">
              <span class="admin-stat__value">{{ overview.organizations }}</span>
              <span class="muted">组织数</span>
            </div>
            <div class="admin-stat card card-pad">
              <span class="admin-stat__value">{{ overview.sessions }}</span>
              <span class="muted">活动会话总数</span>
            </div>
          </div>
        </section>

        <!-- 组织 -->
        <section v-show="tab === 'organizations'" class="home-section">
          <h2 class="home-section__label">组织</h2>
          <div class="admin-toolbar card card-pad">
            <div class="admin-toolbar__row">
              <label class="admin-field-label" for="org-q">检索</label>
              <div class="admin-toolbar__inputs">
                <input
                  id="org-q"
                  v-model="orgSearchDraft"
                  type="search"
                  class="input"
                  placeholder="名称关键字，或完整组织 UUID"
                  @keydown.enter.prevent="applyOrgSearch"
                />
                <button type="button" class="btn btn-primary" @click="applyOrgSearch">搜索</button>
                <button type="button" class="btn btn-secondary" :disabled="sectionBusy" @click="clearOrgSearch">
                  显示全部
                </button>
              </div>
            </div>
            <p class="muted text-body-sm u-mb-0">结果按创建时间倒序；高危操作不可逆。</p>
          </div>
          <div v-if="sectionBusy && tab === 'organizations'" class="spinner-wrap muted">刷新中…</div>
          <div v-else class="grouped-list u-mt-2">
            <div v-if="!orgs.length" class="list-cell muted">暂无匹配的组织</div>
            <div v-for="org in orgs" :key="org.id" class="list-cell list-cell--stretch admin-org-row">
              <div class="list-cell__stack">
                <span class="list-cell__title">{{ org.name }}</span>
                <span class="list-cell__meta admin-line">
                  id
                  <code class="admin-code">{{ org.id }}</code>
                  <button type="button" class="btn-text" @click="copyText(org.id, '组织 id')">复制</button>
                </span>
                <span class="list-cell__meta muted">创建者 @{{ org.creator_username || org.created_by }}</span>
              </div>
              <button type="button" class="btn btn-danger btn-small" @click="openOrgDelete(org)">解散删除</button>
            </div>
          </div>
        </section>

        <!-- 用户 -->
        <section v-show="tab === 'users'" class="home-section">
          <h2 class="home-section__label">用户</h2>
          <div class="admin-toolbar card card-pad">
            <div class="admin-toolbar__row admin-toolbar__row--wrap">
              <div class="admin-segments" role="group" aria-label="帐号状态筛选">
                <button
                  v-for="opt in USER_ACCOUNT_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="admin-segment"
                  :class="{ 'admin-segment--on': userAccount === opt.value }"
                  @click="userAccount = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
            <div class="admin-toolbar__row u-mt-2">
              <label class="admin-field-label" for="user-q">关键字</label>
              <div class="admin-toolbar__inputs">
                <input
                  id="user-q"
                  v-model="userQueryDraft"
                  type="search"
                  class="input"
                  placeholder="用户名或显示名 · 至少 2 个字；留空为当前筛选下最新列表"
                  @keydown.enter.prevent="applyUserSearch"
                />
                <button type="button" class="btn btn-primary" @click="applyUserSearch">检索</button>
              </div>
            </div>
          </div>
          <div v-if="sectionBusy && tab === 'users'" class="spinner-wrap muted">刷新中…</div>
          <div v-else class="grouped-list u-mt-2">
            <div v-if="!users.length" class="list-cell muted">暂无用户</div>
            <div v-for="u in users" :key="u.id" class="list-cell list-cell--stretch">
              <div class="list-cell__stack">
                <span class="list-cell__title">
                  {{ u.display_name }}
                  <span v-if="u.account_status === 'banned'" class="pill pill-cancelled pill--tiny">停用</span>
                </span>
                <span class="list-cell__meta"
                  >@{{ u.username }} · {{ u.role }}</span
                >
                <span class="list-cell__meta admin-line">
                  id <code class="admin-code">{{ u.id }}</code>
                  <button type="button" class="btn-text" @click="copyText(u.id, '用户 id')">复制</button>
                </span>
              </div>
              <template v-if="u.account_status === 'banned'">
                <button type="button" class="btn btn-secondary btn-small" @click="unbanOne(u.id)">
                  解除停用
                </button>
              </template>
              <button v-else type="button" class="btn btn-danger btn-small" @click="openBan(u)">封号</button>
            </div>
          </div>
        </section>

        <!-- 活动 -->
        <section v-show="tab === 'sessions'" class="home-section">
          <h2 class="home-section__label">活动（UGC 名义）</h2>
          <div class="admin-toolbar card card-pad">
            <div class="admin-toolbar__row admin-toolbar__row--wrap">
              <div class="admin-segments" role="group" aria-label="活动上架状态">
                <button
                  v-for="opt in SESSION_STATUS_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="admin-segment"
                  :class="{ 'admin-segment--on': sessionStatus === opt.value }"
                  @click="sessionStatus = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
            <div class="admin-toolbar__row u-mt-2">
              <label class="admin-field-label" for="sess-k">本页筛选</label>
              <input
                id="sess-k"
                v-model="sessionKeyword"
                type="search"
                class="input"
                placeholder="按标题 / 活动 id / 发起人昵称 即时筛选（不重载接口）"
              />
            </div>
          </div>
          <div v-if="sectionBusy && tab === 'sessions'" class="spinner-wrap muted">刷新中…</div>
          <div v-else class="grouped-list u-mt-2">
            <div v-if="!filteredSessions.length" class="list-cell muted">暂无符合条件的活动</div>
            <div v-for="s in filteredSessions" :key="s.id" class="list-cell list-cell--stretch admin-session-row">
              <div class="list-cell__stack">
                <span class="list-cell__title">{{ s.title }}</span>
                <span class="list-cell__meta admin-line muted">
                  发起人 {{ s.organizer_display_name }}（@{{ s.organizer_username || '?' }}）
                </span>
                <span class="list-cell__meta muted">{{ formatRange(s.starts_at, s.ends_at) }}</span>
                <span class="list-cell__meta admin-line">
                  id <code class="admin-code">{{ s.id }}</code>
                  <button type="button" class="btn-text" @click="copyText(s.id, '活动 id')">复制</button>
                  <span
                    class="pill"
                    :class="s.cancelled ? 'pill-cancelled' : 'pill-active'"
                    style="margin-left: 0.35rem"
                    >{{ s.cancelled ? '已下架' : '上架中' }}</span
                  >
                </span>
              </div>
              <button
                type="button"
                class="btn btn-danger btn-small"
                :disabled="s.cancelled"
                @click="openCancelSes(s)"
              >
                下架
              </button>
            </div>
          </div>
        </section>

        <!-- 审计 -->
        <section v-show="tab === 'audit'" class="home-section">
          <h2 class="home-section__label">审计日志</h2>
          <div class="admin-toolbar card card-pad">
            <label class="admin-field-label ui-sr-only" for="audit-a">筛选动作类型</label>
            <select id="audit-a" v-model="auditAction" class="input admin-select">
              <option v-for="opt in AUDIT_FILTER_OPTIONS" :key="`${opt.value}-${opt.label}`" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div v-if="sectionBusy && tab === 'audit'" class="spinner-wrap muted">刷新中…</div>
          <div v-else class="admin-table-scroll u-mt-2">
            <table class="admin-table" aria-label="近期治理审计">
              <thead>
                <tr>
                  <th scope="col">时间（UTC）</th>
                  <th scope="col">动作</th>
                  <th scope="col">对象</th>
                  <th scope="col">执行人</th>
                  <th scope="col">事由</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in auditEntries" :key="a.id">
                  <td class="admin-table__nowrap">{{ String(a.created_at || '').slice(0, 19).replace('T', ' ') }}</td>
                  <td>{{ AUDIT_LABELS[a.action] || a.action }}</td>
                  <td>
                    <span class="admin-table__muted">{{ a.target_type }}</span>
                    <code class="admin-code">{{ a.target_id }}</code>
                    <button type="button" class="btn-text" @click="copyText(a.target_id, '对象 id')">复制</button>
                  </td>
                  <td>@{{ a.actor_username || '?' }}</td>
                  <td class="admin-table__reason">{{ a.reason || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>

    <Teleport to="body">
      <div
        v-if="orgDeleteConfirm.open"
        class="logout-dialog-backdrop"
        role="presentation"
        @click.self="orgDeleteConfirm.open = false"
      >
        <div class="logout-dialog card card-pad stack" role="dialog" aria-modal="true" @click.stop>
          <p class="list-cell__title u-mb-0">解散并删除「{{ orgDeleteConfirm.name }}」？</p>
          <p class="muted text-body-sm u-mt-2 u-mb-0">
            将删除成员与入会申请并从所有活动中移除名单里的该组织引用；不可逆。
          </p>
          <textarea
            v-model="orgDeleteConfirm.reason"
            class="input input--textarea u-mt-2"
            rows="2"
            placeholder="事由（可选，建议填写）"
          />
          <div class="logout-dialog__actions">
            <button type="button" class="btn btn-secondary" @click="orgDeleteConfirm.open = false">取消</button>
            <button
              type="button"
              class="btn btn-danger"
              :disabled="orgDeleting"
              @click="confirmDeleteOrg"
            >
              确认解散
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="banConfirm.open"
        class="logout-dialog-backdrop"
        role="presentation"
        @click.self="banConfirm.open = false"
      >
        <div class="logout-dialog card card-pad stack" role="dialog" aria-modal="true" @click.stop>
          <p class="list-cell__title u-mb-0">封禁 @{{ banConfirm.username }}</p>
          <textarea
            v-model="banConfirm.reason"
            class="input input--textarea u-mt-2"
            rows="3"
            placeholder="封号原因（必填，至少 2 字）"
          />
          <div class="logout-dialog__actions">
            <button type="button" class="btn btn-secondary" @click="banConfirm.open = false">取消</button>
            <button type="button" class="btn btn-danger" :disabled="banning" @click="confirmBanUser">
              确认封禁
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="cancelConfirm.open"
        class="logout-dialog-backdrop"
        role="presentation"
        @click.self="cancelConfirm.open = false"
      >
        <div class="logout-dialog card card-pad stack" role="dialog" aria-modal="true" @click.stop>
          <p class="list-cell__title u-mb-0">下架活动「{{ cancelConfirm.title }}」</p>
          <p class="muted text-body-sm u-mt-2 u-mb-0">将设为已取消（不删除签到历史）。</p>
          <textarea
            v-model="cancelConfirm.reason"
            class="input input--textarea u-mt-2"
            rows="2"
            placeholder="事由（可选）"
          />
          <div class="logout-dialog__actions">
            <button type="button" class="btn btn-secondary" @click="cancelConfirm.open = false">取消</button>
            <button type="button" class="btn btn-danger" :disabled="cancelling" @click="confirmCancelSession">
              下架
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 居中反馈：错误或成功说明，不受页面滚动遮挡 -->
    <Teleport to="body">
      <div
        v-if="feedback.open"
        class="admin-feedback-backdrop"
        role="presentation"
        @click.self="closeFeedback"
      >
        <div
          class="admin-feedback card card-pad stack"
          role="alertdialog"
          aria-live="polite"
          aria-labelledby="admin-feedback-title"
          @click.stop
        >
          <p id="admin-feedback-title" class="admin-feedback__title" :data-variant="feedback.variant">
            {{ feedback.title }}
          </p>
          <p class="admin-feedback__body muted">{{ feedback.message }}</p>
          <button type="button" class="btn btn-primary admin-feedback__ok" @click="closeFeedback">
            知道了
          </button>
        </div>
      </div>
    </Teleport>
  </AppPageShell>
</template>

<style scoped>
.admin-callout__title {
  font-weight: 700;
  font-size: var(--font-size-body, 15px);
  margin-bottom: var(--space-2);
}

.admin-callout__list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--ios-secondary);
}

.admin-callout__list li + li {
  margin-top: 0.35rem;
}

.admin-callout__foot {
  margin-top: var(--space-3);
}

.admin-toolbar__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-3);
}

.admin-toolbar__row--wrap {
  align-items: center;
}

.admin-field-label {
  flex: 0 0 52px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ios-secondary);
  padding-top: 0.55rem;
}

.admin-toolbar__inputs {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-width: 0;
}

.admin-toolbar__inputs .input {
  flex: 1;
  min-width: 140px;
}

.admin-segments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-segment {
  border: 1px solid rgba(118, 118, 128, 0.25);
  background: var(--ios-bg-grouped-secondary);
  color: var(--ios-label);
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}

.admin-segment--on {
  background: rgba(52, 199, 89, 0.18);
  border-color: rgba(52, 199, 89, 0.45);
  color: var(--ios-label);
}

.admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-4);
}

.admin-stat {
  align-items: center;
  gap: var(--space-2);
}

.admin-stat__value {
  font-size: 1.85rem;
  font-weight: 700;
}

.list-cell--stretch {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.btn-small {
  padding: 0.4rem 0.65rem;
  font-size: 0.8125rem;
}

.input--textarea {
  min-height: 72px;
  resize: vertical;
}

.admin-code {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.75rem;
  word-break: break-all;
  background: rgba(118, 118, 128, 0.1);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}

.admin-line {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.btn-text {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ios-teal, #148f89);
  cursor: pointer;
  text-decoration: underline;
}

.pill--tiny {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  vertical-align: 0.1em;
}

.admin-select {
  max-width: 100%;
}

.admin-table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: var(--radius-md);
  border: 1px solid rgba(118, 118, 128, 0.2);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.admin-table th,
.admin-table td {
  padding: 0.65rem 0.75rem;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid rgba(118, 118, 128, 0.12);
}

.admin-table th {
  background: rgba(118, 118, 128, 0.08);
  font-weight: 700;
  white-space: nowrap;
}

.admin-table__nowrap {
  white-space: nowrap;
}

.admin-table__muted {
  font-size: 0.6875rem;
  color: var(--ios-secondary);
  margin-right: 0.35rem;
}

.admin-table__reason {
  word-break: break-word;
}

.ui-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* 置顶遮罩（高于底部确认框），避免滚动后看不到反馈 */
.admin-feedback-backdrop {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  padding-top: max(var(--space-4), var(--safe-top));
  padding-bottom: max(var(--space-4), var(--safe-bottom));
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
}

.admin-feedback {
  width: min(100%, 360px);
  max-height: min(78vh, 480px);
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 12px 40px rgba(0, 0, 0, 0.16));
}

.admin-feedback__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.admin-feedback__title[data-variant='error'] {
  color: var(--color-danger-fg, #8b1f1f);
}

.admin-feedback__title[data-variant='success'] {
  color: var(--ios-green);
}

.admin-feedback__body {
  margin: 0;
  white-space: pre-wrap;
  line-height: var(--line-relaxed, 1.5);
  font-size: 0.9375rem;
}

.admin-feedback__ok {
  margin-top: var(--space-2);
}
</style>
