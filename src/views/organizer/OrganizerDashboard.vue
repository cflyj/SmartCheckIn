<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api/client.js'
import AppPageShell from '../../components/AppPageShell.vue'
import PageFetchState from '../../components/PageFetchState.vue'
import { formatLocal } from '../../utils/date.js'
import { apiErrorMessage } from '../../utils/apiHelpers.js'
import { sessionStatusPill } from '../../utils/sessionStatus.js'
import { copyToClipboard } from '../../utils/copyText.js'

const router = useRouter()
const sessions = ref([])
const loading = ref(true)
const error = ref('')
const copyTip = ref('')
/** 一键复制失败时展示可长按/全选的链接（百度等浏览器） */
const copyFallbackUrl = ref('')

function participantJoinUrl(sessionId) {
  const { fullPath } = router.resolve({ name: 'participant-session', params: { id: sessionId } })
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${fullPath}`
  }
  return fullPath
}

async function copyParticipantLink(sessionId) {
  copyTip.value = ''
  copyFallbackUrl.value = ''
  const url = participantJoinUrl(sessionId)
  const ok = await copyToClipboard(url)
  if (ok) {
    copyTip.value = '已复制参与者链接，可发给需要签到的人（对方仍需活动邀请码）。'
    return
  }
  copyFallbackUrl.value = url
  copyTip.value =
    '当前浏览器无法自动复制（如百度浏览器常限制剪贴板）。请长按下方链接全选复制，或换用系统自带浏览器 / Chrome。'
}

function selectCopyFallback(ev) {
  ev.target?.select?.()
}

onMounted(async () => {
  loading.value = true
  try {
    const data = await api('/sessions?mine=1')
    sessions.value = data.sessions || []
  } catch (e) {
    error.value = apiErrorMessage(e, '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppPageShell nav-title="我发起的活动" @back="router.push({ name: 'home' })">
    <template #nav-right>
      <button type="button" class="nav-bar__action" @click="router.push({ name: 'organizer-session-new' })">新建</button>
    </template>

    <div class="content stack stack--md">
      <p class="muted text-body-xs section-hint">
        新建活动仅支持「仅指定成员」或「邀请码」，不再提供「任何人可签到」，减轻无关用户列表干扰。「邀请码」类：参与者需在活动页填写<strong>活动编号/链接</strong>与<strong>活动邀请码</strong>；「仅指定成员」需在组织成员中勾选名单。
      </p>
      <p v-if="copyTip" class="muted text-body-xs section-hint u-mt-0">{{ copyTip }}</p>
      <div v-if="copyFallbackUrl" class="field field--tight u-mt-2">
        <label class="text-body-xs">参与者链接（可长按全选复制）</label>
        <input
          class="input"
          type="text"
          readonly
          :value="copyFallbackUrl"
          @focus="selectCopyFallback"
          @click="selectCopyFallback"
        />
      </div>
      <PageFetchState :loading="loading" :error="error">
        <template v-if="!sessions.length">
          <div class="empty-state" role="status">
            <div class="empty-state__icon" aria-hidden="true">📅</div>
            <p class="empty-state__title">还没有活动</p>
            <p class="empty-state__text">点击右上角「新建」创建签到活动。</p>
          </div>
        </template>

        <div v-else class="grouped-list">
          <div v-for="s in sessions" :key="s.id" class="list-cell list-cell--bundle list-cell--static">
            <button
              type="button"
              class="organizer-row__link chevron"
              @click="router.push({ name: 'organizer-session-edit', params: { id: s.id } })"
            >
              <div class="organizer-row__link-body">
                <div class="list-cell__title">{{ s.title }}</div>
                <div class="muted meta-under-title">{{ formatLocal(s.starts_at) }}</div>
              </div>
              <span :class="['pill', sessionStatusPill(s).cls]">{{ sessionStatusPill(s).text }}</span>
            </button>
            <button
              v-if="s.participant_scope === 'invite'"
              type="button"
              class="btn btn-secondary btn--shrink organizer-row__copy"
              @click.stop="copyParticipantLink(s.id)"
            >
              复制参与者链接
            </button>
          </div>
        </div>
      </PageFetchState>
    </div>
  </AppPageShell>
</template>
