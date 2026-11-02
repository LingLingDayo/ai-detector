<script setup lang="ts">
import { X } from "@lucide/vue";
import type { ProbeStepItem } from "../../types";

withDefaults(
  defineProps<{
    steps: ProbeStepItem[];
    activeIndex: number;
    title?: string;
  }>(),
  {
    title: "探针题目与模型回答详情",
  }
);

const emit = defineEmits<{
  (e: "selectStep", index: number): void;
  (e: "close"): void;
}>();
</script>

<template>
  <div class="probe-modal-header">
    <div class="header-left">
      <h3 :id="`modal-title-${activeIndex}`" class="probe-modal-title">
        {{ title }}
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
          <span class="tab-label">测试 {{ idx + 1 }}</span>
          <span class="tab-dot"></span>
        </button>
      </div>
    </div>
    <button
      type="button"
      class="modal-close-btn"
      title="关闭弹窗"
      @click="emit('close')"
    >
      <X :size="18" />
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
  background: var(--bg-elevated-strong);

  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;

    .probe-modal-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .step-nav-tabs {
      display: flex;
      gap: 4px;
      background: var(--bg-inset-strong);
      padding: 2px 3px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);

      .step-tab-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: 24px;
        padding: 0 8px;
        line-height: 1;
        border-radius: calc(var(--radius-sm) - 2px);
        border: 1px solid transparent;
        background: transparent;
        color: var(--text-muted);
        font-size: 12px;
        cursor: pointer;
        transition: all var(--transition-fast);

        .tab-index {
          font-weight: 700;
          line-height: 1;
        }

        .tab-label {
          line-height: 1;
        }

        .tab-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
          opacity: 0.4;
          flex-shrink: 0;
        }

        &:hover {
          color: var(--text-primary);
          background: var(--overlay-soft);
        }


        &.active {
          background: var(--bg-segment-active);
          border-color: var(--border-segment-active);
          color: var(--text-segment-active);
          box-shadow: var(--shadow-segment-active);

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
      background: var(--overlay-medium);
    }
  }
}
</style>
