<script setup lang="ts">
defineProps<{
  activeIndex: number;
  totalSteps: number;
}>();

const emit = defineEmits<{
  (e: "selectStep", index: number): void;
  (e: "close"): void;
}>();
</script>

<template>
  <div class="probe-modal-footer">
    <div class="footer-shortcuts-hint">
      <span>支持使用键盘 <strong>← / →</strong> 键快速切换题目，<strong>Esc</strong> 键关闭</span>
    </div>
    <div class="footer-actions">
      <button
        type="button"
        class="btn btn-secondary modal-footer-btn"
        :disabled="activeIndex === 0"
        @click="emit('selectStep', activeIndex - 1)"
      >
        上一题
      </button>
      <button
        type="button"
        class="btn btn-secondary modal-footer-btn"
        :disabled="activeIndex >= totalSteps - 1"
        @click="emit('selectStep', activeIndex + 1)"
      >
        下一题
      </button>
      <button
        type="button"
        class="btn btn-primary modal-footer-btn"
        @click="emit('close')"
      >
        关闭
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.probe-modal-footer {
  padding: 10px 18px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(17, 23, 34, 0.75);
  display: flex;
  justify-content: space-between;
  align-items: center;

  .footer-shortcuts-hint {
    font-size: 0.7rem;
    color: var(--text-muted);

    strong {
      color: var(--text-secondary);
    }
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    .modal-footer-btn {
      padding: 5px 14px;
      font-size: 0.76rem;
    }
  }
}
</style>
