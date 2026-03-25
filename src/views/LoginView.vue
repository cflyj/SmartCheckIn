<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { ApiError } from '../api/client.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    const redir = route.query.redirect
    if (typeof redir === 'string' && redir.startsWith('/')) {
      router.replace(redir)
    } else {
      router.replace({ name: 'home' })
    }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="content" style="padding-top: calc(24px + var(--safe-top))">
      <h1 class="headline">SmartCheckIn</h1>
      <p class="subhead">登录后可发起签到活动，也可参与他人活动。</p>

      <div v-if="error" class="banner-error">{{ error }}</div>

      <div class="card card-pad" style="margin-bottom: 24px">
        <div class="field">
          <label for="u">用户名</label>
          <input id="u" v-model="username" class="input" autocomplete="username" placeholder="organizer 或 alice" />
        </div>
        <div class="field" style="margin-bottom: 0">
          <label for="p">密码</label>
          <input
            id="p"
            v-model="password"
            class="input"
            type="password"
            autocomplete="current-password"
            placeholder="演示：organizer123 / alice123"
            @keyup.enter="submit"
          />
        </div>
      </div>

      <button type="button" class="btn btn-primary" :disabled="loading" @click="submit">
        {{ loading ? '登录中…' : '登录' }}
      </button>

      <button
        type="button"
        class="btn btn-secondary"
        style="margin-top: 12px"
        @click="router.push({ name: 'register' })"
      >
        没有账号？注册
      </button>

      <p class="muted" style="margin-top: 24px; text-align: center; font-size: 13px">
        数据在服务器本地 SQLite（<code>server/app.db</code>）。演示账号：<code>organizer</code>/<code>organizer123</code>、
        <code>alice</code>/<code>alice123</code>；演示组织加入码：<code>DEMO2026</code>（空库种子自动创建）
      </p>
    </div>
  </div>
</template>
