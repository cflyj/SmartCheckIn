<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import AppNavBar from '../components/AppNavBar.vue'

const router = useRouter()
const auth = useAuthStore()

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
  <div class="page">
    <AppNavBar title="首页" :show-back="false">
      <template #right>
        <button type="button" class="nav-bar__action" @click="logout">退出</button>
      </template>
    </AppNavBar>

    <div class="content">
      <p class="subhead" style="margin-top: 0">你好，{{ auth.user?.display_name }}</p>
      <p class="muted" style="font-size: 15px; margin-bottom: 16px; line-height: 1.45">
        任意登录用户都可以<strong>发起签到活动</strong>，也可以<strong>参与他人活动</strong>。「名单制」签到需先加入<strong>组织</strong>，且只能从你所选的一个或多个组织成员中勾选签到对象。
      </p>
      <div class="grouped-list" style="margin-bottom: 20px">
        <button
          type="button"
          class="list-cell chevron"
          style="width: 100%; border: none; text-align: left"
          @click="goOrgs"
        >
          <span class="list-cell__title">我的组织</span>
          <span class="list-cell__meta">新建 · 加入码 · 成员与转让</span>
        </button>
      </div>
      <div class="grouped-list" style="margin-bottom: 20px">
        <button
          type="button"
          class="list-cell chevron"
          style="width: 100%; border: none; text-align: left"
          @click="goHosted"
        >
          <span class="list-cell__title">我发起的活动</span>
          <span class="list-cell__meta">新建 · 编辑 · 大屏码 · 统计</span>
        </button>
      </div>
      <div class="grouped-list" style="margin-bottom: 20px">
        <button
          type="button"
          class="list-cell chevron"
          style="width: 100%; border: none; text-align: left"
          @click="goAttend"
        >
          <span class="list-cell__title">参与签到</span>
          <span class="list-cell__meta">可签到的活动 · 邀请码加入</span>
        </button>
      </div>
    </div>
  </div>
</template>
