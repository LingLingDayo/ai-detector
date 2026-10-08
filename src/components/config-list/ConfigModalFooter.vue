<script setup lang="ts">
const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <div class="modal-footer list-footer">
    <span class="footer-tip">
      💡 点击「使用配置」即可一键将该预设切换至主探测面板
    </span>
    <button type="button" class="btn btn-ghost" @click="emit('close')">
      关闭
    </button>
  </div>
</template>

<style lang="scss" scoped>
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(18, 24, 38, 0.95);

  .footer-tip {
    font-size: 0.72rem;
    color: var(--text-muted);
  }
}
</style>
