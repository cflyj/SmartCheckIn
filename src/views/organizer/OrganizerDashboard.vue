<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import AppNavBar from '../../components/AppNavBar.vue'
import { formatLocal } from '../../utils/date.js'

const router = useRouter()
const sessions = ref([])
const loading = ref(true)
const error = ref('')
const copyTip = ref('')

function participantJoinUrl(sessionId) {
  const { fullPath } = router.resolve({ name: 'participant-session', params: { id: sessionId } })
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${fullPath}`
  }
  return fullPath
}

async function copyParticipantLink(sessionId) {
  copyTip.value = ''
  const url = participantJoinUrl(sessionId)
  try {
    await navigator.clipboard.writeText(url)
    copyTip.value = '已复制参与者链接，可发给需要签到的人（对方仍需活动邀请码）。'
  } catch {
    copyTip.value = '复制失败，请手动复制：' + url
  }
}

function pill(s) {
  const m = { scheduled: 'pill-scheduled', active: 'pill-active', ended: 'pill-ended', cancelled: 'pill-cancelled' }
  const t = { scheduled: '未开始', active: '进行中', ended: '已结束', cancelled: '已取消' }
  return { cls: m[s.status] || '', text: t[s.status] || s.status }
}

onMounted(async () => {
  loading.value = true
  try {
    const data = await api('/sessions?mine=1')
    sessions.value = data.sessions || []
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <AppNavBar title="我发起的活动" @back="router.push({ name: 'home' })">
      <template #right>
        <button type="button" class="nav-bar__action" @click="router.push({ name: 'organizer-session-new' })">新建</button>
      </template>
    </AppNavBar>

    <div class="content">
      <p class="muted" style="font-size: 14px; margin-bottom: 12px">
        新建活动仅支持「仅指定成员」或「邀请码」，不再提供「任何人可签到」，减轻无关用户列表干扰。「邀请码」类：参与者需在活动页填写<strong>活动编号/链接</strong>与<strong>活动邀请码</strong>；「仅指定成员」需在组织成员中勾选名单。
      </p>
      <p v-if="copyTip" class="muted" style="font-size: 14px; margin-bottom: 12px">{{ copyTip }}</p>
      <div v-if="error" class="banner-error">{{ error }}</div>
      <div v-if="loading" class="spinner-wrap muted">加载中…</div>

      <div v-else-if="!sessions.length" class="card card-pad muted">还没有活动，点击右上角新建。</div>

      <div v-else class="grouped-list">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="list-cell"
          style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; width: 100%"
        >
          <button
            type="button"
            class="list-cell chevron"
            style="flex: 1; min-width: 0; border: none; text-align: left; background: transparent; padding: 0; cursor: pointer"
            @click="router.push({ name: 'organizer-session-edit', params: { id: s.id } })"
          >
            <div style="flex: 1; min-width: 0">
              <div class="list-cell__title">{{ s.title }}</div>
              <div class="muted" style="font-size: 14px; margin-top: 4px">{{ formatLocal(s.starts_at) }}</div>
            </div>
            <span :class="['pill', pill(s).cls]">{{ pill(s).text }}</span>
          </button>
          <button
            v-if="s.participant_scope === 'invite'"
            type="button"
            class="btn btn-secondary"
            style="flex-shrink: 0; margin-left: auto"
            @click.stop="copyParticipantLink(s.id)"
          >
            复制参与者链接
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
