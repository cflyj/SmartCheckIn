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
const participantScope = ref('roster')
/** 名单制：先选组织（须已加入），再在成员池内勾选 */
const myOrgs = ref([])
const selectedOrgIds = ref([])
const rosterPool = ref([])
const rosterSelectedIds = ref([])
const rosterLoadErr = ref('')
/** 编辑历史「任何人可签到」活动时提示改为名单/邀请码 */
const needsScopeMigration = ref(false)
const inviteCode = ref('')
const saving = ref(false)
const error = ref('')
const loading = ref(false)

async function loadMyOrgs() {
  try {
    const data = await api('/orgs')
    myOrgs.value = data.organizations || []
  } catch {
    myOrgs.value = []
  }
}

async function refreshRosterPool() {
  rosterLoadErr.value = ''
  rosterPool.value = []
  if (participantScope.value !== 'roster') return
  const ids = selectedOrgIds.value
  if (!ids.length) return
  const q = ids.join(',')
  try {
    const data = await api(`/orgs/roster-candidates?org_ids=${encodeURIComponent(q)}`)
    rosterPool.value = data.users || []
    rosterSelectedIds.value = rosterSelectedIds.value.filter((uid) => rosterPool.value.some((u) => u.id === uid))
  } catch (e) {
    rosterLoadErr.value = e instanceof ApiError ? e.message : '加载成员池失败'
    rosterPool.value = []
  }
}

function setOrgSelected(orgId, checked) {
  const s = new Set(selectedOrgIds.value)
  if (checked) s.add(orgId)
  else s.delete(orgId)
  selectedOrgIds.value = [...s]
}

function setRosterUserSelected(uid, checked) {
  const cur = new Set(rosterSelectedIds.value)
  if (checked) cur.add(uid)
  else cur.delete(uid)
  rosterSelectedIds.value = [...cur]
}

async function load() {
  await loadMyOrgs()
  if (!isEdit.value) {
    inviteCode.value = ''
    selectedOrgIds.value = []
    rosterPool.value = []
    rosterSelectedIds.value = []
    rosterLoadErr.value = ''
    needsScopeMigration.value = false
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
    needsScopeMigration.value = s.participant_scope === 'open'
    participantScope.value = s.participant_scope === 'invite' ? 'invite' : 'roster'
    const allowed = s.allowed_user_ids || []
    selectedOrgIds.value = [...(s.roster_org_ids || [])]
    rosterSelectedIds.value =
      s.participant_scope === 'roster' || s.participant_scope === 'open' ? [...allowed] : []
    await refreshRosterPool()
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

watch(
  () => [participantScope.value, selectedOrgIds.value.slice().sort().join(',')],
  () => {
    if (participantScope.value === 'roster') refreshRosterPool()
  }
)

const organizerInPool = computed(() => {
  const me = auth.user?.id
  return me ? rosterPool.value.some((u) => u.id === me) : false
})

/** 与成员列表中「勾选自己」共用 rosterSelectedIds，避免两处状态不一致 */
const organizerSelfSelected = computed({
  get() {
    const me = auth.user?.id
    return me ? rosterSelectedIds.value.includes(me) : false
  },
  set(v) {
    const me = auth.user?.id
    if (!me) return
    setRosterUserSelected(me, v)
  },
})

const rosterAllSelected = computed(() => {
  const pool = rosterPool.value
  if (!pool.length) return false
  const set = new Set(rosterSelectedIds.value)
  return pool.every((u) => set.has(u.id))
})

function toggleSelectAllRoster() {
  if (rosterAllSelected.value) {
    rosterSelectedIds.value = []
  } else {
    rosterSelectedIds.value = rosterPool.value.map((u) => u.id)
  }
}

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

function buildBody() {
  const modes = checkinModes.value
  const scope = participantScope.value
  const body = {
    title: title.value.trim(),
    starts_at: localInputToIso(startsAt.value),
    ends_at: localInputToIso(endsAt.value),
    checkin_modes: modes,
    participant_scope: scope,
    allowed_user_ids: scope === 'roster' ? [...new Set(rosterSelectedIds.value)] : [],
    roster_org_ids: scope === 'roster' ? [...selectedOrgIds.value] : [],
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
  if (participantScope.value === 'roster') {
    if (!selectedOrgIds.value.length) {
      error.value = '名单制请至少选择一个组织作为成员范围'
      return
    }
    if (![...new Set(rosterSelectedIds.value)].length) {
      error.value = '请在成员列表中至少勾选一人（可与下方「我也参与签到」或名单中勾选项二选一，状态已同步）'
      return
    }
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

          <div v-if="needsScopeMigration" class="banner-error" style="margin-bottom: 12px">
            该活动曾为「任何人可签到」，已不再提供此方式（避免无关用户列表里出现本活动）。请改为「仅指定成员」或「邀请码」后保存。
          </div>
          <p class="muted" style="font-size: 15px; margin-bottom: 8px">谁可以签到</p>
          <div class="field">
            <select v-model="participantScope" class="select input">
              <option value="roster">仅指定成员（从已选组织成员中勾选）</option>
              <option value="invite">邀请码（分享链接 + 口令后加入）</option>
            </select>
          </div>
          <p v-if="participantScope === 'invite'" class="muted" style="font-size: 14px; margin-top: 0">
            参与者使用活动链接或活动编号，并输入你设置的活动邀请码后即可签到。
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
            <p class="muted" style="font-size: 14px; margin-top: 0; line-height: 1.45">
              勾选<strong>一个或多个</strong>你所在的组织，可选签到成员为所选组织的<strong>成员并集</strong>。请先
              <router-link to="/orgs">管理组织</router-link>
              或加入组织。
            </p>
            <label
              class="muted"
              style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px"
            >
              <input v-model="organizerSelfSelected" type="checkbox" :disabled="!organizerInPool" />
              我也参与签到（与下方成员名单中勾选自己为同一状态）
            </label>
            <p v-if="!organizerInPool && selectedOrgIds.length" class="muted" style="font-size: 13px; margin: -8px 0 12px">
              加载成员后即可勾选；若你不在所选组织中，无法加入名单。
            </p>
            <p class="muted" style="font-size: 14px; margin-bottom: 8px">成员范围（组织多选）</p>
            <div
              v-if="!myOrgs.length"
              class="muted"
              style="font-size: 14px; padding: 12px; background: var(--ios-bg); border-radius: var(--radius-md)"
            >
              你还没有加入任何组织，无法使用名单制。
              <router-link to="/orgs">去我的组织</router-link>
            </div>
            <div v-else class="grouped-list" style="margin-bottom: 16px">
              <label
                v-for="o in myOrgs"
                :key="o.id"
                class="list-cell"
                style="margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer"
              >
                <span class="list-cell__title" style="margin: 0">{{ o.name }}</span>
                <input
                  type="checkbox"
                  :checked="selectedOrgIds.includes(o.id)"
                  @change="setOrgSelected(o.id, $event.target.checked)"
                />
              </label>
            </div>
            <div v-if="rosterLoadErr" class="banner-error" style="margin-bottom: 12px">{{ rosterLoadErr }}</div>
            <div
              style="
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 8px 12px;
                margin-bottom: 8px;
              "
            >
              <p class="muted" style="font-size: 14px; margin: 0">
                可选签到成员（{{ rosterPool.length }}）· 已勾选 {{ rosterSelectedIds.length }} 人
              </p>
              <button
                v-if="rosterPool.length"
                type="button"
                class="btn btn-secondary"
                style="width: auto; min-height: 40px; padding: 8px 14px"
                @click="toggleSelectAllRoster"
              >
                {{ rosterAllSelected ? '全不选' : '全选' }}
              </button>
            </div>
            <div
              v-if="selectedOrgIds.length && !rosterPool.length && !rosterLoadErr"
              class="muted"
              style="font-size: 14px; padding: 12px; background: var(--ios-bg); border-radius: var(--radius-md)"
            >
              所选组织暂无成员；请先加入对应组织或调整范围。
            </div>
            <div v-else-if="rosterPool.length" class="grouped-list" style="margin-bottom: 0">
              <label
                v-for="u in rosterPool"
                :key="u.id"
                class="list-cell"
                style="margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer"
              >
                <span class="list-cell__title" style="margin: 0">
                  {{ u.display_name }}（{{ u.username }}）<template v-if="auth.user?.id === u.id">· 我</template>
                </span>
                <input
                  type="checkbox"
                  :checked="rosterSelectedIds.includes(u.id)"
                  @change="setRosterUserSelected(u.id, $event.target.checked)"
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
