<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import AppPageShell from '../components/AppPageShell.vue'

const router = useRouter()
const auth = useAuthStore()

const logoutConfirmOpen = ref(false)

const avatarLetter = computed(() => {
  const raw = auth.user?.display_name || auth.user?.username || '?'
  const s = String(raw).trim()
  if (!s) return '?'
  const ch = s[0]
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch
})

function goHosted() {
  router.push({ name: 'organizer' })
}

function goAttend() {
  router.push({ name: 'participant-sessions' })
}

function goOrgs() {
  router.push({ name: 'orgs' })
}

function openLogoutConfirm() {
  logoutConfirmOpen.value = true
}

function closeLogoutConfirm() {
  logoutConfirmOpen.value = false
}

function confirmLogout() {
  closeLogoutConfirm()
  auth.logout()
  router.replace({ name: 'login' })
}

watch(logoutConfirmOpen, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})

onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <AppPageShell
    page-class="page--home"
    nav-title="首页"
    :show-back="false"
  >
      <template #nav-right>
        <button type="button" class="nav-bar__action" @click="openLogoutConfirm">退出</button>
      </template>

    <div class="content stack stack--md">
      <div class="home-hero">
        <div class="home-hero__inner">
          <div class="home-hero__avatar" aria-hidden="true">{{ avatarLetter }}</div>
          <div class="home-hero__text">
            <p class="home-hero__greet">你好，{{ auth.user?.display_name }}</p>
            <p class="home-hero__tagline">发起或参与签到，组织与活动一目了然。</p>
          </div>
        </div>
      </div>

      <div class="home-tip" role="note">
        <span class="home-tip__lead">提示</span>
        <p class="home-tip__body">
          任意用户可<strong>发起</strong>或<strong>参与</strong>签到；名单制需先加入<strong>组织</strong>，并在成员中勾选签到对象。
        </p>
      </div>

      <section class="home-section" aria-labelledby="home-quick-label">
        <h2 id="home-quick-label" class="home-section__label">快捷入口</h2>
        <div class="grouped-list grouped-list--home">
          <button type="button" class="list-cell list-cell--home-tile chevron" @click="goOrgs">
            <span class="home-tile__icon home-tile__icon--orgs" aria-hidden="true">🏢</span>
            <span class="list-cell__stack">
              <span class="list-cell__title">我的组织</span>
              <span class="list-cell__meta">新建 · 加入码 · 成员与转让</span>
            </span>
          </button>
          <button type="button" class="list-cell list-cell--home-tile chevron" @click="goHosted">
            <span class="home-tile__icon home-tile__icon--hosted" aria-hidden="true">📋</span>
            <span class="list-cell__stack">
              <span class="list-cell__title">我发起的活动</span>
              <span class="list-cell__meta">新建 · 编辑 · 大屏码 · 统计</span>
            </span>
          </button>
          <button type="button" class="list-cell list-cell--home-tile chevron" @click="goAttend">
            <span class="home-tile__icon home-tile__icon--attend" aria-hidden="true">✅</span>
            <span class="list-cell__stack">
              <span class="list-cell__title">参与签到</span>
              <span class="list-cell__meta">可签到的活动 · 邀请码加入</span>
            </span>
          </button>
          <router-link
            class="list-cell list-cell--home-tile chevron home-tile-router"
            to="/participant/face-enroll"
          >
            <span class="home-tile__icon home-tile__icon--face" aria-hidden="true">😀</span>
            <span class="list-cell__stack">
              <span class="list-cell__title">人脸样本录入</span>
              <span class="list-cell__meta">参与人脸签到前请先在此保存特征</span>
            </span>
          </router-link>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="logoutConfirmOpen"
        class="logout-dialog-backdrop"
        role="presentation"
        @click.self="closeLogoutConfirm"
      >
        <div
          class="logout-dialog card card-pad stack"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          @click.stop
        >
          <p id="logout-dialog-title" class="list-cell__title u-mb-0">确认退出登录？</p>
          <p class="muted u-mt-2 u-mb-0">退出后需要重新登录才能使用发起活动、参与签到等功能。</p>
          <div class="logout-dialog__actions">
            <button type="button" class="btn btn-secondary" @click="closeLogoutConfirm">取消</button>
            <button type="button" class="btn btn-danger" @click="confirmLogout">退出登录</button>
          </div>
        </div>
      </div>
    </Teleport>
  </AppPageShell>
</template>

<style scoped>
.logout-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  padding-top: max(var(--space-4), var(--safe-top));
  padding-bottom: max(var(--space-4), var(--safe-bottom));
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
}

.logout-dialog {
  width: min(100%, 320px);
  box-shadow: var(--shadow-modal, 0 12px 40px rgba(0, 0, 0, 0.14));
}

.logout-dialog__actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.logout-dialog__actions .btn {
  flex: 1;
  min-height: 44px;
}
</style>
