import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/client.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isLoggedIn = computed(() => !!token.value)

  function setSession(t, u) {
    token.value = t
    user.value = u
    if (t) localStorage.setItem('token', t)
    else localStorage.removeItem('token')
    if (u) localStorage.setItem('user', JSON.stringify(u))
    else localStorage.removeItem('user')
  }

  async function login(username, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { username, password },
    })
    setSession(data.token, data.user)
    return data.user
  }

  async function register(payload) {
    const data = await api('/auth/register', {
      method: 'POST',
      body: payload,
    })
    setSession(data.token, data.user)
    return data.user
  }

  function logout() {
    setSession('', null)
  }

  /** 从服务端同步用户（含 is_super_admin、account_status） */
  async function refreshProfile() {
    if (!token.value) return null
    try {
      const me = await api('/users/me')
      user.value = me
      localStorage.setItem('user', JSON.stringify(me))
      return me
    } catch {
      return null
    }
  }

  const isSuperAdmin = computed(() => !!user.value?.is_super_admin)

  return {
    token,
    user,
    isLoggedIn,
    isSuperAdmin,
    login,
    register,
    logout,
    setSession,
    refreshProfile,
  }
})
