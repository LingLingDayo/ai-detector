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

const selectedStep = ref<ProbeStepItem | null>(null);
const selectedIndex = ref<number>(0);
const isModalOpen = ref(false);

function openDetail(step: ProbeStepItem, idx: number): void {
  selectedStep.value = step;
  selectedIndex.value = idx;
  isModalOpen.value = true;
}

function closeModal(): void {
  isModalOpen.value = false;
  selectedStep.value = null;
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
        title="点击查看题目详情与模型回答"
        @click="openDetail(step, idx)"
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

    <!-- 题目内容与回答弹窗 -->
    <ProbeDetailModal
      :is-open="isModalOpen"
      :step="selectedStep"
      :step-index="selectedIndex"
      @close="closeModal"
    />
  </section>
</template>
