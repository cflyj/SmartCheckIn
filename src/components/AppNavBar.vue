<script setup>
defineProps({
  title: { type: String, default: '' },
  showBack: { type: Boolean, default: true },
})
const emit = defineEmits(['back'])
</script>

<template>
  <header class="nav-bar">
    <div class="nav-bar__row">
      <button v-if="showBack" type="button" class="nav-bar__back" aria-label="返回" @click="emit('back')">
        ‹ 返回
      </button>
      <span class="nav-bar__title">{{ title }}</span>
      <slot name="right" />
    </div>
  </header>
</template>
