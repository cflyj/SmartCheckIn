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

const inviteLoading = ref(false)
const inviteError = ref('')
const invitePlain = ref('')
const inviteUsesDraft = ref('1')

async function createStudentInvite() {
  inviteError.value = ''
  invitePlain.value = ''
  let uses = parseInt(String(inviteUsesDraft.value), 10)
  if (!Number.isFinite(uses) || uses < 1) uses = 1
  if (uses > 500) uses = 500
  inviteUsesDraft.value = String(uses)

  inviteLoading.value = true
  try {
    const data = await api('/registration-invites', {
      method: 'POST',
      body: { remaining_uses: uses },
    })
    invitePlain.value = data.code || ''
  } catch (e) {
    invitePlain.value = ''
    inviteError.value = apiErrorMessage(e, '生成失败')
  } finally {
    inviteLoading.value = false
  }
}

async function copyInvitePlain() {
  const t = invitePlain.value.trim()
  if (!t) return
  const ok = await copyToClipboard(t)
  if (ok) {
    inviteError.value = ''
    copyTip.value = '已复制学生注册邀请码，请妥善发给对方。'
    return
  }
  inviteError.value = '复制失败：请长按邀请码手动拷贝'
}

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

      <section class="card card-pad stack stack--sm u-mt-2" aria-labelledby="student-inv-label">
        <h2 id="student-inv-label" class="list-cell__title u-mb-0">学生注册邀请码</h2>
        <p class="muted text-body-xs u-mb-0">
          生成后发给需要<strong>自助注册为学生</strong>的用户；次数用尽后需重新生成。
        </p>
        <div class="field field--tight u-mt-2">
          <label class="text-body-xs" for="invite-uses">可用次数（1～500）</label>
          <input id="invite-uses" v-model="inviteUsesDraft" type="number" min="1" max="500" class="input" />
        </div>
        <button type="button" class="btn btn-secondary" :disabled="inviteLoading" @click="createStudentInvite">
          {{ inviteLoading ? '生成中…' : '生成新的学生邀请码' }}
        </button>
        <p v-if="inviteError" class="banner-error u-mt-2 u-mb-0">{{ inviteError }}</p>
        <div v-if="invitePlain" class="field field--tight u-mt-2">
          <label class="text-body-xs">邀请码（仅此一次完整展示）</label>
          <input class="input" readonly :value="invitePlain" @focus="$event.target.select()" />
          <button type="button" class="btn btn-primary btn-small u-mt-2" @click="copyInvitePlain">
            复制邀请码
          </button>
        </div>
      </section>

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
