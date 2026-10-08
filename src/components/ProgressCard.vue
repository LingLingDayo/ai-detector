<script setup lang="ts">
import { ref } from "vue";
import type { ProbeStepItem, StatusAlertInfo } from "../types";
import ProbeDetailModal from "./ProbeDetailModal.vue";

defineProps<{
  visible: boolean;
  title: string;
  desc: string;
  percent: number;
  completedCount: number;
  totalCount: number;
  steps: ProbeStepItem[];
  statusAlert: StatusAlertInfo | null;
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
        <h2 id="progress-title">{{ title }}</h2>
        <span class="progress-status-desc" id="progress-status-desc">{{ desc }}</span>
      </div>
      <div class="progress-numeric">
        <span id="progress-percent">{{ percent }}%</span>
        <small id="progress-count-text">完成 {{ completedCount }}/{{ totalCount }} 题</small>
      </div>
    </div>

    <div class="progress-bar-track">
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
            <strong>挑战 {{ idx + 1 }}</strong>
            <svg class="view-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </div>
          <span class="step-state">{{ step.stateText }}</span>
        </div>
        <div class="step-stat">{{ step.statText }}</div>
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
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 6px;

    .progress-title-wrap {
      h2 {
        font-size: 0.88rem;
        font-weight: 600;
        color: #fff;
        line-height: 1.2;
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
    border: 1px solid var(--border-subtle);

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

          .view-icon {
            color: var(--text-muted);
            opacity: 0.5;
            transition: opacity 0.2s, color 0.2s;
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

          .view-icon {
            opacity: 1;
            color: var(--accent-primary);
          }
        }
      }

      &.working {
        border-color: var(--accent-primary);
        background: rgba(99, 102, 241, 0.08);

        .step-badge {
          background: var(--accent-primary);
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
          color: #fff;
        }

        .step-state {
          color: var(--danger);
        }
      }
    }
  }

  .status-alert {
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.76rem;

    &.error {
      background: var(--danger-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }
  }
}
</style>
