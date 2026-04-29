<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import AppPageShell from '../../components/AppPageShell.vue'

const router = useRouter()
const code = ref('')
const err = ref('')
const loading = ref(false)
/** @type {import('vue').Ref<'input' | 'confirm'>} */
const phase = ref('input')
/** 接口返回的预览数据（含 ambiguous / 单组织） */
const preview = ref(null)
const selectedOrgId = ref('')

const activeTarget = computed(() => {
  const p = preview.value
  if (!p) return null
  if (p.ambiguous) {
    const c = p.candidates?.find((x) => x.id === selectedOrgId.value)
    return c
      ? {
          id: c.id,
          name: c.name,
          join_policy: c.join_policy,
          already_member: c.already_member,
          has_pending_request: c.has_pending_request,
        }
      : null
  }
  if (!p.org) return null
  return {
    id: p.org.id,
    name: p.org.name,
    join_policy: p.org.join_policy,
    already_member: p.already_member,
    has_pending_request: p.has_pending_request,
  }
})

function policyLabel(p) {
  if (p === 'approval') return '要审核后加入'
  if (p === 'invite_only') return '仅限邀请，不能自助进组'
  return '可凭加入码进组'
}

function policyDetail(p) {
  if (p === 'approval') return '点按钮提交申请后，需管理员通过你才会进组。'
  if (p === 'invite_only') return '管理员没有开放「凭码进组」。请让对方在组织里输入你的用户名添加你。'
  return '确认后即可进组。'
}

async function runPreview() {
  err.value = ''
  selectedOrgId.value = ''
  loading.value = true
  try {
    const data = await api('/orgs/preview-join', {
      method: 'POST',
      body: { code: code.value.trim() },
    })
    preview.value = data
    phase.value = 'confirm'
  } catch (e) {
    err.value = e instanceof ApiError ? e.message : '校验失败'
  } finally {
    loading.value = false
  }
}

async function confirmJoin() {
  const t = activeTarget.value
  if (!t || t.join_policy === 'invite_only') return
  err.value = ''
  loading.value = true
  try {
    const body = { code: code.value.trim(), org_id: t.id }
    await api('/orgs/join', { method: 'POST', body })
    router.replace({ name: 'orgs' })
  } catch (e) {
    err.value = e instanceof ApiError ? e.message : '加入失败'
  } finally {
    loading.value = false
  }
}

function backToInput() {
  phase.value = 'input'
  preview.value = null
  selectedOrgId.value = ''
  err.value = ''
}
</script>

<template>
  <AppPageShell nav-title="加入组织" @back="router.push({ name: 'orgs' })">

    <div class="content stack stack--md">
      <p v-if="phase === 'input'" class="muted text-body-xs">
        向组织负责人索取<strong>加入码</strong>。先校验加入码，确认组织名称与入组方式后再操作。
      </p>
      <div v-if="err" class="banner-error">{{ err }}</div>

      <template v-if="phase === 'input'">
        <div class="field">
          <label>加入码</label>
          <input v-model="code" class="input" autocomplete="off" placeholder="至少 4 位" @keyup.enter="runPreview" />
        </div>
        <button type="button" class="btn btn-primary" :disabled="loading || code.trim().length < 4" @click="runPreview">
          {{ loading ? '校验中…' : '校验并继续' }}
        </button>
      </template>

      <template v-else-if="preview?.ambiguous">
        <p class="muted text-body-xs u-mt-0">
          该加入码对应<strong>多个组织</strong>，请根据负责人告知的名称点选正确的一个，避免加错群。
        </p>
        <p class="muted text-note">新建组织时系统会避免与他人重复加入码；若仍出现多条，多为历史数据，请务必核对名称。</p>
        <div class="org-join-candidates">
          <button
            v-for="c in preview.candidates"
            :key="c.id"
            type="button"
            class="org-join-option"
            :class="{ 'org-join-option--selected': selectedOrgId === c.id }"
            @click="selectedOrgId = c.id"
          >
            <div class="list-cell__title">{{ c.name }}</div>
            <div class="muted meta-under-title meta-under-title--13">{{ policyLabel(c.join_policy) }}</div>
          </button>
        </div>

        <template v-if="activeTarget">
          <div class="card card-pad card--spaced">
            <p class="list-cell__title card-title-tight">{{ activeTarget.name }}</p>
            <p class="muted text-body-xs u-mb-2">{{ policyLabel(activeTarget.join_policy) }}</p>
            <p class="muted text-body-xs u-mb-0">{{ policyDetail(activeTarget.join_policy) }}</p>
          </div>

          <template v-if="activeTarget.already_member">
            <p class="muted text-body-xs">你已是该组织成员。</p>
            <button type="button" class="btn btn-primary" @click="router.replace({ name: 'orgs' })">返回组织列表</button>
          </template>
          <template v-else-if="activeTarget.has_pending_request">
            <p class="muted text-body-xs">你已提交入组申请，请等待管理员审核。</p>
            <button type="button" class="btn btn-primary" @click="router.replace({ name: 'orgs' })">返回组织列表</button>
          </template>
          <template v-else-if="activeTarget.join_policy === 'invite_only'">
            <p class="muted text-body-xs u-mb-3">
              把你在本系统注册的<strong>用户名</strong>告诉组织管理员，请对方在「组织详情 → 添加成员」里加你。
            </p>
            <button type="button" class="btn btn-primary" @click="router.replace({ name: 'orgs' })">返回组织列表</button>
            <button type="button" class="btn btn-secondary btn--block u-mt-3" @click="backToInput">
              换加入码重试
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn btn-primary" :disabled="loading" @click="confirmJoin">
              {{ loading ? '提交中…' : activeTarget.join_policy === 'approval' ? '提交入组申请' : '确认加入' }}
            </button>
            <button type="button" class="btn btn-secondary u-mt-3" :disabled="loading" @click="backToInput">
              返回修改加入码
            </button>
          </template>
        </template>
        <p v-else class="muted text-body-xs">请先在上方选择一个组织。</p>
      </template>

      <template v-else-if="preview && !preview.ambiguous && preview.org">
        <div class="card card-pad card--spaced">
          <p class="list-cell__title card-title-tight">{{ preview.org.name }}</p>
          <p class="muted text-body-xs u-mb-2">{{ policyLabel(preview.org.join_policy) }}</p>
          <p class="muted text-body-xs u-mb-0">{{ policyDetail(preview.org.join_policy) }}</p>
        </div>

        <template v-if="preview.already_member">
          <p class="muted text-body-xs">你已是该组织成员。</p>
          <button type="button" class="btn btn-primary" @click="router.replace({ name: 'orgs' })">返回组织列表</button>
        </template>
        <template v-else-if="preview.has_pending_request">
          <p class="muted text-body-xs">你已提交入组申请，请等待管理员审核。</p>
          <button type="button" class="btn btn-primary" @click="router.replace({ name: 'orgs' })">返回组织列表</button>
        </template>
        <template v-else-if="preview.org.join_policy === 'invite_only'">
          <p class="muted text-body-xs u-mb-3">
            把你在本系统注册的<strong>用户名</strong>告诉组织管理员，请对方在「组织详情 → 添加成员」里加你。
          </p>
          <button type="button" class="btn btn-primary" @click="router.replace({ name: 'orgs' })">返回组织列表</button>
          <button type="button" class="btn btn-secondary btn--block u-mt-3" @click="backToInput">
            换加入码重试
          </button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-primary" :disabled="loading" @click="confirmJoin">
            {{ loading ? '提交中…' : preview.org.join_policy === 'approval' ? '提交入组申请' : '确认加入' }}
          </button>
          <button type="button" class="btn btn-secondary u-mt-3" :disabled="loading" @click="backToInput">
            返回修改加入码
          </button>
        </template>
      </template>
    </div>
  </AppPageShell>
</template>
