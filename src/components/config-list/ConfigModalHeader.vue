<script setup lang="ts">
const emit = defineEmits<{
  (e: "close"): void;
  (e: "openCreate"): void;
}>();
</script>

<template>
  <div class="modal-header">
    <div class="header-left">
      <div class="title-icon">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
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
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        添加配置
      </button>
      <button
        type="button"
        class="btn-close"
        title="关闭弹窗 (Esc)"
        @click="emit('close')"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
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
