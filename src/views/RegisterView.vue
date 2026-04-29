<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { ApiError } from '../api/client.js'
import AppPageShell from '../components/AppPageShell.vue'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const password2 = ref('')
const displayName = ref('')
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
    await auth.register({
      username: username.value.trim(),
      password: password.value,
      display_name: displayName.value.trim(),
    })
    router.replace({ name: 'home' })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '注册失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppPageShell :show-nav="false">
    <div class="content content--auth stack stack--md">
      <h1 class="headline">注册</h1>
      <p class="subhead subhead--flush">注册后可发起自己的签到活动，也可参与他人活动。</p>

      <div v-if="error" class="banner-error">{{ error }}</div>

      <div class="card card-pad">
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
        <div class="field field--flush">
          <label for="reg-p2">确认密码</label>
          <input id="reg-p2" v-model="password2" class="input" type="password" autocomplete="new-password" />
        </div>
      </div>

      <button type="button" class="btn btn-primary" :disabled="loading" @click="submit">
        {{ loading ? '注册中…' : '注册并登录' }}
      </button>

      <p class="muted text-caption text-center">
        已有账号？
        <router-link to="/login">去登录</router-link>
      </p>
    </div>
  </AppPageShell>
</template>
