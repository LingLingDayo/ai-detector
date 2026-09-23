<script setup lang="ts">
import type { ProbeStepItem, StatusAlertInfo } from "../types";

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
        class="probe-step"
        :class="step.state"
        :id="`step-${idx}`"
        :title="`挑战 ${idx + 1}：约 300 位无语义长整数生成探针`"
      >
        <div class="step-badge">{{ idx + 1 }}</div>
        <div class="step-info">
          <strong>挑战 {{ idx + 1 }}</strong>
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
  </section>
</template>
