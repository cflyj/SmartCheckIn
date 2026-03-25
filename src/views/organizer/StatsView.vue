<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import AppNavBar from '../../components/AppNavBar.vue'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id)

const stats = ref(null)
const error = ref('')
const loading = ref(true)

async function load() {
  loading.value = true
  error.value = ''
  try {
    stats.value = await api(`/sessions/${id.value}/stats`)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(id, load)
</script>

<template>
  <div class="page">
    <AppNavBar title="统计" @back="router.push({ name: 'organizer-session-edit', params: { id } })" />

    <div class="content">
      <div v-if="loading" class="spinner-wrap muted">加载中…</div>
      <div v-else-if="error" class="banner-error">{{ error }}</div>

      <template v-else-if="stats">
        <div class="grouped-list" style="margin-bottom: 20px">
          <div class="list-cell" style="cursor: default">
            <span class="list-cell__title">成功签到</span>
            <span class="list-cell__meta">{{ stats.success_count }}</span>
          </div>
          <div class="list-cell" style="cursor: default; border-bottom: none">
            <span class="list-cell__title">总尝试次数</span>
            <span class="list-cell__meta">{{ stats.total_attempts }}</span>
          </div>
        </div>

        <p class="muted" style="margin-bottom: 8px">按方式（成功）</p>
        <div class="grouped-list" style="margin-bottom: 20px">
          <div class="list-cell" style="cursor: default">
            <span class="list-cell__title">地理位置</span>
            <span class="list-cell__meta">{{ stats.by_method?.geo ?? 0 }}</span>
          </div>
          <div class="list-cell" style="cursor: default; border-bottom: none">
            <span class="list-cell__title">二维码</span>
            <span class="list-cell__meta">{{ stats.by_method?.qr ?? 0 }}</span>
          </div>
        </div>

        <p v-if="stats.failure_top?.length" class="muted" style="margin-bottom: 8px">失败原因 Top</p>
        <div v-if="stats.failure_top?.length" class="grouped-list">
          <div
            v-for="row in stats.failure_top"
            :key="row.failure_code"
            class="list-cell"
            style="cursor: default"
          >
            <span class="list-cell__title">{{ row.failure_code }}</span>
            <span class="list-cell__meta">{{ row.c }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
