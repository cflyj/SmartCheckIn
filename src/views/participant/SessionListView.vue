<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api/client.js'
import AppPageShell from '../../components/AppPageShell.vue'
import PageFetchState from '../../components/PageFetchState.vue'
import { formatLocal } from '../../utils/date.js'
import { apiErrorMessage } from '../../utils/apiHelpers.js'
import { sessionStatusPill } from '../../utils/sessionStatus.js'

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
const fetchError = ref('')

const quickJoinId = ref('')
const quickJoinCode = ref('')
const quickJoinErr = ref('')
const quickJoinLoading = ref(false)

function scopeLabel(s) {
  if (s.participant_scope === 'roster') return '仅名单'
  if (s.participant_scope === 'invite') return '邀请码'
  return ''
}

async function loadSessions() {
  loading.value = true
  fetchError.value = ''
  try {
    const data = await api('/sessions')
    sessions.value = data.sessions || []
  } catch (e) {
    fetchError.value = apiErrorMessage(e, '加载失败')
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
    quickJoinErr.value = apiErrorMessage(e, '加入失败')
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
  <AppPageShell nav-title="活动" @back="router.push({ name: 'home' })">

    <div class="content stack stack--md stack--airy">
      <div class="card card-pad stack">
        <p class="list-cell__title u-mb-2">用邀请码加入活动</p>
        <p class="muted text-body-xs u-mt-0">
          向组织者索取<strong>活动编号</strong>（或含编号的<strong>分享链接</strong>）以及<strong>活动邀请码</strong>。此处填写的是创建活动时设置的口令，与注册账号用的「组织者邀请码」无关。
        </p>
        <div v-if="quickJoinErr" class="banner-error">{{ quickJoinErr }}</div>
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

      <PageFetchState :loading="loading" :error="fetchError">
        <template v-if="sessions.length">
          <p class="text-caption u-mb-2">
            已成功签到的活动带有<strong>「已签到」</strong>标签与<strong>左侧短竖条</strong>（居中、约占行高 90%），可与尚未签到的活动区分。
          </p>
          <div class="grouped-list">
            <button
              v-for="s in sessions"
              :key="s.id"
              type="button"
              class="list-cell chevron participant-session-list__row-btn"
              @click="open(s.id)"
            >
              <div
                class="participant-session-list__inner"
                :class="{ 'participant-session-list__inner--done': s.has_checked_in }"
              >
                <div class="participant-session-list__main">
                  <div class="list-cell__title">{{ s.title }}</div>
                </div>
                <div class="participant-session-list__tags">
                  <span v-if="s.has_checked_in" class="pill pill-checked-in">已签到</span>
                  <span v-if="scopeLabel(s)" class="pill pill-scope">{{ scopeLabel(s) }}</span>
                  <span :class="['pill', sessionStatusPill(s).cls]">{{ sessionStatusPill(s).text }}</span>
                </div>
                <div class="participant-session-list__time muted">
                  {{ formatLocal(s.starts_at) }} — {{ formatLocal(s.ends_at) }}
                </div>
              </div>
            </button>
          </div>
        </template>

        <div v-else class="empty-state" role="status">
          <div class="empty-state__icon" aria-hidden="true">📋</div>
          <p class="empty-state__title">暂无活动</p>
          <p class="empty-state__text">
            邀请制可在上方填写编号与邀请码加入；名单制需组织者在名单中勾选你。
          </p>
        </div>
      </PageFetchState>
    </div>
  </AppPageShell>
</template>
