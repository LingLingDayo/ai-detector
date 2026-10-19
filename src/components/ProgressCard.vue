<script setup lang="ts">
import { ref, computed } from "vue";
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
    hasFingerprintUpdate?: boolean;
    isUpdatingFingerprint?: boolean;
  }>(),
  {
    visible: true,
    isRunning: false,
    hasStarted: false,
    hasFingerprintUpdate: false,
    isUpdatingFingerprint: false,
  }
);

const emit = defineEmits<{
  (e: "refreshQuestions"): void;
  (e: "refreshSingleQuestion", index: number): void;
  (e: "retrySingleQuestion", index: number): void;
  (e: "updateFingerprint"): void;
}>();

const alertLines = computed<string[]>(() => {
  if (!props.statusAlert?.message) return [];
  return props.statusAlert.message
    .split("\n")
    .map((line) => line.trim().replace(/[;；]$/, ""))
    .filter(Boolean);
});

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

      <div class="progress-header-right">
        <!-- 更新指纹库按钮（文案仅为“更新”） -->
        <button
          v-if="hasFingerprintUpdate"
          type="button"
          class="btn-update-fingerprint"
          :disabled="isUpdatingFingerprint || isRunning"
          title="检测到上游指纹题库有更新，点击立即同步"
          @click="emit('updateFingerprint')"
        >
          <RefreshCw
            v-if="isUpdatingFingerprint"
            :size="11"
            class="update-spin"
          />
          <span>更新</span>
        </button>

        <div v-if="hasStarted" class="progress-numeric">
          <span id="progress-percent">{{ percent }}%</span>
          <small id="progress-count-text">完成 {{ completedCount }}/{{ totalCount }} 题</small>
        </div>
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
            <RefreshCw
              v-if="step.state === 'working'"
              :size="10"
              class="step-running-icon"
            />
          </div>
          <span class="step-state">{{ step.stateText }}</span>
        </div>
        <div class="step-stat">{{ step.statText }}</div>
        <button
          v-if="step.state === 'error'"
          type="button"
          class="btn-step-retry"
          title="重试此题"
          aria-label="重试此题"
          @click.stop="emit('retrySingleQuestion', idx)"
        >
          <RefreshCw :size="13" />
        </button>
      </div>
    </div>

    <div
      v-if="statusAlert && alertLines.length > 0"
      class="status-alert"
      :class="statusAlert.type"
      id="status-alert"
    >
      <div
        v-for="(line, idx) in alertLines"
        :key="idx"
        class="status-alert-line"
      >
        {{ line }}
      </div>
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
    align-items: center;
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

    .progress-header-right {
      display: flex;
      align-items: center;
      gap: 12px;

      .btn-update-fingerprint {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: 24px;
        padding: 0 9px;
        font-size: 0.74rem;
        font-weight: 500;
        color: #e0e7ff;
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(168, 85, 247, 0.18));
        border: 1px solid rgba(129, 140, 248, 0.45);
        border-radius: var(--radius-sm, 6px);
        cursor: pointer;
        box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
        transition: all var(--transition-fast, 0.15s ease);
        user-select: none;
        line-height: 1;
        font-family: inherit;

        svg {
          display: block;
          flex-shrink: 0;
        }

        span {
          display: inline-flex;
          align-items: center;
          line-height: 1;
          transform: translateY(-0.5px);
        }

        &:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.42), rgba(168, 85, 247, 0.32));
          border-color: rgba(165, 180, 252, 0.85);
          color: #ffffff;
          box-shadow: 0 0 14px rgba(99, 102, 241, 0.45);
          transform: translateY(-1px);
        }

        &:active:not(:disabled) {
          transform: translateY(0);
        }

        &:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
        }

        .update-spin {
          animation: spin 1s linear infinite;
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

          .step-running-icon {
            color: var(--accent-primary);
            animation: spin 1s linear infinite;
            flex-shrink: 0;
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
    display: flex;
    flex-direction: column;
    gap: 4px;

    &.error {
      background: var(--danger-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }

    .status-alert-line {
      line-height: 1.45;
      word-break: break-word;
    }
  }
}
</style>
