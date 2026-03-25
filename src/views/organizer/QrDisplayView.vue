<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { api, ApiError } from '../../api/client.js'

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
  <div class="page theme-display">
    <header class="nav-bar">
      <div class="nav-bar__row">
        <button
          type="button"
          class="nav-bar__back"
          aria-label="返回"
          @click="router.push({ name: 'organizer-session-edit', params: { id } })"
        >
          ‹ 返回
        </button>
        <span class="nav-bar__title">签到二维码</span>
      </div>
    </header>

    <div class="content content--center">
      <p class="theme-display__hint">请参与者使用相机扫描，令牌会定期刷新</p>
      <div v-if="error" class="banner-error banner-error--on-dark">{{ error }}</div>
      <div v-else class="qr-frame qr-frame--center">
        <img v-if="dataUrl" :src="dataUrl" alt="签到二维码" />
      </div>
      <p v-if="expiresAt" class="theme-display__meta">
        当前令牌至 {{ new Date(expiresAt).toLocaleTimeString() }} 前有效
      </p>
    </div>
  </div>
</template>
