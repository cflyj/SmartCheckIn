<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import AppNavBar from '../../components/AppNavBar.vue'
import { formatLocal } from '../../utils/date.js'
import { haversineMeters } from '../../utils/geo.js'
import { extractCheckinTokenFromPayload } from '../../utils/qrPayload.js'
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
/** 定位等待倒计时（秒），0 表示未在倒计时 */
const locateCountdownSec = ref(0)
/** 定位过程中实时最优位置，用于预览距离 */
const locatingPreviewPos = ref(null)
const joinRequired = ref(false)
const joinCode = ref('')
const joinErr = ref('')
const joinLoading = ref(false)
const readerId = 'qr-reader-inline'
let html5Qr = null
let geoWatchId = null
let geoLocateTimer = null
let geoCountdownInterval = null

const GEO_LOCATE_DURATION_SEC = 20
const GEO_LOCATE_MAX_MS = GEO_LOCATE_DURATION_SEC * 1000

function clearGeoCountdown() {
  if (geoCountdownInterval != null) {
    clearInterval(geoCountdownInterval)
    geoCountdownInterval = null
  }
  locateCountdownSec.value = 0
}

/** 手机用 http://IP 访问时，浏览器会禁用定位与摄像头（非安全上下文）。localhost 例外。 */
function needsHttpsForSensitiveApis() {
  if (typeof window === 'undefined') return false
  const h = location.hostname
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return false
  return !window.isSecureContext
}

const insecureContextHint = computed(() =>
  needsHttpsForSensitiveApis()
    ? '当前为 HTTP 访问：手机浏览器通常会禁止定位与摄像头。生产环境请使用 HTTPS 域名。'
    : ''
)

function geoMessageFromError(err) {
  if (!err || typeof err.code !== 'number') return null
  if (err.code === 1) return '已拒绝定位权限。请在浏览器或系统设置中允许本站使用位置信息。'
  if (err.code === 2) return '暂时无法确定位置。请确认系统定位已开，并到窗边或室外重试。'
  if (err.code === 3) return '定位超时。请重试或到室外开阔处。'
  return null
}

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

const geoRadiusM = computed(() => {
  const r = session.value?.geo_config?.radius_m
  return typeof r === 'number' && r > 0 ? r : null
})

const locatingDistM = computed(() => {
  const g = session.value?.geo_config
  const p = locatingPreviewPos.value
  if (!g?.center || !p) return null
  return Math.round(haversineMeters(p.lat, p.lng, g.center.lat, g.center.lng))
})

/** 大数字标题：≥1000 米用公里，避免十几万米难以扫读 */
function geoHeadlineDist(dist) {
  const d = Math.round(dist)
  if (d < 1000) return { num: String(d), unit: '米' }
  const km = d / 1000
  if (d < 100000) {
    const decimals = km >= 10 ? 1 : 2
    const s = km.toFixed(decimals).replace(/\.?0+$/, '')
    return { num: s, unit: '公里' }
  }
  return { num: String(Math.round(km)), unit: '公里' }
}

/** 文案里「还差多少」（外层可再加「约」）：大距离用公里 */
function geoGapLabel(remainingM) {
  if (remainingM <= 0) return ''
  if (remainingM < 1000) return `${Math.round(remainingM)} 米`
  const km = remainingM / 1000
  if (remainingM < 100000) return `${km >= 10 ? km.toFixed(1) : km.toFixed(2)} 公里`
  return `${Math.round(km)} 公里`
}

/**
 * 条形图用对数比例：距离差几个数量级时，线性比例会让「允许半径」缩成一条线。
 * 仍保持：圈内则蓝点在绿区边界左侧或重合，圈外则蓝点在右侧。
 */
function buildGeoFeel(dist, radius) {
  if (dist == null || radius == null) return null
  const inside = dist <= radius
  const remaining = Math.max(0, dist - radius)
  const maxViz = Math.max(dist, radius * 1.35, 50)
  const denom = Math.max(Math.log1p(maxViz), 1e-9)
  const userPct = Math.min(100, Math.max(0, (Math.log1p(Math.max(0, dist)) / denom) * 100))
  const fencePct = Math.min(100, Math.max(0, (Math.log1p(radius) / denom) * 100))
  const head = geoHeadlineDist(dist)
  const remainingLabel = inside ? '' : geoGapLabel(remaining)
  const vizNote =
    dist > Math.max(3000, radius * 15)
      ? '条的长度不是按比例尺画的（否则太远时看不清绿区），只看「蓝点在绿线哪一侧」；准确米数/公里数以上方大数字为准。'
      : ''
  return {
    inside,
    dist,
    radius,
    remaining,
    userPct,
    fencePct,
    distNum: head.num,
    distUnit: head.unit,
    remainingLabel,
    vizNote,
  }
}

const geoFeelPreview = computed(() => {
  if (!locating.value) return null
  return buildGeoFeel(locatingDistM.value, geoRadiusM.value)
})

const geoFeelFinal = computed(() => {
  if (locating.value || !clientPos.value) return null
  return buildGeoFeel(distM.value, geoRadiusM.value)
})

const countdownBarPct = computed(() => {
  if (!locating.value || locateCountdownSec.value <= 0) return 0
  return (locateCountdownSec.value / GEO_LOCATE_DURATION_SEC) * 100
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

/** 不在进入页面时自动 locate：iOS Safari 等对「非点击触发的定位」会报拒绝或不再弹窗，导致二次进入误显示已拒绝权限。 */
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
  locatingPreviewPos.value = null
  clearGeoCountdown()
  if (geoLocateTimer != null) {
    clearTimeout(geoLocateTimer)
    geoLocateTimer = null
  }
  if (geoWatchId != null) {
    navigator.geolocation.clearWatch(geoWatchId)
    geoWatchId = null
  }
  if (needsHttpsForSensitiveApis()) {
    geoMsg.value =
      '定位需要安全连接（HTTPS）。用手机通过 http://局域网 IP 打开时，浏览器会禁止定位。请配置 HTTPS，或在电脑本机 localhost 调试。'
    return
  }
  if (!navigator.geolocation) {
    geoMsg.value = '当前浏览器不支持定位'
    return
  }

  locating.value = true
  locateCountdownSec.value = GEO_LOCATE_DURATION_SEC
  geoCountdownInterval = window.setInterval(() => {
    if (locateCountdownSec.value > 0) locateCountdownSec.value -= 1
  }, 1000)

  let best = null
  let finished = false
  const geoOpts = { enableHighAccuracy: true, maximumAge: 0, timeout: GEO_LOCATE_MAX_MS + 2000 }

  const finish = () => {
    if (finished) return
    finished = true
    if (geoLocateTimer != null) {
      clearTimeout(geoLocateTimer)
      geoLocateTimer = null
    }
    if (geoWatchId != null) {
      navigator.geolocation.clearWatch(geoWatchId)
      geoWatchId = null
    }
    clearGeoCountdown()
    locatingPreviewPos.value = null
    locating.value = false
    if (best) {
      clientPos.value = best
      geoMsg.value = ''
    } else {
      geoMsg.value = '无法获取位置，请打开系统定位权限，并尽量到窗边或室外重试。'
    }
  }

  const onGeoError = (err) => {
    const specific = geoMessageFromError(err)
    if (err && err.code === 1 && specific) {
      if (finished) return
      finished = true
      if (geoLocateTimer != null) {
        clearTimeout(geoLocateTimer)
        geoLocateTimer = null
      }
      if (geoWatchId != null) {
        navigator.geolocation.clearWatch(geoWatchId)
        geoWatchId = null
      }
      clearGeoCountdown()
      locatingPreviewPos.value = null
      locating.value = false
      geoMsg.value = specific
      return
    }
    if (specific && !best) geoMsg.value = specific
  }

  const onPosition = (pos) => {
    best = considerFix(best, pos)
    if (best) locatingPreviewPos.value = { lat: best.lat, lng: best.lng, accuracy: best.accuracy }
  }

  geoWatchId = navigator.geolocation.watchPosition(onPosition, onGeoError, geoOpts)

  geoLocateTimer = window.setTimeout(finish, GEO_LOCATE_MAX_MS)
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
  const t = extractCheckinTokenFromPayload(qrInput.value).trim()
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
  if (needsHttpsForSensitiveApis()) {
    qrMsg.value =
      '扫码需要摄像头，且必须在安全连接（HTTPS）下使用。用手机通过 http://局域网 IP 打开时浏览器会禁止摄像头。请配置 HTTPS，或暂时用手动输入令牌。'
    return
  }
  const hadOpen = !!(html5Qr || showScanner.value)
  if (hadOpen) await closeScanner()
  showScanner.value = true
  await nextTick()
  // iOS：摄像头须在用户点击后的极短调用链内打开；长 delay / 多余 await 易导致黑屏或无画面
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  const scanCfg = {
    fps: 10,
    qrbox: (vw, vh) => {
      const m = Math.min(vw || 300, vh || 300)
      const s = Math.max(160, Math.min(280, Math.floor(m * 0.72)))
      return { width: s, height: s }
    },
  }
  const onDecode = (text) => {
    qrInput.value = extractCheckinTokenFromPayload(text)
    closeScanner()
  }
  const onFrameFailure = () => {}

  const tryConstraintsList = [
    { facingMode: 'environment' },
    { facingMode: 'user' },
  ]

  let lastErr = null
  try {
    for (const constraints of tryConstraintsList) {
      try {
        html5Qr = new Html5Qrcode(readerId)
        await html5Qr.start(constraints, scanCfg, onDecode, onFrameFailure)
        return
      } catch (e) {
        lastErr = e
        try {
          await html5Qr?.stop()
        } catch {
          /* ignore */
        }
        try {
          html5Qr?.clear()
        } catch {
          /* ignore */
        }
        html5Qr = null
      }
    }

    const devices = await Html5Qrcode.getCameras()
    if (devices?.length) {
      const preferred =
        devices.find((d) => /back|rear|environment|后置|后摄|wide/i.test(d.label || '')) || devices[0]
      html5Qr = new Html5Qrcode(readerId)
      await html5Qr.start(
        { deviceId: { exact: preferred.id } },
        scanCfg,
        onDecode,
        onFrameFailure
      )
      return
    }

    throw lastErr || new Error('NO_CAMERA')
  } catch (e) {
    try {
      if (html5Qr) {
        await html5Qr.stop()
        html5Qr.clear()
      }
    } catch {
      /* ignore */
    }
    html5Qr = null
    showScanner.value = false
    const detail = e && e.message ? String(e.message) : ''
    qrMsg.value =
      '无法打开摄像头，可改用下方手动输入。请确认已允许摄像头权限，并关闭其它占用相机的应用。' +
      (detail && !detail.includes('NO_CAMERA') ? `（${detail}）` : '')
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
  if (geoLocateTimer != null) {
    clearTimeout(geoLocateTimer)
    geoLocateTimer = null
  }
  clearGeoCountdown()
  closeScanner()
  if (geoWatchId != null) navigator.geolocation.clearWatch(geoWatchId)
})
</script>

<template>
  <div class="page">
    <AppNavBar :title="session?.title || '活动'" @back="router.push({ name: 'participant-sessions' })" />

    <div class="content stack stack--md stack--airy">
      <div v-if="loading" class="spinner-wrap muted" role="status" aria-live="polite">
        <span class="loading-spinner" aria-hidden="true" />
        <span>加载中…</span>
      </div>
      <div v-else-if="error" class="banner-error">{{ error }}</div>

      <template v-else-if="session">
        <div v-if="joinRequired" class="card card-pad card--spaced-lg stack">
          <p class="list-cell__title u-mb-2">{{ session.title }}</p>
          <p class="muted u-mt-0">本活动需要邀请码。请输入组织者提供的口令后加入，即可签到。</p>
          <div v-if="joinErr" class="banner-error banner--tight u-mt-0">{{ joinErr }}</div>
          <div class="field">
            <label>邀请码</label>
            <input v-model="joinCode" class="input" autocomplete="off" placeholder="向组织者索取" />
          </div>
          <button type="button" class="btn btn-primary" :disabled="joinLoading" @click="submitJoin">
            {{ joinLoading ? '验证中…' : '加入活动' }}
          </button>
        </div>

        <template v-else>
        <div class="card card-pad card--spaced-lg stack">
          <div class="flex-row-wrap u-mb-0">
            <span class="muted u-mb-0">{{ formatLocal(session.starts_at) }} — {{ formatLocal(session.ends_at) }}</span>
          </div>
          <p v-if="session.status === 'scheduled'" class="muted u-mt-3 u-mb-0">活动尚未开始，可稍后再来签到。</p>
          <p v-else-if="session.status === 'ended'" class="muted u-mt-3 u-mb-0">活动已结束。</p>
        </div>

        <div v-if="hasGeo && hasQr" class="tabs">
          <button type="button" :class="['tab', tab === 'geo' && 'tab--active']" @click="tab = 'geo'">地理位置</button>
          <button type="button" :class="['tab', tab === 'qr' && 'tab--active']" @click="tab = 'qr'">二维码</button>
        </div>

        <div v-show="tab === 'geo' && hasGeo" class="card card-pad stack">
          <p class="form-section-title">地理位置签到</p>
          <p class="muted u-mt-0">
            请在活动现场开启定位。系统<strong>只按距离</strong>判断是否在圈内（不再卡「定位精度」数字，室内更友好）。若仍难成功，请组织者<strong>加大允许半径</strong>或改用二维码签到。
            <strong>请先点击「获取 / 刷新定位」</strong>以触发授权；部分手机（尤其 Safari）不会在进入页面时自动请求位置，自动请求还可能被误判为「已拒绝」。
          </p>
          <p v-if="insecureContextHint" class="banner-error banner--tight u-mb-0">{{ insecureContextHint }}</p>
          <button type="button" class="btn btn-secondary u-mb-3" :disabled="locating" @click="locate">
            <template v-if="!locating">获取 / 刷新定位</template>
            <template v-else-if="locateCountdownSec > 0">正在定位，剩余 {{ locateCountdownSec }} 秒</template>
            <template v-else>正在完成定位…</template>
          </button>
          <div v-if="locating" class="geo-locate-wait u-mb-3" role="status" aria-live="polite">
            <div class="geo-countdown-track" aria-hidden="true">
              <div class="geo-countdown-fill" :style="{ width: countdownBarPct + '%' }" />
            </div>
            <p class="geo-countdown-caption muted u-mt-2 u-mb-0">
              <template v-if="locateCountdownSec > 0">进度条随剩余时间缩短，结束后采用本轮最优定位结果。</template>
              <template v-else>正在汇总定位结果，请稍候。</template>
            </p>
            <div v-if="geoFeelPreview" class="geo-feel geo-feel--preview u-mt-3">
              <p class="geo-feel__title u-mb-2">实时参考（仍在优化）</p>
              <div class="geo-feel__headline">
                <span class="geo-feel__distance">{{ geoFeelPreview.distNum }}</span>
                <span class="geo-feel__unit">{{ geoFeelPreview.distUnit }}</span>
                <span class="geo-feel__hint">距签到点</span>
              </div>
              <div class="geo-feel__legend">
                <p class="geo-feel__legend-title">这张图怎么读</p>
                <ul class="geo-feel__legend-list">
                  <li>
                    <span class="geo-feel__legend-dot geo-feel__legend-dot--axis" aria-hidden="true" />
                    <span><strong>不是地图</strong>：从左到右只表示离「签到点」由近到远。</span>
                  </li>
                  <li>
                    <span class="geo-feel__legend-dot geo-feel__legend-dot--zone" aria-hidden="true" />
                    <span><strong>绿色区域 + 绿竖线</strong>以内 = 活动允许签到的最远距离（半径 {{ geoFeelPreview.radius }} 米）。</span>
                  </li>
                  <li>
                    <span class="geo-feel__legend-dot geo-feel__legend-dot--user" aria-hidden="true" />
                    <span><strong>蓝点</strong>：根据当前定位，你落在这条线上的位置。</span>
                  </li>
                </ul>
              </div>
              <div class="geo-feel__track-wrap">
                <p class="geo-feel__track-caption muted u-mb-2 u-mt-0">下方是一条「远近示意」</p>
                <div class="geo-feel__track">
                  <div class="geo-feel__zone" :style="{ width: geoFeelPreview.fencePct + '%' }" />
                  <div class="geo-feel__fence" :style="{ left: geoFeelPreview.fencePct + '%' }" />
                  <div class="geo-feel__user" :style="{ left: geoFeelPreview.userPct + '%' }" />
                </div>
                <div class="geo-feel__axis muted">
                  <span>近 · 签到点</span>
                  <span>最远可签 {{ geoFeelPreview.radius }} 米</span>
                </div>
                <p v-if="geoFeelPreview.vizNote" class="geo-feel__viz-note muted u-mb-0">{{ geoFeelPreview.vizNote }}</p>
              </div>
              <p class="geo-feel__status muted u-mb-0">
                <template v-if="geoFeelPreview.inside">当前测算在允许范围内。</template>
                <template v-else>当前测算在范围外，约还需靠近 {{ geoFeelPreview.remainingLabel }}。</template>
              </p>
            </div>
          </div>
          <div v-if="geoFeelFinal" class="geo-feel geo-feel--final u-mb-3" :class="geoFeelFinal.inside ? 'geo-feel--inside' : 'geo-feel--outside'">
            <div class="geo-feel__headline">
              <span class="geo-feel__distance">{{ geoFeelFinal.distNum }}</span>
              <span class="geo-feel__unit">{{ geoFeelFinal.distUnit }}</span>
              <span class="geo-feel__hint">距签到点</span>
            </div>
            <div class="geo-feel__legend">
              <p class="geo-feel__legend-title">这张图怎么读</p>
              <ul class="geo-feel__legend-list">
                <li>
                  <span class="geo-feel__legend-dot geo-feel__legend-dot--axis" aria-hidden="true" />
                  <span><strong>不是地图</strong>：从左到右只表示离「签到点」由近到远。</span>
                </li>
                <li>
                  <span class="geo-feel__legend-dot geo-feel__legend-dot--zone" aria-hidden="true" />
                  <span><strong>绿色区域 + 绿竖线</strong>以内 = 活动允许签到的最远距离（半径 {{ geoFeelFinal.radius }} 米）。</span>
                </li>
                <li>
                  <span class="geo-feel__legend-dot geo-feel__legend-dot--user" aria-hidden="true" />
                  <span><strong>蓝点</strong>：根据本次定位，你落在这条线上的位置。</span>
                </li>
              </ul>
            </div>
            <div class="geo-feel__track-wrap">
              <p class="geo-feel__track-caption muted u-mb-2 u-mt-0">下方是一条「远近示意」</p>
              <div class="geo-feel__track">
                <div class="geo-feel__zone" :style="{ width: geoFeelFinal.fencePct + '%' }" />
                <div class="geo-feel__fence" :style="{ left: geoFeelFinal.fencePct + '%' }" />
                <div class="geo-feel__user" :style="{ left: geoFeelFinal.userPct + '%' }" />
              </div>
              <div class="geo-feel__axis muted">
                <span>近 · 签到点</span>
                <span>最远可签 {{ geoFeelFinal.radius }} 米</span>
              </div>
              <p v-if="geoFeelFinal.vizNote" class="geo-feel__viz-note muted u-mb-0">{{ geoFeelFinal.vizNote }}</p>
            </div>
            <p class="geo-feel__verdict">
              <template v-if="geoFeelFinal.inside">你已在允许范围内，可以提交签到。</template>
              <template v-else>你仍在范围外，请再靠近签到点约 {{ geoFeelFinal.remainingLabel }} 后再试（活动允许最远 {{ geoFeelFinal.radius }} 米）。</template>
            </p>
            <p class="muted geo-feel__meta u-mb-0">
              当前精度约 {{ Math.round(clientPos.accuracy) }} 米
              <template v-if="geoMinAccuracy"> · 活动要求不劣于 {{ geoMinAccuracy }} 米</template>
            </p>
          </div>
          <div v-else-if="clientPos" class="muted u-mb-3">
            当前精度约 {{ Math.round(clientPos.accuracy) }} 米
            <template v-if="geoMinAccuracy"> · 活动要求不劣于 {{ geoMinAccuracy }} 米</template>
            <template v-if="distM != null"> · 距签到点约 {{ distM }} 米</template>
          </div>
          <div v-if="geoMsg" :class="[geoOk ? 'banner-success' : 'banner-error', 'banner--tight']">{{ geoMsg }}</div>
          <button type="button" class="btn btn-primary" :disabled="geoWorking || session.status !== 'active'" @click="submitGeo">
            {{ geoWorking ? '提交中…' : '确认地理签到' }}
          </button>
        </div>

        <div v-show="tab === 'qr' && hasQr" class="card card-pad stack">
          <p class="form-section-title">二维码签到</p>
          <p class="muted u-mt-0">扫描组织者大屏上的动态二维码，或请对方朗读令牌后手动输入。</p>
          <p v-if="insecureContextHint" class="banner-error banner--tight u-mb-0">{{ insecureContextHint }}</p>
          <div class="field">
            <label>令牌</label>
            <input
              v-model="qrInput"
              class="input"
              placeholder="扫描整段链接或仅粘贴令牌均可"
              autocomplete="off"
            />
          </div>
          <button type="button" class="btn btn-secondary u-mb-3" @click="openScanner">扫描二维码</button>
          <div v-if="qrMsg" :class="[qrOk ? 'banner-success' : 'banner-error', 'banner--tight']">{{ qrMsg }}</div>
          <button type="button" class="btn btn-primary" :disabled="qrWorking || session.status !== 'active'" @click="submitQr">
            {{ qrWorking ? '提交中…' : '确认扫码签到' }}
          </button>
        </div>

        <div v-if="!hasGeo && !hasQr" class="banner-error">该活动未开放签到方式。</div>
        </template>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="showScanner" class="qr-scanner-overlay">
        <button
          type="button"
          class="btn btn-secondary qr-scanner-overlay__close"
          aria-label="关闭相机"
          @click="closeScanner"
        >
          关闭相机
        </button>
        <div :id="readerId" class="qr-scanner-overlay__reader" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.geo-locate-wait {
  padding: 0.25rem 0;
}

.geo-countdown-track {
  height: 6px;
  border-radius: 100px;
  background: var(--fill-tertiary, rgba(60, 60, 67, 0.12));
  overflow: hidden;
}

.geo-countdown-fill {
  height: 100%;
  border-radius: 100px;
  background: linear-gradient(90deg, var(--accent, #007aff), #5ac8fa);
  transition: width 0.4s ease;
}

.geo-countdown-caption {
  font-size: 0.8125rem;
  line-height: 1.35;
}

.geo-feel {
  padding: 0.75rem 0 0;
}

.geo-feel--preview {
  padding: 0.75rem;
  margin-left: -0.25rem;
  margin-right: -0.25rem;
  border-radius: 12px;
  background: var(--fill-quaternary, rgba(60, 60, 67, 0.06));
  border: 1px solid var(--separator, rgba(60, 60, 67, 0.12));
}

.geo-feel__title {
  font-size: 0.8125rem;
  font-weight: 600;
  margin: 0;
  color: var(--label-secondary, rgba(60, 60, 67, 0.65));
}

.geo-feel__headline {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.35rem;
  margin: 0 0 0.75rem;
}

.geo-feel__distance {
  font-size: 2.125rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: var(--label, #000);
}

.geo-feel__unit {
  font-size: 1rem;
  font-weight: 600;
  color: var(--label-secondary, rgba(60, 60, 67, 0.65));
}

.geo-feel__hint {
  font-size: 0.9375rem;
  color: var(--label-secondary, rgba(60, 60, 67, 0.65));
  width: 100%;
  margin-top: -0.15rem;
}

.geo-feel__legend {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: var(--fill-quaternary, rgba(60, 60, 67, 0.06));
  border: 1px solid var(--separator, rgba(60, 60, 67, 0.1));
}

.geo-feel--preview .geo-feel__legend {
  background: rgba(0, 122, 255, 0.06);
  border-color: rgba(0, 122, 255, 0.12);
}

.geo-feel__legend-title {
  font-size: 0.8125rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: var(--label, #000);
}

.geo-feel__legend-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.geo-feel__legend-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--label-secondary, rgba(60, 60, 67, 0.82));
}

.geo-feel__legend-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  margin-top: 0.28rem;
  border-radius: 2px;
}

.geo-feel__legend-dot--axis {
  background: var(--fill-tertiary, rgba(60, 60, 67, 0.25));
}

.geo-feel__legend-dot--zone {
  background: rgba(52, 199, 89, 0.55);
}

.geo-feel__legend-dot--user {
  border-radius: 50%;
  background: var(--accent, #007aff);
}

.geo-feel__track-caption {
  font-size: 0.75rem;
  line-height: 1.35;
}

.geo-feel__track-wrap {
  margin-bottom: 0.65rem;
}

.geo-feel__track {
  position: relative;
  height: 12px;
  border-radius: 100px;
  background: var(--fill-tertiary, rgba(60, 60, 67, 0.12));
  overflow: visible;
}

.geo-feel__zone {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 100px 0 0 100px;
  background: rgba(52, 199, 89, 0.28);
  pointer-events: none;
}

.geo-feel__fence {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 3px;
  margin-left: -1.5px;
  border-radius: 2px;
  background: #34c759;
  z-index: 1;
  pointer-events: none;
}

.geo-feel__user {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  margin-left: -8px;
  margin-top: -8px;
  border-radius: 50%;
  background: var(--accent, #007aff);
  border: 2px solid var(--bg-elevated, #fff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  z-index: 2;
  pointer-events: none;
}

.geo-feel__axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  margin-top: 0.35rem;
}

.geo-feel__viz-note {
  font-size: 0.6875rem;
  line-height: 1.35;
  margin-top: 0.45rem;
}

.geo-feel__status {
  font-size: 0.8125rem;
  margin: 0;
}

.geo-feel--final.geo-feel--inside .geo-feel__distance {
  color: #248a3d;
}

.geo-feel--final.geo-feel--outside .geo-feel__distance {
  color: #d92d20;
}

.geo-feel__verdict {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  line-height: 1.4;
}

.geo-feel--inside .geo-feel__verdict {
  color: #248a3d;
}

.geo-feel--outside .geo-feel__verdict {
  color: #c41e3a;
}

.geo-feel__meta {
  font-size: 0.8125rem;
  margin: 0;
}
</style>
