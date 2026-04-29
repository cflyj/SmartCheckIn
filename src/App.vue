<script setup>
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth.js'

const auth = useAuthStore()

onMounted(() => {
  if (auth.token) {
    auth.refreshProfile()
  }
})
</script>

<template>
  <RouterView />
</template>
