<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api/client.js'
import AppPageShell from '../../components/AppPageShell.vue'
import PageFetchState from '../../components/PageFetchState.vue'
import { apiErrorMessage } from '../../utils/apiHelpers.js'

const router = useRouter()
const list = ref([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    const data = await api('/orgs')
    list.value = data.organizations || []
  } catch (e) {
    error.value = apiErrorMessage(e, '加载失败')
  } finally {
    loading.value = false
  }
})

function roleLabel(r) {
  if (r === 'owner') return '负责人'
  if (r === 'admin') return '管理员'
  return '成员'
}
</script>

<template>
  <AppPageShell nav-title="我的组织" @back="router.push({ name: 'home' })">
    <template #nav-right>
      <button type="button" class="nav-bar__action" @click="router.push({ name: 'org-new' })">新建</button>
    </template>

    <div class="content stack stack--md">
      <p class="muted text-body-xs section-hint">
        可凭加入码加入（若对方允许），或由管理员直接加你的用户名。名单制签到时，只能从你已加入的组织里选人。
      </p>
      <button type="button" class="btn btn-secondary u-mb-4" @click="router.push({ name: 'org-join' })">
        我有加入码
      </button>

      <PageFetchState :loading="loading" :error="error">
        <template v-if="!list.length">
          <div class="empty-state" role="status">
            <div class="empty-state__icon" aria-hidden="true">🏢</div>
            <p class="empty-state__title">暂无组织</p>
            <p class="empty-state__text">可新建组织或使用加入码加入。</p>
          </div>
        </template>
        <div v-else class="grouped-list">
          <button
            v-for="o in list"
            :key="o.id"
            type="button"
            class="list-cell chevron"
            @click="router.push({ name: 'org-detail', params: { id: o.id } })"
          >
            <div>
              <div class="list-cell__title">{{ o.name }}</div>
              <div class="muted meta-under-title">{{ roleLabel(o.my_role) }}</div>
            </div>
          </button>
        </div>
      </PageFetchState>
    </div>
  </AppPageShell>
</template>
