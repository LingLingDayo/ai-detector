<script setup lang="ts">
import type { ProbeStepItem } from "../../types";

defineProps<{
  steps: ProbeStepItem[];
  activeIndex: number;
}>();

const emit = defineEmits<{
  (e: "selectStep", index: number): void;
  (e: "close"): void;
}>();
</script>

<template>
  <div class="probe-modal-header">
    <div class="header-left">
      <h3 :id="`modal-title-${activeIndex}`" class="probe-modal-title">
        探针题目与模型回答详情
      </h3>
      <div class="step-nav-tabs">
        <button
          v-for="(stepItem, idx) in steps"
          :key="stepItem.id"
          type="button"
          class="step-tab-btn"
          :class="{
            active: idx === activeIndex,
            working: stepItem.state === 'working',
            done: stepItem.state === 'done',
            error: stepItem.state === 'error',
          }"
          @click="emit('selectStep', idx)"
        >
          <span class="tab-index">{{ idx + 1 }}</span>
          <span class="tab-label">挑战 {{ idx + 1 }}</span>
          <span class="tab-dot"></span>
        </button>
      </div>
    </div>
    <button
      type="button"
      class="modal-close-btn"
      title="关闭弹窗 (Esc)"
      @click="emit('close')"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.probe-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(17, 23, 34, 0.85);

  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;

    .probe-modal-title {
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .step-nav-tabs {
      display: flex;
      gap: 4px;
      background: rgba(10, 14, 22, 0.6);
      padding: 2px 3px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);

      .step-tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8px;
        border-radius: calc(var(--radius-sm) - 2px);
        border: 1px solid transparent;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.72rem;
        cursor: pointer;
        transition: all var(--transition-fast);

        .tab-index {
          font-weight: 700;
        }

        .tab-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
          opacity: 0.4;
        }

        &:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.05);
        }

        &.active {
          background: var(--bg-card);
          border-color: var(--accent-primary);
          color: #fff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);

          .tab-dot {
            background: var(--accent-primary);
            opacity: 1;
            box-shadow: 0 0 6px var(--accent-primary);
          }
        }

        &.done .tab-dot {
          background: var(--success);
          opacity: 1;
        }

        &.working .tab-dot {
          background: var(--accent-primary);
          opacity: 1;
          animation: pulse 1.2s infinite;
        }

        &.error .tab-dot {
          background: var(--danger);
          opacity: 1;
        }
      }
    }
  }

  .modal-close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);

    &:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.08);
    }
  }
}
</style>
