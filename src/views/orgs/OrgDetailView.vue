<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../../api/client.js'
import { useAuthStore } from '../../stores/auth.js'
import AppNavBar from '../../components/AppNavBar.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const id = computed(() => route.params.id)

const loading = ref(true)
const error = ref('')
const org = ref(null)
const addName = ref('')
const addErr = ref('')
const actionErr = ref('')
const newCodePlain = ref('')
const rename = ref('')
/** @type {import('vue').Ref<'open' | 'approval' | 'invite_only'>} */
const joinPolicyDraft = ref('open')
const transferUserId = ref('')
const lookupHits = ref([])
const lookupLoading = ref(false)
/** @type {import('vue').Ref<null | { id: string; username: string; display_name: string }>} */
const pickedUser = ref(null)

async function load() {
  loading.value = true
  error.value = ''
  actionErr.value = ''
  newCodePlain.value = ''
  try {
    const data = await api(`/orgs/${id.value}`)
    org.value = data.org
    rename.value = data.org.name
    joinPolicyDraft.value = data.org.join_policy || 'open'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
    org.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(id, load)

watch(addName, () => {
  pickedUser.value = null
})

const myRole = computed(() => org.value?.my_role)
const canManage = computed(() => myRole.value === 'owner' || myRole.value === 'admin')
const isOwner = computed(() => myRole.value === 'owner')

function roleLabel(r) {
  if (r === 'owner') return '负责人'
  if (r === 'admin') return '管理员'
  return '成员'
}

async function saveRename() {
  actionErr.value = ''
  try {
    await api(`/orgs/${id.value}`, { method: 'PUT', body: { name: rename.value.trim() } })
    await load()
  } catch (e) {
    actionErr.value = e instanceof ApiError ? e.message : '保存失败'
  }
}

async function saveJoinPolicy() {
  actionErr.value = ''
  try {
    await api(`/orgs/${id.value}`, { method: 'PUT', body: { join_policy: joinPolicyDraft.value } })
    await load()
  } catch (e) {
    actionErr.value = e instanceof ApiError ? e.message : '保存失败'
  }
}

function joinPolicyLabel(p) {
  if (p === 'approval') return '要审核：有码需通过'
  if (p === 'invite_only') return '仅邀请：只能加用户名'
  return '开放：有码即可进'
}

const inviteOnly = computed(() => (org.value?.join_policy || 'open') === 'invite_only')

async function approveRequest(uid) {
  actionErr.value = ''
  try {
    await api(`/orgs/${id.value}/join-requests/${uid}/approve`, { method: 'POST' })
    await load()
  } catch (e) {
    actionErr.value = e instanceof ApiError ? e.message : '操作失败'
  }
}

async function rejectRequest(uid) {
  if (!confirm('拒绝该入组申请？')) return
  actionErr.value = ''
  try {
    await api(`/orgs/${id.value}/join-requests/${uid}/reject`, { method: 'POST' })
    await load()
  } catch (e) {
    actionErr.value = e instanceof ApiError ? e.message : '操作失败'
  }
}

async function regenerateCode() {
  if (!confirm('重置后旧加入码立即失效，确定？')) return
  actionErr.value = ''
  try {
    const data = await api(`/orgs/${id.value}/regenerate-code`, { method: 'POST' })
    newCodePlain.value = data.join_code || ''
  } catch (e) {
    actionErr.value = e instanceof ApiError ? e.message : '重置失败'
  }
}

async function runUserLookup() {
  addErr.value = ''
  const q = addName.value.trim()
  if (q.length < 2) {
    addErr.value = '至少输入 2 个字符再搜索'
    return
  }
  lookupLoading.value = true
  pickedUser.value = null
  try {
    const data = await api(`/orgs/${id.value}/member-lookup?q=${encodeURIComponent(q)}`)
    lookupHits.value = data.users || []
    if (!lookupHits.value.length) {
      addErr.value = '没有匹配的未进组成员。若你知道对方登录用户名，可直接点「按用户名添加」。'
    }
  } catch (e) {
    lookupHits.value = []
    addErr.value = e instanceof ApiError ? e.message : '搜索失败'
  } finally {
    lookupLoading.value = false
  }
}

async function addMember() {
  addErr.value = ''
  const q = addName.value.trim()
  const body = pickedUser.value ? { user_id: pickedUser.value.id } : { username: q }
  if (!pickedUser.value && q.length < 2) {
    addErr.value = '请先搜索并点选人员，或输入完整登录用户名'
    return
  }
  try {
    await api(`/orgs/${id.value}/members`, { method: 'POST', body })
    addName.value = ''
    pickedUser.value = null
    lookupHits.value = []
    await load()
  } catch (e) {
    addErr.value = e instanceof ApiError ? e.message : '添加失败'
  }
}

async function removeMember(uid) {
  if (!confirm('从本组织移除此人？')) return
  actionErr.value = ''
  try {
    await api(`/orgs/${id.value}/members/${uid}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    actionErr.value = e instanceof ApiError ? e.message : '移除失败'
  }
}

async function leave() {
  if (!confirm('确定退出该组织？')) return
  actionErr.value = ''
  try {
    const data = await api(`/orgs/${id.value}/leave`, { method: 'POST' })
    if (data.org_deleted) {
      router.replace({ name: 'orgs' })
    } else {
      router.replace({ name: 'orgs' })
    }
  } catch (e) {
    actionErr.value = e instanceof ApiError ? e.message : '退出失败'
  }
}

async function transfer() {
  if (!transferUserId.value) return
  if (!confirm('转让后你变为管理员，对方成为负责人，确定？')) return
  actionErr.value = ''
  try {
    await api(`/orgs/${id.value}/transfer-owner`, { method: 'POST', body: { user_id: transferUserId.value } })
    transferUserId.value = ''
    await load()
  } catch (e) {
    actionErr.value = e instanceof ApiError ? e.message : '转让失败'
  }
}

function canRemove(m) {
  if (m.id === auth.user?.id) return false
  if (m.role === 'owner') return false
  if (m.role === 'admin' && myRole.value !== 'owner') return false
  return canManage.value
}
</script>

<template>
  <div class="page">
    <AppNavBar :title="org?.name || '组织'" @back="router.push({ name: 'orgs' })" />

    <div class="content">
      <div v-if="error" class="banner-error">{{ error }}</div>
      <div v-if="loading" class="spinner-wrap muted">加载中…</div>

      <template v-else-if="org">
        <div v-if="actionErr" class="banner-error">{{ actionErr }}</div>

        <div v-if="newCodePlain" class="card card-pad" style="margin-bottom: 16px">
          <p class="muted" style="margin-top: 0">新加入码（请立即保存）</p>
          <p v-if="inviteOnly" class="muted" style="font-size: 13px; line-height: 1.4; margin-bottom: 8px">
            当前为仅邀请模式，他人仍不能凭此码自助进组。
          </p>
          <p style="font-size: 20px; font-weight: 600; letter-spacing: 0.08em">{{ newCodePlain }}</p>
        </div>

        <div v-if="canManage" class="card card-pad" style="margin-bottom: 16px">
          <p class="list-cell__title" style="margin-bottom: 8px">添加成员</p>
          <p v-if="inviteOnly" class="muted" style="font-size: 14px; margin-top: 0; line-height: 1.45">
            当前为<strong>仅邀请</strong>：对方不能凭码进组。多人可能同名昵称，请<strong>搜索后点选</strong>；或已知对方<strong>登录用户名</strong>时可跳过搜索。
          </p>
          <p v-else class="muted" style="font-size: 14px; margin-top: 0; line-height: 1.45">
            显示名可能重复，建议先<strong>搜索昵称或用户名关键字</strong>再点选；也可直接输入完整登录用户名添加。
          </p>
          <div v-if="addErr" class="banner-error">{{ addErr }}</div>
          <div class="field" style="margin-bottom: 12px">
            <label>搜索或输入用户名</label>
            <div class="form-row">
              <input
                v-model="addName"
                class="input"
                placeholder="昵称或用户名，至少 2 字可搜"
                autocomplete="off"
                @keyup.enter="runUserLookup"
              />
              <button type="button" class="btn btn-secondary" :disabled="lookupLoading" @click="runUserLookup">
                {{ lookupLoading ? '…' : '搜索' }}
              </button>
            </div>
          </div>
          <div v-if="lookupHits.length" class="grouped-list" style="margin-bottom: 12px">
            <p class="muted" style="font-size: 13px; padding: 8px 14px 0; margin: 0">点选要添加的人（以 @用户名 为准，不会加错）</p>
            <button
              v-for="u in lookupHits"
              :key="u.id"
              type="button"
              class="list-cell"
              style="
                width: 100%;
                border: none;
                text-align: left;
                cursor: pointer;
                flex-direction: column;
                align-items: flex-start;
                background: var(--ios-bg-elevated);
              "
              :style="pickedUser?.id === u.id ? { boxShadow: 'inset 0 0 0 2px var(--ios-blue)' } : undefined"
              @click="pickedUser = u"
            >
              <span class="list-cell__title">{{ u.display_name }}</span>
              <span class="muted" style="font-size: 14px; margin-top: 4px">@{{ u.username }}</span>
            </button>
          </div>
          <button type="button" class="btn btn-primary" @click="addMember">
            {{
              pickedUser
                ? `添加「${pickedUser.display_name}」（@${pickedUser.username}）`
                : '按完整登录用户名添加'
            }}
          </button>
        </div>

        <div class="card card-pad" style="margin-bottom: 16px">
          <p class="muted" style="margin-top: 0">你在本组织：{{ roleLabel(org.my_role) }} · 共 {{ org.member_count }} 人</p>
          <template v-if="canManage">
            <div class="field">
              <label>组织名称</label>
              <div class="form-row">
                <input v-model="rename" class="input" />
                <button type="button" class="btn btn-secondary" @click="saveRename">保存</button>
              </div>
            </div>
            <button type="button" class="btn btn-secondary" style="margin-top: 8px" @click="regenerateCode">
              重置加入码
            </button>
            <p v-if="inviteOnly" class="muted" style="font-size: 13px; line-height: 1.4; margin: 8px 0 0">重置后旧码失效；加入码不能用来拉人。</p>
            <template v-if="isOwner">
              <div class="field" style="margin-top: 12px; margin-bottom: 0">
                <label>谁可以进组</label>
                <p class="muted" style="font-size: 13px; margin: 0 0 8px">
                  当前：{{ joinPolicyLabel(org.join_policy || 'open') }}
                </p>
                <div class="form-row">
                  <select v-model="joinPolicyDraft" class="select input">
                    <option value="open">任何人：有码就能进</option>
                    <option value="approval">要审核：有码需通过</option>
                    <option value="invite_only">仅邀请：只能加用户名</option>
                  </select>
                  <button type="button" class="btn btn-secondary" @click="saveJoinPolicy">保存</button>
                </div>
              </div>
            </template>
            <p v-else-if="canManage" class="muted" style="font-size: 13px; margin-top: 12px; margin-bottom: 0">
              进组方式：{{ joinPolicyLabel(org.join_policy || 'open') }}（仅负责人可改）
            </p>
          </template>
        </div>

        <div
          v-if="canManage && org.pending_join_requests?.length"
          class="card card-pad"
          style="margin-bottom: 16px"
        >
          <p class="list-cell__title" style="margin-bottom: 8px">待审核入组申请</p>
          <div
            v-for="r in org.pending_join_requests"
            :key="r.user_id"
            class="list-cell"
            style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0; flex-wrap: wrap"
          >
            <div>
              <div class="list-cell__title">{{ r.display_name }}</div>
              <div class="muted" style="font-size: 13px; margin-top: 4px">@{{ r.username }} · 申请 {{ r.created_at }}</div>
            </div>
            <div class="form-row form-row--equal" style="flex-shrink: 0; margin: 0">
              <button type="button" class="btn btn-primary" @click="approveRequest(r.user_id)">通过</button>
              <button type="button" class="btn btn-secondary" @click="rejectRequest(r.user_id)">拒绝</button>
            </div>
          </div>
        </div>

        <div v-if="isOwner && org.members?.filter((m) => m.id !== auth.user?.id).length" class="card card-pad" style="margin-bottom: 16px">
          <p class="list-cell__title" style="margin-bottom: 8px">转让负责人</p>
          <select v-model="transferUserId" class="select input" style="margin-bottom: 10px">
            <option value="">选择成员</option>
            <option v-for="m in org.members.filter((x) => x.id !== auth.user?.id)" :key="m.id" :value="m.id">
              {{ m.display_name }}（{{ m.username }}）
            </option>
          </select>
          <button type="button" class="btn btn-secondary" :disabled="!transferUserId" @click="transfer">转让</button>
        </div>

        <p class="muted" style="font-size: 14px; margin-bottom: 8px">成员列表</p>
        <div class="grouped-list" style="margin-bottom: 20px">
          <div
            v-for="m in org.members"
            :key="m.id"
            class="list-cell"
            style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0"
          >
            <div>
              <div class="list-cell__title">{{ m.display_name }}</div>
              <div class="muted" style="font-size: 13px; margin-top: 4px">@{{ m.username }} · {{ roleLabel(m.role) }}</div>
            </div>
            <button v-if="canRemove(m)" type="button" class="btn btn-secondary" style="flex-shrink: 0" @click="removeMember(m.id)">
              移除
            </button>
          </div>
        </div>

        <button type="button" class="btn btn-secondary" @click="leave">退出组织</button>
      </template>
    </div>
  </div>
</template>
