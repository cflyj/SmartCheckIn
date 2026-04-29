<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import AppNavBar from '../../components/AppNavBar.vue'
import { captureFaceDescriptor, loadFaceModels } from '../../utils/faceClient.js'

const router = useRouter()
const videoRef = ref(null)
const stream = ref(null)
const err = ref('')
const okMsg = ref('')
const modelsLoading = ref(true)
const captureWorking = ref(false)

async function startCamera() {
  err.value = ''
  okMsg.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    err.value = '当前浏览器不支持摄像头'
    modelsLoading.value = false
    return
  }
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    })
    stream.value = s
    await loadFaceModels()
    modelsLoading.value = false
    if (videoRef.value) {
      videoRef.value.srcObject = s
      await videoRef.value.play()
    }
  } catch {
    err.value = '无法打开摄像头。请使用 HTTPS 或 localhost，并授权摄像头。'
    modelsLoading.value = false
  }
}

async function saveSample() {
  err.value = ''
  okMsg.value = ''
  if (!videoRef.value?.srcObject) {
    err.value = '请先授权摄像头'
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
      '已保存。系统只保存数学特征向量，不保存照片原图。你可参与人脸识别类签到活动。'
  } catch (e) {
    err.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    captureWorking.value = false
  }
}

onMounted(() => {
  startCamera()
})

onUnmounted(() => {
  stream.value?.getTracks().forEach((t) => t.stop())
})
</script>

<template>
  <div class="page">
    <AppNavBar title="人脸样本录入" @back="router.push({ name: 'home' })" />

    <div class="content stack stack--md">
      <p class="muted text-body-sm u-mb-0">
        仅在参与「人脸识别」或「地理 + 人脸识别」活动前完成即可。向量存于账号，用于与签到时采集的特征比对；不存储照片文件。
      </p>
      <div v-if="modelsLoading" class="spinner-wrap muted" role="status">
        <span class="loading-spinner" aria-hidden="true" />
        <span>正在加载模型与摄像头…</span>
      </div>
      <template v-else>
        <div v-if="err" class="banner-error banner--tight">{{ err }}</div>
        <div v-if="okMsg" class="banner-success banner--tight">{{ okMsg }}</div>
        <div class="card card-pad stack">
          <div class="face-video-wrap">
            <video ref="videoRef" class="face-video" playsinline muted aria-label="取景画面" />
          </div>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="captureWorking"
            @click="saveSample"
          >
            {{ captureWorking ? '处理中…' : '截取当前画面并保存为样本' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.face-video-wrap {
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  background: #000;
}
.face-video {
  display: block;
  width: 100%;
  max-height: min(62vh, 420px);
  object-fit: cover;
}
</style>
