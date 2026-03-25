<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import { useAuthStore } from '../../stores/auth.js'
import AppNavBar from '../../components/AppNavBar.vue'
import { isoToLocalInput, localInputToIso } from '../../utils/date.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isEdit = computed(() => !!route.params.id)

const title = ref('')
const startsAt = ref('')
const endsAt = ref('')
const checkinModes = ref('BOTH')
const radiusM = ref(250)
const lat = ref(39.9042)
const lng = ref(116.4074)
const qrTtl = ref(60)
const participantScope = ref('open')
/** 用数组而非 Set，保证模板里 :checked / includes 能稳定触发更新 */
const rosterUserIds = ref([])
const organizerJoinsRoster = ref(false)
const inviteCode = ref('')
const participantOptions = ref([])
const saving = ref(false)
const error = ref('')
const loading = ref(false)

function setRosterMember(id, checked) {
  const cur = [...rosterUserIds.value]
  if (checked) {
    if (!cur.includes(id)) cur.push(id)
  } else {
    const i = cur.indexOf(id)
    if (i !== -1) cur.splice(i, 1)
  }
  rosterUserIds.value = cur
}

async function loadParticipants() {
  try {
    const data = await api('/users/participants')
    participantOptions.value = data.users || []
  } catch {
    participantOptions.value = []
  }
}

async function load() {
  await loadParticipants()
  if (!isEdit.value) {
    inviteCode.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const data = await api(`/sessions/${route.params.id}`)
    const s = data.session
    title.value = s.title
    startsAt.value = isoToLocalInput(s.starts_at)
    endsAt.value = isoToLocalInput(s.ends_at)
    checkinModes.value = s.checkin_modes
    participantScope.value = s.participant_scope === 'roster' ? 'roster' : s.participant_scope === 'invite' ? 'invite' : 'open'
    rosterUserIds.value = [...(s.allowed_user_ids || [])]
    organizerJoinsRoster.value = (s.allowed_user_ids || []).includes(auth.user?.id)
    inviteCode.value = ''

    if (s.geo_config?.center) {
      lat.value = s.geo_config.center.lat
      lng.value = s.geo_config.center.lng
      radiusM.value = s.geo_config.radius_m ?? 250
    }
    if (s.qr_config?.ttl_seconds) qrTtl.value = s.qr_config.ttl_seconds
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => route.params.id, load)

function useMyLocation() {
  if (!navigator.geolocation) {
    error.value = '浏览器不支持定位'
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lat.value = Math.round(pos.coords.latitude * 1e6) / 1e6
      lng.value = Math.round(pos.coords.longitude * 1e6) / 1e6
      error.value = ''
    },
    () => {
      error.value = '无法获取当前位置'
    },
    { enableHighAccuracy: true, timeout: 20000 }
  )
}

function buildAllowedIds() {
  const ids = [...new Set(rosterUserIds.value)]
  if (organizerJoinsRoster.value && auth.user?.id && !ids.includes(auth.user.id)) {
    ids.push(auth.user.id)
  }
  return ids
}

function buildBody() {
  const modes = checkinModes.value
  const scope = participantScope.value
  const body = {
    title: title.value.trim(),
    starts_at: localInputToIso(startsAt.value),
    ends_at: localInputToIso(endsAt.value),
    checkin_modes: modes,
    participant_scope: scope,
    allowed_user_ids: scope === 'roster' ? buildAllowedIds() : [],
  }
  if (scope === 'invite') {
    const c = inviteCode.value.trim()
    if (c.length >= 4) body.invite_code = c
    else if (!isEdit.value) {
      /* validated in save */
    }
  }
  if (modes === 'GEO' || modes === 'BOTH') {
    body.geo_config = {
      center: { lat: Number(lat.value), lng: Number(lng.value) },
      radius_m: Number(radiusM.value),
    }
  }
  if (modes === 'QR' || modes === 'BOTH') {
    body.qr_config = { ttl_seconds: Number(qrTtl.value) }
  }
  return body
}

async function save() {
  error.value = ''
  if (participantScope.value === 'roster' && buildAllowedIds().length === 0) {
    error.value = '名单模式下请至少选择一名成员，或勾选「我也参与签到」'
    return
  }
  if (participantScope.value === 'invite') {
    if (!isEdit.value && inviteCode.value.trim().length < 4) {
      error.value = '邀请码制需设置至少 4 位邀请码，并告知参与者'
      return
    }
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await api(`/sessions/${route.params.id}`, { method: 'PUT', body: buildBody() })
    } else {
      await api('/sessions', { method: 'POST', body: buildBody() })
    }
    router.replace({ name: 'organizer' })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <AppNavBar :title="isEdit ? '编辑活动' : '新建活动'" @back="router.push({ name: 'organizer' })" />

    <div class="content">
      <div v-if="loading" class="spinner-wrap muted">加载中…</div>
      <template v-else>
        <div v-if="error" class="banner-error">{{ error }}</div>

        <div class="card card-pad">
          <div class="field">
            <label>标题</label>
            <input v-model="title" class="input" placeholder="例如：春季全员会" />
          </div>
          <div class="field">
            <label>开始时间</label>
            <input v-model="startsAt" class="input" type="datetime-local" />
          </div>
          <div class="field">
            <label>结束时间</label>
            <input v-model="endsAt" class="input" type="datetime-local" />
          </div>

          <p class="muted" style="font-size: 15px; margin-bottom: 8px">谁可以签到</p>
          <div class="field">
            <select v-model="participantScope" class="select input">
              <option value="open">任何人（已注册用户）</option>
              <option value="roster">仅指定成员（勾选名单）</option>
              <option value="invite">邀请码（分享活动链接 + 口令）</option>
            </select>
          </div>
          <p v-if="participantScope === 'open'" class="muted" style="font-size: 14px; margin-top: 0">
            所有登录用户可见并签到。地理围栏仍以距离判定，不再强制「定位精度」门槛（室内更稳）。
          </p>
          <p v-if="participantScope === 'invite'" class="muted" style="font-size: 14px; margin-top: 0">
            参与者需打开你分享的活动链接，输入邀请码通过后即可签到。邀请码与「注册组织者」用的开发者邀请码无关。
          </p>

          <template v-if="participantScope === 'invite'">
            <div class="field">
              <label>{{ isEdit ? '新邀请码（留空则保留原码）' : '活动邀请码' }}</label>
              <input
                v-model="inviteCode"
                class="input"
                autocomplete="off"
                placeholder="至少 4 位，勿与登录密码相同"
              />
            </div>
          </template>

          <template v-if="participantScope === 'roster'">
            <label class="muted" style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px">
              <input v-model="organizerJoinsRoster" type="checkbox" />
              我也参与签到（将组织者账号加入名单）
            </label>
            <p class="muted" style="font-size: 14px; margin-bottom: 8px">可签到成员</p>
            <div
              v-if="!participantOptions.length"
              class="muted"
              style="font-size: 14px; padding: 12px; background: var(--ios-bg); border-radius: var(--radius-md)"
            >
              暂无参与者账号，请先让用户注册，或改用「邀请码 / 任何人」模式。
            </div>
            <div v-else class="grouped-list" style="margin-bottom: 0">
              <label
                v-for="u in participantOptions"
                :key="u.id"
                class="list-cell"
                style="cursor: pointer; margin: 0"
              >
                <span class="list-cell__title">{{ u.display_name }}（{{ u.username }}）</span>
                <input
                  type="checkbox"
                  :checked="rosterUserIds.includes(u.id)"
                  @change="setRosterMember(u.id, $event.target.checked)"
                />
              </label>
            </div>
          </template>

          <div class="field" style="margin-top: 18px">
            <label>签到方式</label>
            <select v-model="checkinModes" class="select input">
              <option value="GEO">仅地理位置</option>
              <option value="QR">仅二维码</option>
              <option value="BOTH">地理 + 二维码</option>
            </select>
          </div>

          <template v-if="checkinModes === 'GEO' || checkinModes === 'BOTH'">
            <p class="muted" style="font-size: 15px">地理围栏（仅判断到中心点距离）</p>
            <button type="button" class="btn btn-secondary" style="margin-bottom: 12px" @click="useMyLocation">
              使用我当前的位置作为中心
            </button>
            <div class="field">
              <label>纬度</label>
              <input v-model.number="lat" class="input" type="number" step="any" />
            </div>
            <div class="field">
              <label>经度</label>
              <input v-model.number="lng" class="input" type="number" step="any" />
            </div>
            <div class="field">
              <label>允许半径（米）</label>
              <input v-model.number="radiusM" class="input" type="number" min="10" />
              <p class="muted" style="font-size: 13px; margin-top: 8px">室内建议 200～500 米或更大，减少边缘误拦。</p>
            </div>
          </template>

          <template v-if="checkinModes === 'QR' || checkinModes === 'BOTH'">
            <div class="field">
              <label>二维码刷新间隔（秒）</label>
              <input v-model.number="qrTtl" class="input" type="number" min="15" max="300" />
            </div>
          </template>
        </div>

        <button type="button" class="btn btn-primary" style="margin-top: 20px" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>

        <button
          v-if="isEdit"
          type="button"
          class="btn btn-secondary"
          style="margin-top: 12px"
          @click="router.push({ name: 'organizer-qr', params: { id: route.params.id } })"
        >
          大屏二维码
        </button>
        <button
          v-if="isEdit"
          type="button"
          class="btn btn-secondary"
          style="margin-top: 12px"
          @click="router.push({ name: 'organizer-stats', params: { id: route.params.id } })"
        >
          统计数据
        </button>
        <button
          v-if="isEdit"
          type="button"
          class="btn btn-secondary"
          style="margin-top: 12px"
          @click="router.push({ name: 'organizer-records', params: { id: route.params.id } })"
        >
          签到记录
        </button>
      </template>
    </div>
  </div>
</template>
