<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { ApiError, api } from '../api/client.js'
import AppPageShell from '../components/AppPageShell.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

/** 首期区分入口并在登录成功后校验账号身份是否与所选入口一致 */
const portals = [
  { id: 'student', label: '学生入口' },
  { id: 'teacher', label: '老师入口' },
  { id: 'admin', label: '管理员入口' },
]

const portalHints = {
  student: '用于参与签到、加入组织与查看活动（账号须为学生身份）。',
  teacher: '用于发起与管理签到活动；注册老师账号需管理员发放的邀请码。',
  admin: '用于平台治理与安全审计。',
}

const activePortal = ref('student')
const portalHint = computed(() => portalHints[activePortal.value] ?? portalHints.student)

watch(
  () => route.query.portal,
  (p) => {
    if (p === 'student' || p === 'teacher' || p === 'admin') activePortal.value = p
  },
  { immediate: true }
)

function setPortal(id) {
  activePortal.value = id
}

function onPortalKeydown(e) {
  const ids = portals.map((p) => p.id)
  const i = ids.indexOf(activePortal.value)
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    if (i < ids.length - 1) setPortal(ids[i + 1])
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (i > 0) setPortal(ids[i - 1])
  }
}

/** @param {'student'|'teacher'|'admin'} portalId */
function portalMatches(portalId, user) {
  if (!user) return false
  if (portalId === 'admin') return !!user.is_super_admin
  if (portalId === 'teacher') return user.role === 'organizer'
  if (portalId === 'student') return user.role === 'participant'
  return true
}

/** @param {'student'|'teacher'|'admin'} portalId */
function portalMismatchCopy(portalId, user) {
  if (portalId === 'student') {
    if (user?.role === 'organizer') {
      return {
        title: '入口不匹配',
        message: '当前账号为「老师」身份，请在顶部切换到「老师入口」后再登录。',
      }
    }
    if (user?.is_super_admin) {
      return {
        title: '入口不匹配',
        message: '当前账号具备「平台管理员」权限，请在顶部切换到「管理员入口」后再登录。',
      }
    }
  }
  if (portalId === 'teacher') {
    if (user?.is_super_admin && user?.role !== 'organizer') {
      return {
        title: '入口不匹配',
        message: '当前账号为平台管理员（未标记为老师身份），请在「管理员入口」登录。',
      }
    }
    if (user?.role === 'participant') {
      return {
        title: '入口不匹配',
        message: '当前账号为「学生」身份，请在顶部切换到「学生入口」后再登录。',
      }
    }
  }
  if (portalId === 'admin') {
    if (user?.role === 'participant') {
      return {
        title: '入口不匹配',
        message: '当前账号为「学生」身份，请在「学生入口」登录。',
      }
    }
    if (user?.role === 'organizer' && !user?.is_super_admin) {
      return {
        title: '入口不匹配',
        message: '当前账号为「老师」身份但不具备平台管理员权限，请在「老师入口」登录。',
      }
    }
    return {
      title: '入口不匹配',
      message: '当前账号未被配置为平台管理员；如需访问请联系运维确认 SUPER_ADMIN_USER_IDS。',
    }
  }
  return {
    title: '入口不匹配',
    message: '请选择与账号身份一致的登录入口后重试。',
  }
}

const mismatchDialogOpen = ref(false)
const mismatchTitle = ref('')
const mismatchMessage = ref('')

function closeMismatchDialog() {
  mismatchDialogOpen.value = false
}

watch(mismatchDialogOpen, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})

onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { username: username.value.trim(), password: password.value },
    })
    const user = data.user
    if (!portalMatches(activePortal.value, user)) {
      const copy = portalMismatchCopy(activePortal.value, user)
      mismatchTitle.value = copy.title
      mismatchMessage.value = copy.message
      mismatchDialogOpen.value = true
      return
    }
    auth.setSession(data.token, user)
    const redir = route.query.redirect
    if (typeof redir === 'string' && redir.startsWith('/')) {
      router.replace(redir)
    } else {
      router.replace({ name: 'home' })
    }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}

function goRegister() {
  const q = {}
  if (activePortal.value === 'teacher') q.identity = 'teacher'
  else if (activePortal.value === 'student') q.identity = 'student'
  router.push({ name: 'register', query: q })
}
</script>

<template>
  <AppPageShell :show-nav="false">
    <div class="content content--auth stack stack--md">
      <div class="login-brand">
        <div class="login-brand__mark" aria-hidden="true">✓</div>
        <div class="login-brand__text">
          <h1 class="headline">SmartCheckIn</h1>
        </div>
      </div>

      <div
        class="login-portal-tabs"
        role="tablist"
        aria-label="选择登录入口"
        @keydown="onPortalKeydown"
      >
        <button
          v-for="p in portals"
          :key="p.id"
          type="button"
          class="login-portal-tabs__btn"
          :class="{ 'login-portal-tabs__btn--active': activePortal === p.id }"
          role="tab"
          :id="`login-portal-${p.id}`"
          :aria-selected="activePortal === p.id"
          @click="setPortal(p.id)"
        >
          {{ p.label }}
        </button>
      </div>
      <p class="login-portal-scope" aria-live="polite">{{ portalHint }}</p>

      <div v-if="error" class="banner-error">{{ error }}</div>

      <div
        class="card card-pad"
        role="tabpanel"
        :aria-labelledby="`login-portal-${activePortal}`"
      >
        <div class="field">
          <label for="u">用户名</label>
          <input id="u" v-model="username" class="input" autocomplete="username" placeholder="用户名" />
        </div>
        <div class="field field--flush">
          <label for="p">密码</label>
          <input
            id="p"
            v-model="password"
            class="input"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            @keyup.enter="submit"
          />
        </div>
      </div>

      <button type="button" class="btn btn-primary" :disabled="loading" @click="submit">
        {{ loading ? '登录中…' : '登录' }}
      </button>

      <button
        v-if="activePortal !== 'admin'"
        type="button"
        class="btn btn-secondary"
        @click="goRegister"
      >
        {{
          activePortal === 'teacher' ? '注册老师账号（需管理员邀请码）' : '注册学生账号（需老师邀请码）'
        }}
      </button>
      <p v-else class="muted text-caption text-center u-mb-0">
        首次启动会自动创建<strong>内建管理员</strong>：<code>admin</code>/<code>admin123</code>；亦可在环境变量
        <code>SUPER_ADMIN_USER_IDS</code> 中为其它帐号开通治理权限。
      </p>

      <details class="demo-disclosure">
        <summary>演示环境与本地数据说明</summary>
        <div class="demo-disclosure__body">
          数据在服务器本地 SQLite（<code>server/app.db</code>）。演示账号：<code>organizer</code>/<code>organizer123</code>（老师）、
          <code>alice</code>/<code>alice123</code>（学生）；<strong>内建管理员</strong>：<code>admin</code>/<code>admin123</code>（选「管理员入口」登录）。
          学生自助注册演示邀请码：<code>STUDENTDEMO</code>（仅空库种子库）；演示组织加入码：<code>DEMO2026</code>。
        </div>
      </details>
    </div>

    <Teleport to="body">
      <div
        v-if="mismatchDialogOpen"
        class="logout-dialog-backdrop"
        role="presentation"
        @click.self="closeMismatchDialog"
      >
        <div
          class="logout-dialog card card-pad stack"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-mismatch-title"
          @click.stop
        >
          <p id="portal-mismatch-title" class="list-cell__title u-mb-0">{{ mismatchTitle }}</p>
          <p class="muted u-mt-2 u-mb-0">{{ mismatchMessage }}</p>
          <div class="logout-dialog__actions">
            <button type="button" class="btn btn-primary" @click="closeMismatchDialog">
              我知道了
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </AppPageShell>
</template>
