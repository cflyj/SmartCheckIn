<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError, apiBase } from '../../api/client.js'
import AppNavBar from '../../components/AppNavBar.vue'
import { formatLocal } from '../../utils/date.js'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id)

const records = ref([])
const error = ref('')
const loading = ref(true)
const filter = ref('all')

async function load() {
  loading.value = true
  error.value = ''
  try {
    let q = '?limit=50'
    if (filter.value === 'ok') q += '&success=true'
    if (filter.value === 'fail') q += '&success=false'
    const data = await api(`/sessions/${id.value}/records${q}`)
    records.value = data.records || []
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([id, filter], load)

function exportCsv() {
  const token = localStorage.getItem('token')
  const url = `${apiBase()}/sessions/${id.value}/export`
  const a = document.createElement('a')
  a.href = url
  a.download = 'checkin.csv'
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.blob())
    .then((blob) => {
      a.href = URL.createObjectURL(blob)
      a.click()
      URL.revokeObjectURL(a.href)
    })
    .catch(() => {
      error.value = '导出失败'
    })
}
</script>

<template>
  <div class="page">
    <AppNavBar title="签到记录" @back="router.push({ name: 'organizer-session-edit', params: { id } })">
      <template #right>
        <button type="button" class="nav-bar__action" @click="exportCsv">导出</button>
      </template>
    </AppNavBar>

    <div class="content">
      <div class="tabs" style="margin-bottom: 16px">
        <button type="button" :class="['tab', filter === 'all' && 'tab--active']" @click="filter = 'all'">全部</button>
        <button type="button" :class="['tab', filter === 'ok' && 'tab--active']" @click="filter = 'ok'">成功</button>
        <button type="button" :class="['tab', filter === 'fail' && 'tab--active']" @click="filter = 'fail'">失败</button>
      </div>

      <div v-if="error" class="banner-error">{{ error }}</div>
      <div v-if="loading" class="spinner-wrap muted">加载中…</div>

      <div v-else class="grouped-list">
        <div
          v-for="r in records"
          :key="r.id"
          class="list-cell"
          style="cursor: default; flex-direction: column; align-items: stretch"
        >
          <div style="display: flex; justify-content: space-between; gap: 8px">
            <span class="list-cell__title">{{ r.user_display_name || r.username }}</span>
            <span :class="['pill', r.success ? 'pill-active' : 'pill-ended']">{{ r.success ? '成功' : '失败' }}</span>
          </div>
          <div class="muted" style="font-size: 14px; margin-top: 6px">
            {{ r.method }} · {{ formatLocal(r.server_at) }}
            <template v-if="!r.success && r.failure_code"> · {{ r.failure_code }}</template>
          </div>
        </div>
        <div v-if="!records.length" class="list-cell muted" style="cursor: default">暂无记录</div>
      </div>
    </div>
  </div>
</template>
