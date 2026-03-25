<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import AppNavBar from '../components/AppNavBar.vue'

const router = useRouter()
const auth = useAuthStore()

function goParticipant() {
  router.push({ name: 'participant-sessions' })
}

function goOrganizer() {
  router.push({ name: 'organizer' })
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

      <template v-if="auth.isOrganizer">
        <p class="muted" style="font-size: 15px; margin-bottom: 16px">
          <strong>组织者</strong>负责创建活动、配置签到方式与可签到名单；签到请使用下方「去签到」入口（若活动把你列在名单中）。
        </p>
        <div class="grouped-list" style="margin-bottom: 20px">
          <button
            type="button"
            class="list-cell chevron"
            style="width: 100%; border: none; text-align: left"
            @click="goOrganizer"
          >
            <span class="list-cell__title">组织者工作台</span>
            <span class="list-cell__meta">新建活动 · 名单 · 大屏码 · 统计</span>
          </button>
        </div>
        <div class="grouped-list" style="margin-bottom: 20px">
          <button
            type="button"
            class="list-cell chevron"
            style="width: 100%; border: none; text-align: left"
            @click="goParticipant"
          >
            <span class="list-cell__title">去签到（参与者视角）</span>
            <span class="list-cell__meta">仅显示你有权签到的活动</span>
          </button>
        </div>
      </template>

      <template v-else>
        <p class="muted" style="font-size: 15px; margin-bottom: 16px">
          当前为<strong>参与者</strong>账号：在「活动」页可浏览可签到的活动；若有<strong>活动编号 + 活动邀请码</strong>，可在列表顶部直接加入，无需事先在列表里看到该活动。
        </p>
        <div class="grouped-list" style="margin-bottom: 20px">
          <button
            type="button"
            class="list-cell chevron"
            style="width: 100%; border: none; text-align: left"
            @click="goParticipant"
          >
            <span class="list-cell__title">活动与签到</span>
            <span class="list-cell__meta">列表 · 顶部「用邀请码加入活动」</span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
