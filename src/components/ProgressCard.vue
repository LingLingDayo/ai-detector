<script setup lang="ts">
import { ref } from "vue";
import { RefreshCw } from "@lucide/vue";
import type { ProbeStepItem, StatusAlertInfo } from "../types";
import ProbeDetailModal from "./ProbeDetailModal.vue";

const props = withDefaults(
  defineProps<{
    visible?: boolean;
    title: string;
    desc: string;
    percent: number;
    completedCount: number;
    totalCount: number;
    steps: ProbeStepItem[];
    statusAlert: StatusAlertInfo | null;
    isRunning?: boolean;
    hasStarted?: boolean;
  }>(),
  {
    visible: true,
    isRunning: false,
    hasStarted: false,
  }
);

const emit = defineEmits<{
  (e: "refreshQuestions"): void;
  (e: "refreshSingleQuestion", index: number): void;
  (e: "retrySingleQuestion", index: number): void;
}>();

const selectedIndex = ref<number>(0);
const isModalOpen = ref(false);

function openDetail(idx: number): void {
  selectedIndex.value = idx;
  isModalOpen.value = true;
}

function closeModal(): void {
  isModalOpen.value = false;
}
</script>

<template>
  <section v-if="visible" class="card progress-card" id="progress-section">
    <div class="progress-header">
      <div class="progress-title-wrap">
        <div class="title-row">
          <h2 id="progress-title">{{ title }}</h2>
          <button
            type="button"
            class="btn-refresh-icon"
            :disabled="isRunning"
            title="重新随机抽取一组题目 (3 道不同测试题目)"
            @click="emit('refreshQuestions')"
          >
            <RefreshCw :size="13" />
          </button>
        </div>
        <span class="progress-status-desc" id="progress-status-desc">{{ desc }}</span>
      </div>
      <div v-if="hasStarted" class="progress-numeric">
        <span id="progress-percent">{{ percent }}%</span>
        <small id="progress-count-text">完成 {{ completedCount }}/{{ totalCount }} 题</small>
      </div>
    </div>

    <div class="progress-bar-track" :class="{ 'has-border': hasStarted }">
      <div
        class="progress-bar-fill"
        id="progress-bar-fill"
        :style="{ width: `${percent}%` }"
      ></div>
    </div>

    <div class="probe-steps-grid" id="probe-steps">
      <div
        v-for="(step, idx) in steps"
        :key="step.id"
        class="probe-step clickable"
        :class="step.state"
        :id="`step-${idx}`"
        title="点击查看抽取的题目与模型回答"
        @click="openDetail(idx)"
      >
        <div class="step-badge">{{ idx + 1 }}</div>
        <div class="step-info">
          <div class="step-title-row">
            <strong>测试 {{ idx + 1 }}</strong>
          </div>
          <span class="step-state">{{ step.stateText }}</span>
        </div>
        <div class="step-stat">{{ step.statText }}</div>
        <button
          v-if="step.state === 'error'"
          type="button"
          class="btn-step-retry"
          :disabled="isRunning"
          title="手动重试本题"
          aria-label="手动重试本题"
          @click.stop="emit('retrySingleQuestion', idx)"
        >
          <RefreshCw :size="13" />
        </button>
      </div>
    </div>

    <div
      v-if="statusAlert"
      class="status-alert"
      :class="statusAlert.type"
      id="status-alert"
    >
      {{ statusAlert.message }}
    </div>

    <!-- 题目内容与模型回答弹窗 -->
    <ProbeDetailModal
      :is-open="isModalOpen"
      :steps="steps"
      :initial-index="selectedIndex"
      :is-running="isRunning"
      @refresh-single-question="(idx) => emit('refreshSingleQuestion', idx)"
      @retry-single-question="(idx) => emit('retrySingleQuestion', idx)"
      @close="closeModal"
    />
  </section>
</template>

<style lang="scss" scoped>
.progress-card {
  position: relative;
  z-index: 20;
  border-color: rgba(99, 102, 241, 0.3);
  animation: fadeIn var(--transition-normal);
  padding: 10px 14px;

  .progress-header {
    height: 36px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 6px;

    .progress-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;

      .title-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      h2 {
        font-size: 0.88rem;
        font-weight: 600;
        color: #fff;
        line-height: 1.2;
      }

      .btn-refresh-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 2px;
        border-radius: var(--radius-sm);
        transition: color var(--transition-fast), transform var(--transition-fast);

        &:hover:not(:disabled) {
          color: var(--text-primary);
          transform: rotate(45deg);
        }

        &:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
      }

      .progress-status-desc {
        font-size: 0.72rem;
        color: var(--text-secondary);
        line-height: 1.2;
      }
    }

    .progress-numeric {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;

      span {
        font-size: 1.1rem;
        font-weight: 700;
        background: var(--accent-gradient);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        line-height: 1.1;
      }

      small {
        font-size: 0.68rem;
        color: var(--text-muted);
      }
    }
  }

  .progress-bar-track {
    width: 100%;
    height: 5px;
    background: var(--bg-input);
    border-radius: 9999px;
    overflow: hidden;
    margin-bottom: 8px;
    border: 1px solid transparent;
    transition: border-color var(--transition-normal);

    &.has-border {
      border-color: var(--border-subtle);
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--accent-gradient);
      border-radius: 9999px;
      transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
    }
  }

  .probe-steps-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;

    .probe-step {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: rgba(17, 23, 34, 0.5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      transition: all var(--transition-normal);

      .step-badge {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.68rem;
        font-weight: 700;
        line-height: 1;
        background: var(--bg-input);
        color: var(--text-muted);
        border: 1px solid var(--border-subtle);
        flex-shrink: 0;
      }

      .step-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;

        .step-title-row {
          display: flex;
          align-items: center;
          gap: 4px;

          strong {
            font-size: 0.76rem;
            color: var(--text-primary);
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }

        .step-state {
          font-size: 0.66rem;
          color: var(--text-muted);
          line-height: 1.2;
        }
      }

      .step-stat {
        font-size: 0.68rem;
        font-weight: 600;
        color: var(--text-muted);
        flex-shrink: 0;
      }

      &.clickable {
        cursor: pointer;
        user-select: none;
        transition: all var(--transition-fast);

        &:hover {
          transform: translateY(-1.5px);
          border-color: var(--accent-primary);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
        }
      }

      &.working {
        border-color: var(--accent-primary);
        background: rgba(99, 102, 241, 0.08);

        .step-badge {
          background: var(--accent-primary);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 0 6px rgba(99, 102, 241, 0.5);
        }

        .step-state {
          color: var(--accent-primary);
        }
      }

      &.done {
        border-color: rgba(16, 185, 129, 0.4);
        background: rgba(16, 185, 129, 0.06);

        .step-badge {
          background: var(--success);
          border-color: transparent;
          color: #fff;
        }

        .step-state,
        .step-stat {
          color: var(--success);
        }
      }

      &.error {
        border-color: rgba(239, 68, 68, 0.4);
        background: rgba(239, 68, 68, 0.06);

        .step-badge {
          background: var(--danger);
          border-color: transparent;
          color: #fff;
        }

        .step-state {
          color: var(--danger);
        }

        .btn-step-retry {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: #f87171;
          cursor: pointer;
          padding: 2px;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
          transition: all var(--transition-fast);

          &:hover:not(:disabled) {
            background: transparent;
            color: #fca5a5;
            transform: rotate(90deg);
          }

          &:disabled {
            opacity: 0.35;
            cursor: not-allowed;
          }
        }
      }

      &.cancelled {
        border-color: rgba(245, 158, 11, 0.4);
        background: rgba(245, 158, 11, 0.06);

        .step-badge {
          background: rgba(245, 158, 11, 0.2);
          border-color: rgba(245, 158, 11, 0.4);
          color: #fbbf24;
        }

        .step-state,
        .step-stat {
          color: #fbbf24;
        }
      }
    }
  }

  .status-alert {
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.76rem;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;

    &.error {
      background: var(--danger-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }
  }
}
</style>
