<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../api/client.js'
import AppPageShell from '../../components/AppPageShell.vue'
import PageFetchState from '../../components/PageFetchState.vue'
import { apiErrorMessage } from '../../utils/apiHelpers.js'

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
    error.value = apiErrorMessage(e, '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(id, load)
</script>

<template>
  <AppPageShell nav-title="统计" @back="router.push({ name: 'organizer-session-edit', params: { id } })">

    <div class="content stack stack--md">
      <PageFetchState :loading="loading" :error="error">
        <template v-if="stats">
          <div class="grouped-list u-mb-5">
            <div class="list-cell list-cell--static">
              <span class="list-cell__title">成功签到</span>
              <span class="list-cell__meta">{{ stats.success_count }}</span>
            </div>
            <div class="list-cell list-cell--static list-cell--borderless">
              <span class="list-cell__title">总尝试次数</span>
              <span class="list-cell__meta">{{ stats.total_attempts }}</span>
            </div>
          </div>

          <p class="muted text-body-xs u-mb-2">按方式（成功）</p>
          <div class="grouped-list u-mb-5">
            <div class="list-cell list-cell--static">
              <span class="list-cell__title">地理位置</span>
              <span class="list-cell__meta">{{ stats.by_method?.geo ?? 0 }}</span>
            </div>
            <div class="list-cell list-cell--static">
              <span class="list-cell__title">二维码</span>
              <span class="list-cell__meta">{{ stats.by_method?.qr ?? 0 }}</span>
            </div>
            <div class="list-cell list-cell--static">
              <span class="list-cell__title">仅人脸</span>
              <span class="list-cell__meta">{{ stats.by_method?.face ?? 0 }}</span>
            </div>
            <div class="list-cell list-cell--static list-cell--borderless">
              <span class="list-cell__title">地理 + 人脸</span>
              <span class="list-cell__meta">{{ stats.by_method?.geo_face ?? 0 }}</span>
            </div>
          </div>

          <p v-if="stats.failure_top?.length" class="muted text-body-xs u-mb-2">失败原因 Top</p>
          <div v-if="stats.failure_top?.length" class="grouped-list">
            <div
              v-for="(row, i) in stats.failure_top"
              :key="row.failure_code"
              class="list-cell list-cell--static"
              :class="{ 'list-cell--borderless': i === stats.failure_top.length - 1 }"
            >
              <span class="list-cell__title">{{ row.failure_code }}</span>
              <span class="list-cell__meta">{{ row.c }}</span>
            </div>
          </div>
        </template>
      </PageFetchState>
    </div>
  </AppPageShell>
</template>
