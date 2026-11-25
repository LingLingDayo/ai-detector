<script setup lang="ts">
import { FolderPlus, List, Plus, X } from "@lucide/vue";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "openCreate"): void;
  (e: "openCreateGroup"): void;
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
        class="btn-secondary-action"
        @click="emit('openCreateGroup')"
        title="新建一个配置分组"
      >
        <FolderPlus :size="14" />
        <span>新建分组</span>
      </button>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        @click="emit('openCreate')"
        title="添加一条新的配置"
      >
        <Plus :size="14" />
        <span>添加配置</span>
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
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-header);
  flex-shrink: 0;

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;

    .title-icon {
      width: 30px;
      height: 30px;
      border-radius: var(--radius-sm);
      background: rgba(var(--accent-rgb), 0.15);
      border: 1px solid rgba(var(--accent-rgb), 0.3);
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
      margin: 0;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;

    .btn-secondary-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 32px;
      padding: 0 11px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1;
      font-family: inherit;
      color: var(--text-primary);
      background: var(--bg-surface-control);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
      white-space: nowrap;

      svg {
        display: block;
        flex-shrink: 0;
        color: var(--accent-icon);
      }

      &:hover {
        color: var(--accent-text);
        background: var(--bg-surface-control-hover);
        border-color: var(--border-surface-control-hover);
      }

      &:active {
        background: var(--bg-surface-control-active);
      }
    }

    .btn-sm {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 32px;
      padding: 0 12px;
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;

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
