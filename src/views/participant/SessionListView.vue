<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import AppNavBar from '../../components/AppNavBar.vue'
import { formatLocal } from '../../utils/date.js'

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i

function parseSessionId(raw) {
  const s = String(raw || '').trim()
  const m = s.match(UUID_RE)
  return m ? m[0].toLowerCase() : ''
}

const router = useRouter()
const sessions = ref([])
const loading = ref(true)
const error = ref('')

const quickJoinId = ref('')
const quickJoinCode = ref('')
const quickJoinErr = ref('')
const quickJoinLoading = ref(false)

function statusPill(s) {
  const m = { scheduled: 'pill-scheduled', active: 'pill-active', ended: 'pill-ended', cancelled: 'pill-cancelled' }
  const t = { scheduled: '未开始', active: '进行中', ended: '已结束', cancelled: '已取消' }
  return { cls: m[s.status] || '', text: t[s.status] || s.status }
}

function scopeLabel(s) {
  if (s.participant_scope === 'roster') return '仅名单'
  if (s.participant_scope === 'invite') return '邀请码'
  return ''
}

async function loadSessions() {
  loading.value = true
  error.value = ''
  try {
    const data = await api('/sessions')
    sessions.value = data.sessions || []
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function submitQuickJoin() {
  quickJoinErr.value = ''
  const id = parseSessionId(quickJoinId.value)
  if (!id) {
    quickJoinErr.value = '请填写活动编号，或粘贴组织者分享的完整链接（内含一串字母数字与短横线）'
    return
  }
  const code = quickJoinCode.value.trim()
  if (!code) {
    quickJoinErr.value = '请填写该活动的邀请码'
    return
  }
  quickJoinLoading.value = true
  try {
    await api(`/sessions/${id}/join`, { method: 'POST', body: { code } })
    quickJoinId.value = ''
    quickJoinCode.value = ''
    await loadSessions()
    router.push({ name: 'participant-session', params: { id } })
  } catch (e) {
    quickJoinErr.value = e instanceof ApiError ? e.message : '加入失败'
  } finally {
    quickJoinLoading.value = false
  }
}

onMounted(loadSessions)

function open(id) {
  router.push({ name: 'participant-session', params: { id } })
}
</script>

<template>
  <div class="page">
    <AppNavBar title="活动" @back="router.push({ name: 'home' })" />

    <div class="content">
      <div class="card card-pad" style="margin-bottom: 20px">
        <p class="list-cell__title" style="margin-bottom: 8px">用邀请码加入活动</p>
        <p class="muted" style="margin-top: 0; font-size: 14px; line-height: 1.45">
          向组织者索取<strong>活动编号</strong>（或含编号的<strong>分享链接</strong>）以及<strong>活动邀请码</strong>。此处填写的是创建活动时设置的口令，与注册账号用的「组织者邀请码」无关。
        </p>
        <div v-if="quickJoinErr" class="banner-error" style="margin-top: 12px">{{ quickJoinErr }}</div>
        <div class="field">
          <label>活动编号或分享链接</label>
          <input
            v-model="quickJoinId"
            class="input"
            autocomplete="off"
            placeholder="粘贴编号或整段链接"
          />
        </div>
        <div class="field">
          <label>活动邀请码</label>
          <input
            v-model="quickJoinCode"
            class="input"
            autocomplete="off"
            placeholder="组织者告知的签到活动口令"
          />
        </div>
        <button type="button" class="btn btn-primary" :disabled="quickJoinLoading" @click="submitQuickJoin">
          {{ quickJoinLoading ? '加入中…' : '加入活动' }}
        </button>
      </div>

      <div v-if="error" class="banner-error">{{ error }}</div>
      <div v-if="loading" class="spinner-wrap muted">加载中…</div>

      <div v-else-if="!sessions.length" class="card card-pad muted">
        下方暂无活动。邀请制可在上方填写编号与邀请码加入；名单制需组织者在名单中勾选你；公开活动会直接出现在列表中。
      </div>

      <div v-else class="grouped-list">
        <button
          v-for="s in sessions"
          :key="s.id"
          type="button"
          class="list-cell chevron"
          style="width: 100%; border: none; text-align: left"
          @click="open(s.id)"
        >
          <div>
            <div class="list-cell__title">{{ s.title }}</div>
            <div class="muted" style="font-size: 14px; margin-top: 4px">{{ formatLocal(s.starts_at) }} — {{ formatLocal(s.ends_at) }}</div>
          </div>
          <span style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end">
            <span v-if="scopeLabel(s)" class="pill pill-ended">{{ scopeLabel(s) }}</span>
            <span :class="['pill', statusPill(s).cls]">{{ statusPill(s).text }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
