<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import { useAuthStore } from '../../stores/auth.js'
import AppPageShell from '../../components/AppPageShell.vue'
import { isoToLocalInput, localInputToIso } from '../../utils/date.js'
import {
  BUILTIN_LOCATION_PRESETS,
  addCustomPreset,
  loadCustomPresets,
  removeCustomPreset,
} from '../../utils/locationPresets.js'

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

/** 地理围栏预设：内置三项 + 当前用户保存在本地的自定义项 */
const builtinPresets = BUILTIN_LOCATION_PRESETS
const customPresets = ref([])
const presetSelectedId = ref('')
const newPresetLabel = ref('')
const presetSaveErr = ref('')

/** 围栏中心来源反馈：让用户明确「当前数字对应哪一种选择」 */
const geoFenceHint = ref(null)
/** 程序写入经纬度时避免误标为「手动编辑」 */
const geoSilentApply = ref(false)

function refreshGeoPresets() {
  const uid = auth.user?.id
  customPresets.value = uid ? loadCustomPresets(uid) : []
}

watch(presetSelectedId, async (id) => {
  if (!id) return
  const all = [...builtinPresets, ...customPresets.value]
  const p = all.find((x) => x.id === id)
  if (p) {
    geoSilentApply.value = true
    lat.value = p.lat
    lng.value = p.lng
    geoFenceHint.value = { kind: 'preset', name: p.label }
    await nextTick()
    await nextTick()
    geoSilentApply.value = false
  }
  presetSelectedId.value = ''
})

function onGeoLatLngEdited() {
  if (geoSilentApply.value) return
  geoFenceHint.value = { kind: 'manual' }
}

function saveCurrentLocationAsPreset() {
  presetSaveErr.value = ''
  const uid = auth.user?.id
  if (!uid) {
    presetSaveErr.value = '请先登录后再保存预设'
    return
  }
  const label = newPresetLabel.value.trim()
  if (label.length < 1) {
    presetSaveErr.value = '请填写位置名称'
    return
  }
  if (label.length > 60) {
    presetSaveErr.value = '名称请控制在 60 字以内'
    return
  }
  const la = Number(lat.value)
  const lo = Number(lng.value)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    presetSaveErr.value = '请先填写合法的纬度、经度后再保存预设'
    return
  }
  try {
    customPresets.value = addCustomPreset(uid, {
      label,
      lat: la,
      lng: lo,
    })
    newPresetLabel.value = ''
  } catch {
    presetSaveErr.value = '无法保存预设，请稍后再试'
  }
}

function deleteCustomPreset(presetId) {
  const uid = auth.user?.id
  if (!uid) return
  customPresets.value = removeCustomPreset(uid, presetId)
}

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
  refreshGeoPresets()
  await loadMyOrgs()
  if (!isEdit.value) {
    inviteCode.value = ''
    selectedOrgIds.value = []
    rosterPool.value = []
    rosterSelectedIds.value = []
    rosterLoadErr.value = ''
    needsScopeMigration.value = false
    geoFenceHint.value = null
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

    geoSilentApply.value = true
    if (s.geo_config?.center) {
      lat.value = s.geo_config.center.lat
      lng.value = s.geo_config.center.lng
      radiusM.value = s.geo_config.radius_m ?? 250
      geoFenceHint.value = { kind: 'saved' }
    } else {
      geoFenceHint.value = null
    }
    await nextTick()
    await nextTick()
    geoSilentApply.value = false
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

watch(
  () => checkinModes.value,
  (m) => {
    if (m !== 'GEO' && m !== 'BOTH' && m !== 'GEO_FACE' && m !== 'GEO_QR_FACE') geoFenceHint.value = null
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
    async (pos) => {
      geoSilentApply.value = true
      lat.value = Math.round(pos.coords.latitude * 1e6) / 1e6
      lng.value = Math.round(pos.coords.longitude * 1e6) / 1e6
      error.value = ''
      geoFenceHint.value = { kind: 'gps' }
      await nextTick()
      await nextTick()
      geoSilentApply.value = false
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
  if (modes === 'GEO' || modes === 'BOTH' || modes === 'GEO_FACE' || modes === 'GEO_QR_FACE') {
    body.geo_config = {
      center: { lat: Number(lat.value), lng: Number(lng.value) },
      radius_m: Number(radiusM.value),
    }
  }
  if (modes === 'QR' || modes === 'BOTH' || modes === 'GEO_QR_FACE') {
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
  const startsIso = localInputToIso(startsAt.value)
  const endsIso = localInputToIso(endsAt.value)
  if (!startsIso || !endsIso) {
    error.value = '请填写有效的开始与结束时间（若已填写仍失败，请重新选择日期时间）'
    return
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
  <AppPageShell :nav-title="isEdit ? '编辑活动' : '新建活动'" @back="router.push({ name: 'organizer' })">

    <div class="content stack stack--md stack--airy">
      <div v-if="loading" class="spinner-wrap muted" role="status" aria-live="polite">
        <span class="loading-spinner" aria-hidden="true" />
        <span>加载中…</span>
      </div>
      <template v-else>
        <div v-if="error" class="banner-error">{{ error }}</div>

        <div class="card card-pad stack">
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

          <div v-if="needsScopeMigration" class="banner-error banner--tight">
            该活动曾为「任何人可签到」，已不再提供此方式（避免无关用户列表里出现本活动）。请改为「仅指定成员」或「邀请码」后保存。
          </div>
          <p class="form-section-title">谁可以签到</p>
          <div class="field">
            <select v-model="participantScope" class="select input">
              <option value="roster">仅指定成员（从已选组织成员中勾选）</option>
              <option value="invite">邀请码（分享链接 + 口令后加入）</option>
            </select>
          </div>
          <p v-if="participantScope === 'invite'" class="muted text-body-xs u-mt-0">
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
            <p class="muted text-body-xs u-mt-0">
              勾选<strong>一个或多个</strong>你所在的组织，可选签到成员为所选组织的<strong>成员并集</strong>。请先
              <router-link to="/orgs">管理组织</router-link>
              或加入组织。
            </p>
            <label class="checkbox-label-row">
              <input v-model="organizerSelfSelected" type="checkbox" :disabled="!organizerInPool" />
              我也参与签到（与下方成员名单中勾选自己为同一状态）
            </label>
            <p v-if="!organizerInPool && selectedOrgIds.length" class="muted text-note u-mt-neg2 u-mb-3">
              加载成员后即可勾选；若你不在所选组织中，无法加入名单。
            </p>
            <p class="muted text-body-xs u-mb-2">成员范围（组织多选）</p>
            <div v-if="!myOrgs.length" class="inset-callout">
              你还没有加入任何组织，无法使用名单制。
              <router-link to="/orgs">去我的组织</router-link>
            </div>
            <div v-else class="grouped-list u-mb-4">
              <label v-for="o in myOrgs" :key="o.id" class="list-cell list-cell--checkbox-row">
                <span class="list-cell__title list-cell__title--flat">{{ o.name }}</span>
                <input
                  type="checkbox"
                  :checked="selectedOrgIds.includes(o.id)"
                  @change="setOrgSelected(o.id, $event.target.checked)"
                />
              </label>
            </div>
            <div v-if="rosterLoadErr" class="banner-error banner--tight">{{ rosterLoadErr }}</div>
            <div class="flex-row-wrap u-mb-2">
              <p class="muted text-body-xs u-mb-0">
                可选签到成员（{{ rosterPool.length }}）· 已勾选 {{ rosterSelectedIds.length }} 人
              </p>
              <button
                v-if="rosterPool.length"
                type="button"
                class="btn btn-secondary btn--inline"
                @click="toggleSelectAllRoster"
              >
                {{ rosterAllSelected ? '全不选' : '全选' }}
              </button>
            </div>
            <div
              v-if="selectedOrgIds.length && !rosterPool.length && !rosterLoadErr"
              class="inset-callout"
            >
              所选组织暂无成员；请先加入对应组织或调整范围。
            </div>
            <div v-else-if="rosterPool.length" class="grouped-list u-mb-0">
              <label v-for="u in rosterPool" :key="u.id" class="list-cell list-cell--checkbox-row">
                <span class="list-cell__title list-cell__title--flat">
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

          <div class="field field--top-sep">
            <label>签到方式</label>
            <select v-model="checkinModes" class="select input">
              <option value="GEO">仅地理位置</option>
              <option value="QR">仅二维码</option>
              <option value="BOTH">地理 + 二维码</option>
              <option value="FACE">仅人脸识别</option>
              <option value="GEO_FACE">地理 + 人脸识别</option>
              <option value="GEO_QR_FACE">地理 + 二维码 + 人脸识别</option>
            </select>
            <p
              v-if="checkinModes === 'FACE' || checkinModes === 'GEO_FACE' || checkinModes === 'GEO_QR_FACE'"
              class="muted text-body-xs u-mt-2 u-mb-0"
            >
              <template v-if="checkinModes === 'FACE'">
                参与者须在首页完成「人脸样本录入」后再签到；系统使用数学特征比对（不存照片原图）。
              </template>
              <template v-else-if="checkinModes === 'GEO_FACE'">
                须同时满足「在地理围栏内」与「人脸特征与样本匹配」；参与者需先完成人脸录入，并在活动页<strong>一次提交</strong>定位与人脸采样。
              </template>
              <template v-else>
                参与者可任选：<strong>地理</strong>、<strong>二维码</strong>或<strong>人脸</strong>其中一种完成签到（仍须事先完成人脸录入方可使用人脸方式）；每种方式至多成功一次。
              </template>
            </p>
          </div>

          <template v-if="checkinModes === 'GEO' || checkinModes === 'BOTH' || checkinModes === 'GEO_FACE' || checkinModes === 'GEO_QR_FACE'">
            <p class="muted text-body-sm u-mb-0">地理围栏（仅判断到中心点距离）</p>
            <div class="field u-mb-3">
              <label>预设位置</label>
              <p class="muted text-note u-mt-0">
                从列表选择可快速填入中心点经纬度。默认三项为校内常见地点的示意坐标，实际发布前请点下方「使用我当前的位置」或手动改为真实签到点。
              </p>
              <select v-model="presetSelectedId" class="select input">
                <option value="">选择预设填入坐标…</option>
                <optgroup label="默认">
                  <option v-for="p in builtinPresets" :key="p.id" :value="p.id">{{ p.label }}</option>
                </optgroup>
                <optgroup v-if="customPresets.length" label="我保存的">
                  <option v-for="p in customPresets" :key="p.id" :value="p.id">{{ p.label }}</option>
                </optgroup>
              </select>
            </div>
            <div
              v-if="geoFenceHint"
              class="geo-fence-feedback u-mb-3"
              :class="[
                geoFenceHint.kind === 'preset' || geoFenceHint.kind === 'gps'
                  ? 'geo-fence-feedback--accent'
                  : 'geo-fence-feedback--neutral',
              ]"
              role="status"
              aria-live="polite"
            >
              <template v-if="geoFenceHint.kind === 'preset'">
                <p class="geo-fence-feedback__badge">已从预设填入</p>
                <p class="geo-fence-feedback__main">「{{ geoFenceHint.name }}」</p>
                <p class="geo-fence-feedback__note">
                  下方纬度、经度已更新为该预设的中心；可微调，或使用「当前位置」覆盖。
                </p>
              </template>
              <template v-else-if="geoFenceHint.kind === 'gps'">
                <p class="geo-fence-feedback__badge">围栏中心 · 当前定位</p>
                <p class="geo-fence-feedback__main">已用你的 GPS 经纬度更新中心点。</p>
                <p class="geo-fence-feedback__note">
                  若数字与预期不符，请检查浏览器定位权限；也可在下方手动修改。
                </p>
              </template>
              <template v-else-if="geoFenceHint.kind === 'manual'">
                <p class="geo-fence-feedback__badge">围栏中心 · 手动坐标</p>
                <p class="geo-fence-feedback__main">正在使用你在下方输入的纬度、经度。</p>
                <p class="geo-fence-feedback__note">若仍要用预设，请在上方下拉中重新选择一项。</p>
              </template>
              <template v-else-if="geoFenceHint.kind === 'saved'">
                <p class="geo-fence-feedback__badge">围栏中心 · 已保存</p>
                <p class="geo-fence-feedback__main">以下为该活动当前保存的中心点与半径。</p>
                <p class="geo-fence-feedback__note">修改坐标后保存即可更新。</p>
              </template>
            </div>
            <div class="field u-mb-3">
              <label>保存为常用预设</label>
              <p class="muted text-note u-mt-0">
                将当前纬度、经度与名称存到本设备，便于下次直接在「我保存的」中选择（仅登录用户，数据存于浏览器本地）。
              </p>
              <input
                v-model="newPresetLabel"
                class="input"
                type="text"
                maxlength="60"
                placeholder="名称，例如：报告厅 A"
                autocomplete="off"
              />
              <button type="button" class="btn btn-secondary u-mt-2" @click="saveCurrentLocationAsPreset">
                保存当前坐标为新预设
              </button>
              <p v-if="presetSaveErr" class="text-body-xs banner-error banner--tight u-mt-2 u-mb-0">{{ presetSaveErr }}</p>
              <div v-if="customPresets.length" class="grouped-list u-mt-2">
                <div
                  v-for="(p, idx) in customPresets"
                  :key="p.id"
                  class="list-cell list-cell--static list-cell--member-row"
                  :class="{ 'list-cell--borderless': idx === customPresets.length - 1 }"
                >
                  <span class="list-cell__title">{{ p.label }}</span>
                  <button type="button" class="btn btn-secondary btn--inline" @click="deleteCustomPreset(p.id)">
                    删除
                  </button>
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-secondary u-mb-3" @click="useMyLocation">
              使用我当前的位置作为中心
            </button>
            <div class="field">
              <label>纬度</label>
              <input
                v-model.number="lat"
                class="input"
                type="number"
                step="any"
                @input="onGeoLatLngEdited"
              />
            </div>
            <div class="field">
              <label>经度</label>
              <input
                v-model.number="lng"
                class="input"
                type="number"
                step="any"
                @input="onGeoLatLngEdited"
              />
            </div>
            <div class="field">
              <label>允许半径（米）</label>
              <input v-model.number="radiusM" class="input" type="number" min="10" />
              <p class="muted text-note u-mt-2">室内建议 200～500 米或更大，减少边缘误拦。</p>
            </div>
          </template>

          <template v-if="checkinModes === 'QR' || checkinModes === 'BOTH' || checkinModes === 'GEO_QR_FACE'">
            <div class="field">
              <label>二维码刷新间隔（秒）</label>
              <input v-model.number="qrTtl" class="input" type="number" min="15" max="300" />
            </div>
          </template>
        </div>

        <div class="btn-stack">
          <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>

          <button
            v-if="isEdit"
            type="button"
            class="btn btn-secondary"
            @click="router.push({ name: 'organizer-qr', params: { id: route.params.id } })"
          >
            大屏二维码
          </button>
          <button
            v-if="isEdit"
            type="button"
            class="btn btn-secondary"
            @click="router.push({ name: 'organizer-stats', params: { id: route.params.id } })"
          >
            统计数据
          </button>
          <button
            v-if="isEdit"
            type="button"
            class="btn btn-secondary"
            @click="router.push({ name: 'organizer-records', params: { id: route.params.id } })"
          >
            签到记录
          </button>
        </div>
      </template>
    </div>
  </AppPageShell>
</template>
