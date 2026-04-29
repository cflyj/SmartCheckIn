<script setup>
/**
 * 统一「加载 / 报错 / 成功内容」三件事的展示骨架，与各页业务区域组合使用。
 * 不包含顶栏与其它固定提示（如复制失败的辅助说明）。
 */
defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  loadingLabel: { type: String, default: '加载中…' },
})
</script>

<template>
  <template v-if="loading">
    <div class="spinner-wrap muted" role="status" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>{{ loadingLabel }}</span>
    </div>
  </template>
  <div v-else-if="error" class="banner-error">{{ error }}</div>
  <slot v-else />
</template>
