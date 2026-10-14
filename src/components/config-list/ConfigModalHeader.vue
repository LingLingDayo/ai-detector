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
      <div>
        <h3>配置列表</h3>
        <p class="header-subtitle">管理、切换及编辑您的所有 API 接口与密钥配置</p>
      </div>
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
  background: rgba(18, 24, 38, 0.95);

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;

    .title-icon {
      width: 34px;
      height: 34px;
      border-radius: var(--radius-sm);
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #818cf8;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    h3 {
      font-size: 0.98rem;
      font-weight: 600;
      color: #fff;
    }

    .header-subtitle {
      font-size: 0.74rem;
      color: var(--text-muted);
      margin-top: 1px;
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
      height: 26px;
      padding: 0 10px;
      font-size: 0.78rem;
      line-height: 1;

      svg {
        display: block;
        flex-shrink: 0;
      }

      span {
        display: inline-flex;
        align-items: center;
        line-height: 1;
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
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }
    }
  }
}
</style>
