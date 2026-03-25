<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import AppNavBar from '../../components/AppNavBar.vue'

const router = useRouter()
const name = ref('')
const joinCodeCustom = ref('')
/** @type {import('vue').Ref<'open' | 'approval' | 'invite_only'>} */
const joinPolicy = ref('open')
const err = ref('')
const loading = ref(false)
/** @type {import('vue').Ref<null | { join_code: string; join_policy: string }>} */
const createdInfo = ref(null)

const isInviteOnly = computed(() => joinPolicy.value === 'invite_only')

const introHint = computed(() => {
  if (joinPolicy.value === 'invite_only') {
    return '创建后你为负责人。新成员只能由你在组织详情里输入对方用户名添加；别人不能凭加入码自己进组。'
  }
  if (joinPolicy.value === 'approval') {
    return '创建后你为负责人。把加入码发给对方；对方提交申请后，需你或管理员通过才会进组。'
  }
  return '创建后你为负责人。把加入码发给对方，校验通过即可进组（名单制活动里可从该组织选人）。'
})

async function submit() {
  err.value = ''
  createdInfo.value = null
  loading.value = true
  try {
    const body = { name: name.value.trim(), join_policy: joinPolicy.value }
    const c = joinCodeCustom.value.trim()
    if (c.length >= 4) body.join_code = c
    const data = await api('/orgs', { method: 'POST', body })
    createdInfo.value = {
      join_code: data.join_code || '',
      join_policy: data.org?.join_policy || joinPolicy.value,
    }
  } catch (e) {
    err.value = e instanceof ApiError ? e.message : '创建失败'
  } finally {
    loading.value = false
  }
}

function done() {
  router.replace({ name: 'orgs' })
}
</script>

<template>
  <div class="page">
    <AppNavBar title="新建组织" @back="router.push({ name: 'orgs' })" />

    <div class="content stack stack--md">
      <template v-if="!createdInfo">
        <p class="muted text-body-xs">
          {{ introHint }}
        </p>
        <div v-if="err" class="banner-error">{{ err }}</div>
        <div class="field">
          <label>组织名称</label>
          <input v-model="name" class="input" placeholder="2～60 字" />
        </div>
        <div class="field">
          <label>谁可以进组</label>
          <select v-model="joinPolicy" class="select input">
            <option value="open">任何人：有加入码就能进</option>
            <option value="approval">要审核：有码需管理员通过</option>
            <option value="invite_only">仅邀请：只能你/管理员加用户名</option>
          </select>
        </div>
        <div class="field">
          <label>{{ isInviteOnly ? '加入码（可选）' : '自定义加入码（可选）' }}</label>
          <p v-if="isInviteOnly" class="muted text-note u-mb-2 u-mt-0">
            不填则系统自动生成。仅邀请模式下，加入码<strong>不能</strong>让别人自己进组，只方便你自己核对。
          </p>
          <p v-else class="muted text-note u-mb-2 u-mt-0">至少 4 位；留空则随机 8 位。</p>
          <input v-model="joinCodeCustom" class="input" autocomplete="off" placeholder="留空则自动生成" />
        </div>
        <button type="button" class="btn btn-primary" :disabled="loading" @click="submit">
          {{ loading ? '创建中…' : '创建' }}
        </button>
      </template>
      <template v-else>
        <div class="card card-pad stack">
          <p class="list-cell__title u-mb-2">组织已创建</p>
          <template v-if="createdInfo.join_policy === 'invite_only'">
            <p class="muted text-body-xs u-mt-0">
              下一步：在「我的组织」里打开该组织，用<strong>添加成员</strong>输入对方<strong>用户名</strong>即可拉人。
            </p>
            <p class="muted text-note u-mb-0">
              下方是一串加入码，仅供你自己备忘或口头核对「是哪个组织」；对方<strong>无法</strong>靠它自己进组。
            </p>
            <p class="join-code-display join-code-display--md">{{ createdInfo.join_code }}</p>
          </template>
          <template v-else>
            <p class="muted text-body-xs u-mt-0">
              请复制保存加入码发给成员。关闭本页后只能到组织详情里<strong>重置加入码</strong>才能换新码。
            </p>
            <p class="join-code-display u-mt-4">{{ createdInfo.join_code }}</p>
          </template>
        </div>
        <button type="button" class="btn btn-primary" @click="done">完成</button>
      </template>
    </div>
  </div>
</template>
