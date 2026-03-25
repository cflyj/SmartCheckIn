<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { api, ApiError } from '../../api/client.js'
import AppNavBar from '../../components/AppNavBar.vue'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id)

const dataUrl = ref('')
const token = ref('')
const expiresAt = ref('')
const error = ref('')
let timer = null

async function refresh() {
  error.value = ''
  try {
    const d = await api(`/sessions/${id.value}/qr/current`)
    token.value = d.token
    expiresAt.value = d.expires_at
    const joinUrl = `${window.location.origin}/participant/sessions/${id.value}?token=${encodeURIComponent(d.token)}`
    dataUrl.value = await QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
  }
}

onMounted(() => {
  refresh()
  timer = setInterval(refresh, 3000)
})
onUnmounted(() => clearInterval(timer))
watch(id, refresh)
</script>

<template>
  <div class="page" style="background: linear-gradient(180deg, #1c1c1e 0%, #000 100%); min-height: 100dvh">
    <header
      class="nav-bar"
      style="background: rgba(28, 28, 30, 0.85); border-color: rgba(255, 255, 255, 0.08); color: #fff"
    >
      <div class="nav-bar__row">
        <button
          type="button"
          class="nav-bar__back"
          style="color: #0a84ff"
          @click="router.push({ name: 'organizer-session-edit', params: { id } })"
        >
          ‹ 返回
        </button>
        <span class="nav-bar__title" style="color: #fff">签到二维码</span>
      </div>
    </header>

    <div class="content" style="text-align: center; padding-top: 24px">
      <p style="color: rgba(255, 255, 255, 0.55); font-size: 15px; margin: 0 0 20px">请参与者使用相机扫描，令牌会定期刷新</p>
      <div v-if="error" class="banner-error">{{ error }}</div>
      <div v-else class="qr-frame" style="margin: 0 auto 20px">
        <img v-if="dataUrl" :src="dataUrl" alt="QR" />
      </div>
      <p v-if="expiresAt" style="color: rgba(255, 255, 255, 0.45); font-size: 13px; word-break: break-all">
        当前令牌至 {{ new Date(expiresAt).toLocaleTimeString() }} 前有效
      </p>
    </div>
  </div>
</template>
