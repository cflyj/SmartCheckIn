<script setup>
/**
 * 与 SessionDetailView 人脸识别块一致：
 * - 人脸模型与用户点击后再 getUserMedia（移动端更稳）
 * - 赋值 srcObject 之后 await nextTick()，确保 video 已在 DOM（避免 refs 仍为 null）
 * - 入站拉取人脸策略（防代签），见 docs/FACE_SIGNIN_ANTI_PROXY_PRD.md
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import AppPageShell from '../../components/AppPageShell.vue'
import { captureFaceDescriptor, loadFaceModels } from '../../utils/faceClient.js'
import { needsHttpsForSensitiveApis } from '../../utils/geoFeel.js'

const router = useRouter()
const videoRef = ref(null)
const cameraOpening = ref(false)
const pageLoading = ref(true)
const modelsErr = ref('')
const faceEnrollment = ref(null)
const err = ref('')
const okMsg = ref('')
const captureWorking = ref(false)

let mediaStream = null

/**
 * 「仅当策略明确 forbids」时禁用：`undefined`/null（策略未就绪或旧接口）视作允许，
 * 最终仍以 POST /users/me/face 为准。
 */
const canSubmitSample = computed(() => faceEnrollment.value?.can_submit_new_sample !== false)

const policyBanner = computed(() => {
  const fe = faceEnrollment.value
  if (!fe || fe.can_submit_new_sample !== false) return ''
  return fe.policy_note || '根据当前策略暂时不能更换人脸样本。'
})

async function loadFacePolicy() {
  const d = await api('/users/me/profile')
  faceEnrollment.value = d.face_enrollment ?? null
}

async function preloadModels() {
  modelsErr.value = ''
  await loadFaceModels()
}

async function openCamera() {
  err.value = ''
  okMsg.value = ''
  if (!canSubmitSample.value) {
    err.value =
      faceEnrollment.value?.policy_note || '当前不可保存人脸样本（防代签策略），请稍后或联系活动组织者。'
    return
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    err.value = '当前浏览器不支持摄像头'
    return
  }
  if (needsHttpsForSensitiveApis()) {
    err.value =
      '需要使用 HTTPS 或 localhost。用手机通过局域网 IP 的 HTTP 访问时浏览器会禁用摄像头；请改用 HTTPS、localhost，或使用手机热点下的安全域名。'
    return
  }
  cameraOpening.value = true
  try {
    await loadFaceModels()
    stopCam()
    const stream = await tryGetFaceStream()
    mediaStream = stream
    await nextTick()
    const el = videoRef.value
    if (!el) {
      err.value = '页面仍未就绪，请稍后再试「打开摄像头」'
      stream.getTracks().forEach((t) => t.stop())
      mediaStream = null
      return
    }
    el.srcObject = stream
    await el.play().catch(() => {})
  } catch {
    err.value = '无法打开摄像头。请在系统权限中允许摄像头，并使用系统浏览器或 Chrome / Safari。'
    stopCam()
  } finally {
    cameraOpening.value = false
  }
}

function stopCam() {
  mediaStream?.getTracks().forEach((t) => t.stop())
  mediaStream = null
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

async function tryGetFaceStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('unsupported')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
  } catch {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  }
}

async function saveSample() {
  err.value = ''
  okMsg.value = ''
  if (!canSubmitSample.value) {
    err.value =
      faceEnrollment.value?.policy_note || '当前不可保存人脸样本（防代签冷却或活动时间窗口冻结）。'
    return
  }
  if (!videoRef.value?.srcObject) {
    err.value = '请先点击「打开摄像头」并能在画面中看到人像预览'
    return
  }
  captureWorking.value = true
  try {
    const shot = await captureFaceDescriptor(videoRef.value)
    if (shot.error) {
      err.value =
        shot.error === 'no_face'
          ? '画面中未检测到正脸，请靠近、正对镜头并保持光线充足'
          : '图像处理失败，请重试'
      return
    }
    await api('/users/me/face', { method: 'POST', body: { descriptor: shot.descriptor } })
    okMsg.value =
      '已保存。系统只保存数学特征向量，不保存照片原图。你可参与人脸识别类签到活动。（再次更换将受到冷却与活动窗口限制。）'
    stopCam()
    await loadFacePolicy()
  } catch (e) {
    err.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    captureWorking.value = false
  }
}

onMounted(async () => {
  pageLoading.value = true
  try {
    try {
      await preloadModels()
    } catch (e) {
      console.warn(e)
      modelsErr.value =
        '人脸模型加载失败。请确认网络通畅，或由管理员配置 VITE_FACE_WEIGHTS_URL 指向本地权重后重试。'
    }
    if (!modelsErr.value) {
      await loadFacePolicy().catch(() => {
        faceEnrollment.value = {
          can_submit_new_sample: false,
          is_first_enrollment: false,
          policy_note: '无法校验人脸样本策略（网络异常）。请稍后重试或刷新页面。',
          blocked_by: 'unknown',
        }
      })
    }
  } finally {
    pageLoading.value = false
  }
})

onUnmounted(() => {
  stopCam()
})
</script>

<template>
  <AppPageShell nav-title="人脸样本录入" @back="router.push({ name: 'home' })">

    <div class="content stack stack--md">
      <p class="muted text-body-sm u-mb-0">
        向量存于账号，用于签到时抓取画面提取特征后与样本比对（不储存照片）。为防止「临场换人」代签到，
        <strong>再次保存样本（覆盖原样本）</strong>将受<strong>冷却时间</strong>与<strong>临近活动冻结窗口</strong>限制；完整规则见仓库内文档「FACE_SIGNIN_ANTI_PROXY」。
      </p>

      <div v-if="pageLoading" class="spinner-wrap muted" role="status">
        <span class="loading-spinner" aria-hidden="true" />
        <span>正在加载人脸模型与安全策略…</span>
      </div>

      <template v-else>
        <div v-if="modelsErr" class="banner-error banner--tight">{{ modelsErr }}</div>
        <div v-if="policyBanner && !modelsErr" class="inset-callout">
          {{ policyBanner }}
        </div>
        <div v-if="err" class="banner-error banner--tight">{{ err }}</div>
        <div v-if="okMsg" class="banner-success banner--tight">{{ okMsg }}</div>

        <div v-if="!modelsErr" class="card card-pad stack">
          <div class="face-video-wrap">
            <video ref="videoRef" class="face-video" playsinline muted aria-label="取景画面" />
          </div>
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="pageLoading || !canSubmitSample || cameraOpening || captureWorking"
            @click="openCamera"
          >
            {{ cameraOpening ? '正在打开摄像头…' : '打开摄像头' }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="pageLoading || !canSubmitSample || captureWorking"
            @click="saveSample"
          >
            {{ captureWorking ? '处理中…' : '截取当前画面并保存为样本' }}
          </button>
          <p v-if="canSubmitSample" class="muted text-body-xs u-mb-0">
            {{
              faceEnrollment?.is_first_enrollment
                ? '首次录入无冷却限制。保存后若需再次更换，将受策略约束。'
                : '仅在策略允许时才可采集并上传；若按钮禁用，请以页面提示为准。'
            }}
          </p>
        </div>
      </template>
    </div>
  </AppPageShell>
</template>

<style scoped>
.face-video-wrap {
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  background: #000;
  min-height: min(240px, 52vh);
  aspect-ratio: 4 / 3;
}
.face-video {
  display: block;
  width: 100%;
  height: 100%;
  max-height: min(62vh, 420px);
  object-fit: cover;
}
</style>
