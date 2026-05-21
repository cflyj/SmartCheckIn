<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { ApiError } from '../api/client.js'
import AppPageShell from '../components/AppPageShell.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const password2 = ref('')
const displayName = ref('')
const inviteCode = ref('')
/** @type {import('vue').Ref<'student'|'teacher'>} */
const registrationIdentity = ref('student')

watch(
  () => route.query.identity,
  (id) => {
    if (id === 'teacher') registrationIdentity.value = 'teacher'
    else if (id === 'student') registrationIdentity.value = 'student'
  },
  { immediate: true }
)

const loading = ref(false)
const error = ref('')

function goBackToLogin() {
  const q = {}
  if (registrationIdentity.value === 'teacher') q.portal = 'teacher'
  else q.portal = 'student'
  router.push({ name: 'login', query: q })
}

function setIdentity(id) {
  if (id === 'student' || id === 'teacher') registrationIdentity.value = id
}

function onIdentityKeydown(e) {
  const ids = ['student', 'teacher']
  const i = ids.indexOf(registrationIdentity.value)
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    if (i < ids.length - 1) setIdentity(ids[i + 1])
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (i > 0) setIdentity(ids[i - 1])
  }
}

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
      registration_identity: registrationIdentity.value,
      invite_code: inviteCode.value.trim(),
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
  <AppPageShell nav-title="注册账号" :show-nav="true" @back="goBackToLogin">
    <div class="content content--auth content--auth-with-nav stack stack--md">
      <div class="login-brand register-brand">
        <div class="login-brand__mark" aria-hidden="true">✓</div>
        <div class="login-brand__text">
          <h1 class="headline">创建账号</h1>
          <p class="register-tagline">使用邀请码加入 SmartCheckIn</p>
        </div>
      </div>

      <p class="subhead subhead--flush register-intro">
        请选择身份并填写邀请码。管理员账号由平台预先配置，不提供自助注册。
      </p>

      <div v-if="error" class="banner-error" role="alert">{{ error }}</div>

      <div
        class="login-portal-tabs register-identity-tabs"
        role="tablist"
        aria-label="选择注册身份"
        @keydown="onIdentityKeydown"
      >
        <button
          type="button"
          class="login-portal-tabs__btn"
          :class="{ 'login-portal-tabs__btn--active': registrationIdentity === 'student' }"
          role="tab"
          :aria-selected="registrationIdentity === 'student'"
          @click="setIdentity('student')"
        >
          学生
        </button>
        <button
          type="button"
          class="login-portal-tabs__btn"
          :class="{ 'login-portal-tabs__btn--active': registrationIdentity === 'teacher' }"
          role="tab"
          :aria-selected="registrationIdentity === 'teacher'"
          @click="setIdentity('teacher')"
        >
          老师
        </button>
      </div>
      <p class="login-portal-scope register-identity-hint" aria-live="polite">
        <template v-if="registrationIdentity === 'student'">
          参与签到与活动；邀请码向<strong>老师</strong>索取（在「我发起的活动」中生成）。
        </template>
        <template v-else>
          发起与管理签到；邀请码仅由<strong>平台管理员</strong>在「平台治理 → 概览」中发放。
        </template>
      </p>

      <div class="card card-pad stack stack--sm register-form-card" role="tabpanel">
        <div class="field">
          <label for="reg-inv">邀请码</label>
          <input
            id="reg-inv"
            v-model="inviteCode"
            class="input"
            autocomplete="off"
            placeholder="向老师或管理员索取"
          />
        </div>

        <div class="field">
          <label for="reg-u">用户名</label>
          <input id="reg-u" v-model="username" class="input" autocomplete="username" placeholder="2～32 位字母、数字、下划线或中文" />
        </div>
        <div class="field">
          <label for="reg-d">显示名称</label>
          <input id="reg-d" v-model="displayName" class="input" autocomplete="name" placeholder="例如：张三" />
        </div>
        <div class="field">
          <label for="reg-p">密码</label>
          <input
            id="reg-p"
            v-model="password"
            class="input"
            type="password"
            autocomplete="new-password"
            placeholder="至少 8 位"
          />
        </div>
        <div class="field field--flush">
          <label for="reg-p2">确认密码</label>
          <input
            id="reg-p2"
            v-model="password2"
            class="input"
            type="password"
            autocomplete="new-password"
            placeholder="再次输入密码"
            @keyup.enter="submit"
          />
        </div>
      </div>

      <button type="button" class="btn btn-primary btn--register-submit" :disabled="loading" @click="submit">
        {{ loading ? '注册中…' : '注册并登录' }}
      </button>

      <p class="muted text-caption text-center register-footer">
        已有账号？
        <router-link class="register-footer__link" :to="{ name: 'login', query: registrationIdentity === 'teacher' ? { portal: 'teacher' } : { portal: 'student' } }">
          返回登录
        </router-link>
      </p>
    </div>
  </AppPageShell>
</template>

<style scoped>
.register-brand {
  margin-bottom: 0;
}

.register-intro {
  color: var(--ios-secondary);
  font-size: 15px;
  line-height: var(--line-relaxed);
  margin: 0;
}

.register-identity-tabs {
  margin-top: var(--space-3);
  margin-bottom: 0;
}

.register-identity-hint {
  margin-bottom: var(--space-2);
}

.register-form-card {
  box-shadow: var(--shadow-card);
}

.btn--register-submit {
  min-height: 48px;
  font-size: 17px;
  font-weight: 600;
}

.register-footer {
  margin-bottom: 0;
}

.register-footer__link {
  font-weight: 600;
  color: var(--ios-blue);
  text-decoration: none;
}

.register-footer__link:hover {
  text-decoration: underline;
}
</style>
