<script setup lang="ts">
import { List, Plus, X } from "@lucide/vue";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "openCreate"): void;
}>();
</script>

<template>
  <div class="modal-header">
    <div class="header-left">
      <div class="title-icon">
        <List :size="18" />
      </div>
      <h3>配置列表</h3>
    </div>

    <div class="header-actions">
      <button
        type="button"
        class="btn btn-primary btn-sm"
        @click="emit('openCreate')"
        title="添加一条新的配置"
      >
        <Plus :size="14" />
        添加配置
      </button>
      <button
        type="button"
        class="btn-close"
        title="关闭弹窗 (Esc)"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-header);

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;

    .title-icon {
      width: 30px;
      height: 30px;
      border-radius: var(--radius-sm);
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: var(--accent-icon);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    h3 {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-strong);
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    .btn-sm {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 32px;
      padding: 0 12px;
      font-size: 12px;
      line-height: 1;

      svg {
        display: block;
        flex-shrink: 0;
      }
    }

    .btn-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      transition: all var(--transition-fast);

      svg {
        display: block;
        flex-shrink: 0;
      }

      &:hover {
        color: var(--text-strong);
        background: var(--overlay-medium);
      }
    }
  }
}
</style>
