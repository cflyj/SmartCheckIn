<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { ApiError } from '../api/client.js'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const password2 = ref('')
const displayName = ref('')
const organizerCode = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (password.value !== password2.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const user = await auth.register({
      username: username.value.trim(),
      password: password.value,
      display_name: displayName.value.trim(),
      organizer_invite_code: organizerCode.value.trim() || undefined,
    })
    if (user.role === 'organizer') {
      router.replace({ name: 'home' })
    } else {
      router.replace({ name: 'participant-sessions' })
    }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '注册失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="content" style="padding-top: calc(24px + var(--safe-top))">
      <h1 class="headline">注册</h1>
      <p class="subhead">默认注册为参与者。若持有开发者发放的「组织者邀请码」，可填下方升级为组织者。</p>

      <div v-if="error" class="banner-error">{{ error }}</div>

      <div class="card card-pad" style="margin-bottom: 24px">
        <div class="field">
          <label for="reg-u">用户名</label>
          <input id="reg-u" v-model="username" class="input" autocomplete="username" placeholder="2～32 位" />
        </div>
        <div class="field">
          <label for="reg-d">显示名称</label>
          <input id="reg-d" v-model="displayName" class="input" autocomplete="name" placeholder="如：张三" />
        </div>
        <div class="field">
          <label for="reg-p">密码（至少 8 位）</label>
          <input id="reg-p" v-model="password" class="input" type="password" autocomplete="new-password" />
        </div>
        <div class="field">
          <label for="reg-p2">确认密码</label>
          <input id="reg-p2" v-model="password2" class="input" type="password" autocomplete="new-password" />
        </div>
        <div class="field" style="margin-bottom: 0">
          <label for="reg-o">组织者邀请码（可选）</label>
          <input
            id="reg-o"
            v-model="organizerCode"
            class="input"
            autocomplete="off"
            placeholder="仅组织者需要，与活动邀请码不同"
          />
        </div>
      </div>

      <button type="button" class="btn btn-primary" :disabled="loading" @click="submit">
        {{ loading ? '注册中…' : '注册并登录' }}
      </button>

      <p class="muted" style="margin-top: 20px; text-align: center">
        已有账号？
        <router-link to="/login">去登录</router-link>
      </p>
    </div>
  </div>
</template>
