<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import AppNavBar from '../components/AppNavBar.vue'

const router = useRouter()
const auth = useAuthStore()

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

function logout() {
  auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="page page--home">
    <AppNavBar title="首页" :show-back="false">
      <template #right>
        <button type="button" class="nav-bar__action" @click="logout">退出</button>
      </template>
    </AppNavBar>

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
        </div>
      </section>
    </div>
  </div>
</template>
