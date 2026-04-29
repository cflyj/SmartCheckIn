<script setup>
/**
 * 统一外壳：一页一层 `.page`，顶栏可选（访客页 / 无前栏页可关掉）。
 */
import AppNavBar from './AppNavBar.vue'

defineProps({
  /** 为 false 时不渲染 AppNavBar（如登录注册） */
  showNav: { type: Boolean, default: true },
  navTitle: { type: String, default: '' },
  /** 传给 AppNavBar */
  showBack: { type: Boolean, default: true },
  /** 追加在 `.page` 上，例如 `page--home` */
  pageClass: { type: [String, Array, Object], default: '' },
})

defineEmits(['back'])
</script>

<template>
  <div class="page" :class="pageClass">
    <AppNavBar
      v-if="showNav"
      :title="navTitle"
      :show-back="showBack"
      @back="$emit('back')"
    >
      <template #right>
        <slot name="nav-right" />
      </template>
    </AppNavBar>
    <slot />
  </div>
</template>
