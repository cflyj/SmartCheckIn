<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import AppNavBar from '../../components/AppNavBar.vue'
import { formatLocal } from '../../utils/date.js'
import { haversineMeters } from '../../utils/geo.js'
import { Html5Qrcode } from 'html5-qrcode'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id)

const session = ref(null)
const loading = ref(true)
const error = ref('')
const tab = ref('geo')
const geoMsg = ref('')
const geoOk = ref(false)
const qrMsg = ref('')
const qrOk = ref(false)
const qrInput = ref('')
const geoWorking = ref(false)
const qrWorking = ref(false)
const showScanner = ref(false)
const locating = ref(false)
const joinRequired = ref(false)
const joinCode = ref('')
const joinErr = ref('')
const joinLoading = ref(false)
const readerId = 'qr-reader-inline'
let html5Qr = null
let geoWatchId = null

const hasGeo = computed(() => session.value && ['GEO', 'BOTH'].includes(session.value.checkin_modes))
const hasQr = computed(() => session.value && ['QR', 'BOTH'].includes(session.value.checkin_modes))

const clientPos = ref(null)
const distM = computed(() => {
  const s = session.value
  const g = s?.geo_config
  if (!g?.center || !clientPos.value) return null
  return Math.round(
    haversineMeters(clientPos.value.lat, clientPos.value.lng, g.center.lat, g.center.lng)
  )
})

const geoMinAccuracy = computed(() => {
  const m = session.value?.geo_config?.min_accuracy_m
  return m != null && m > 0 ? m : null
})

async function load() {
  loading.value = true
  error.value = ''
  joinErr.value = ''
  try {
    const data = await api(`/sessions/${id.value}`)
    joinRequired.value = !!data.session.join_required
    session.value = data.session
    if (joinRequired.value) {
      loading.value = false
      return
    }
    if (hasGeo.value && hasQr.value) tab.value = 'geo'
    else if (hasQr.value) tab.value = 'qr'
    else tab.value = 'geo'

    const pre = route.query.token
    if (typeof pre === 'string' && pre && hasQr.value) {
      qrInput.value = pre
      tab.value = 'qr'
    }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function submitJoin() {
  joinErr.value = ''
  joinLoading.value = true
  try {
    await api(`/sessions/${id.value}/join`, {
      method: 'POST',
      body: { code: joinCode.value.trim() },
    })
    joinCode.value = ''
    await load()
  } catch (e) {
    joinErr.value = e instanceof ApiError ? e.message : '验证失败'
  } finally {
    joinLoading.value = false
  }
}

onMounted(load)
watch(id, load)

watch(
  () => [session.value?.id, joinRequired.value],
  () => {
    const s = session.value
    if (s?.id && !joinRequired.value && ['GEO', 'BOTH'].includes(s.checkin_modes)) locate()
  }
)

function considerFix(best, pos) {
  const acc = pos.coords.accuracy
  const cur = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: acc,
  }
  if (!best || acc < best.accuracy) return cur
  return best
}

function locate() {
  geoMsg.value = ''
  geoOk.value = false
  clientPos.value = null
  if (geoWatchId != null) {
    navigator.geolocation.clearWatch(geoWatchId)
    geoWatchId = null
  }
  if (!navigator.geolocation) {
    geoMsg.value = '当前浏览器不支持定位'
    return
  }

  locating.value = true
  let best = null

  const done = () => {
    if (geoWatchId != null) {
      navigator.geolocation.clearWatch(geoWatchId)
      geoWatchId = null
    }
    locating.value = false
    if (best) {
      clientPos.value = best
      geoMsg.value = ''
    } else {
      geoMsg.value = '无法获取位置，请打开系统定位权限，并尽量到窗边或室外重试。'
    }
  }

  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      best = considerFix(best, pos)
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0 }
  )

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      best = considerFix(best, pos)
    },
    () => {},
    { enableHighAccuracy: true, timeout: 22000, maximumAge: 0 }
  )

  setTimeout(done, 12000)
}

async function submitGeo() {
  if (!clientPos.value) {
    geoMsg.value = '请先获取定位'
    return
  }
  geoWorking.value = true
  geoMsg.value = ''
  geoOk.value = false
  try {
    const data = await api(`/sessions/${id.value}/checkin/geo`, {
      method: 'POST',
      body: {
        lat: clientPos.value.lat,
        lng: clientPos.value.lng,
        accuracy_m: clientPos.value.accuracy,
        client_time: new Date().toISOString(),
      },
    })
    if (data.already_checked_in) {
      geoMsg.value = '你已签到成功'
      geoOk.value = true
    } else {
      geoMsg.value = '签到成功'
      geoOk.value = true
    }
  } catch (e) {
    geoMsg.value = e instanceof ApiError ? e.message : '签到失败'
    geoOk.value = false
  } finally {
    geoWorking.value = false
  }
}

async function submitQr() {
  const t = qrInput.value.trim()
  if (!t) {
    qrMsg.value = '请输入或扫描令牌'
    return
  }
  qrWorking.value = true
  qrMsg.value = ''
  qrOk.value = false
  try {
    const data = await api(`/sessions/${id.value}/checkin/qr`, {
      method: 'POST',
      body: { token: t },
    })
    if (data.already_checked_in) {
      qrMsg.value = '你已签到成功'
      qrOk.value = true
    } else {
      qrMsg.value = '签到成功'
      qrOk.value = true
    }
  } catch (e) {
    qrMsg.value = e instanceof ApiError ? e.message : '签到失败'
    qrOk.value = false
  } finally {
    qrWorking.value = false
  }
}

async function openScanner() {
  showScanner.value = true
  await new Promise((r) => setTimeout(r, 100))
  try {
    html5Qr = new Html5Qrcode(readerId)
    await html5Qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (text) => {
        qrInput.value = text
        closeScanner()
      },
      () => {}
    )
  } catch {
    showScanner.value = false
    qrMsg.value = '无法打开摄像头，可改用下方手动输入。'
  }
}

async function closeScanner() {
  if (html5Qr) {
    try {
      await html5Qr.stop()
      html5Qr.clear()
    } catch {
      /* ignore */
    }
    html5Qr = null
  }
  showScanner.value = false
}

onUnmounted(() => {
  closeScanner()
  if (geoWatchId != null) navigator.geolocation.clearWatch(geoWatchId)
})
</script>

<template>
  <div class="page">
    <AppNavBar :title="session?.title || '活动'" @back="router.push({ name: 'participant-sessions' })" />

    <div class="content">
      <div v-if="loading" class="spinner-wrap muted">加载中…</div>
      <div v-else-if="error" class="banner-error">{{ error }}</div>

      <template v-else-if="session">
        <div v-if="joinRequired" class="card card-pad" style="margin-bottom: 20px">
          <p class="list-cell__title" style="margin-bottom: 8px">{{ session.title }}</p>
          <p class="muted" style="margin-top: 0">本活动需要邀请码。请输入组织者提供的口令后加入，即可签到。</p>
          <div v-if="joinErr" class="banner-error" style="margin-top: 12px">{{ joinErr }}</div>
          <div class="field">
            <label>邀请码</label>
            <input v-model="joinCode" class="input" autocomplete="off" placeholder="向组织者索取" />
          </div>
          <button type="button" class="btn btn-primary" :disabled="joinLoading" @click="submitJoin">
            {{ joinLoading ? '验证中…' : '加入活动' }}
          </button>
        </div>

        <template v-else>
        <div class="card card-pad" style="margin-bottom: 20px">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px">
            <span class="muted" style="margin: 0">{{ formatLocal(session.starts_at) }} — {{ formatLocal(session.ends_at) }}</span>
          </div>
          <p v-if="session.status === 'scheduled'" class="muted" style="margin-top: 12px; margin-bottom: 0">活动尚未开始，可稍后再来签到。</p>
          <p v-else-if="session.status === 'ended'" class="muted" style="margin-top: 12px; margin-bottom: 0">活动已结束。</p>
        </div>

        <div v-if="hasGeo && hasQr" class="tabs">
          <button type="button" :class="['tab', tab === 'geo' && 'tab--active']" @click="tab = 'geo'">地理位置</button>
          <button type="button" :class="['tab', tab === 'qr' && 'tab--active']" @click="tab = 'qr'">二维码</button>
        </div>

        <div v-show="tab === 'geo' && hasGeo" class="card card-pad">
          <p class="muted" style="margin-top: 0">
            请在活动现场开启定位。系统<strong>只按距离</strong>判断是否在圈内（不再卡「定位精度」数字，室内更友好）。若仍难成功，请组织者<strong>加大允许半径</strong>或改用二维码签到。
          </p>
          <button type="button" class="btn btn-secondary" style="margin-bottom: 12px" :disabled="locating" @click="locate">
            {{ locating ? '正在获取定位（约 10 秒）…' : '获取 / 刷新定位' }}
          </button>
          <div v-if="clientPos" class="muted" style="margin-bottom: 12px">
            当前精度约 {{ Math.round(clientPos.accuracy) }} 米
            <template v-if="geoMinAccuracy"> · 活动要求不劣于 {{ geoMinAccuracy }} 米</template>
            <template v-if="distM != null"> · 距签到点约 {{ distM }} 米</template>
          </div>
          <div v-if="geoMsg" :class="geoOk ? 'banner-success' : 'banner-error'" style="margin-bottom: 12px">{{ geoMsg }}</div>
          <button type="button" class="btn btn-primary" :disabled="geoWorking || session.status !== 'active'" @click="submitGeo">
            {{ geoWorking ? '提交中…' : '确认地理签到' }}
          </button>
        </div>

        <div v-show="tab === 'qr' && hasQr" class="card card-pad">
          <p class="muted" style="margin-top: 0">扫描组织者大屏上的动态二维码，或请对方朗读令牌后手动输入。</p>
          <div class="field">
            <label>令牌</label>
            <input v-model="qrInput" class="input" placeholder="粘贴或扫描" autocomplete="off" />
          </div>
          <button type="button" class="btn btn-secondary" style="margin-bottom: 12px" @click="openScanner">扫描二维码</button>
          <div v-if="qrMsg" :class="qrOk ? 'banner-success' : 'banner-error'" style="margin-bottom: 12px">{{ qrMsg }}</div>
          <button type="button" class="btn btn-primary" :disabled="qrWorking || session.status !== 'active'" @click="submitQr">
            {{ qrWorking ? '提交中…' : '确认扫码签到' }}
          </button>
        </div>

        <div v-if="!hasGeo && !hasQr" class="banner-error">该活动未开放签到方式。</div>
        </template>
      </template>
    </div>

    <Teleport to="body">
      <div
        v-if="showScanner"
        style="
          position: fixed;
          inset: 0;
          z-index: 100;
          background: #000;
          display: flex;
          flex-direction: column;
          padding: env(safe-area-inset-top) 16px env(safe-area-inset-bottom);
        "
      >
        <button
          type="button"
          class="btn btn-secondary"
          style="margin-bottom: 12px; flex-shrink: 0"
          @click="closeScanner"
        >
          关闭相机
        </button>
        <div :id="readerId" style="flex: 1; min-height: 0" />
      </div>
    </Teleport>
  </div>
</template>
