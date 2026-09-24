<script setup lang="ts">
import { onMounted } from "vue";
import { useConfig } from "./composables/useConfig";
import { useProbeTest } from "./composables/useProbeTest";
import AppHeader from "./components/AppHeader.vue";
import ConfigCard from "./components/ConfigCard.vue";
import ProgressCard from "./components/ProgressCard.vue";
import ResultCard from "./components/ResultCard.vue";

const {
  config,
  isPasswordVisible,
  isAdvancedOpen,
  saveTipText,
  isSaveTipActive,
  settingsSummary,
  togglePasswordVisibility,
  loadConfig,
  resetConfig,
} = useConfig();

const {
  isRunning,
  hasStarted,
  progressPercent,
  completedCount,
  totalCount,
  statusTitle,
  statusDesc,
  steps,
  statusAlert,
  analysisResult,
  startTest,
  resetTest,
} = useProbeTest();

onMounted(() => {
  loadConfig();
});

function handleResetConfig(): void {
  resetConfig();
  resetTest();
}
</script>

<template>
  <div class="app-container">
    <!-- 顶部标题栏 -->
    <AppHeader />

    <!-- 主体区域 -->
    <main class="app-main">
      <!-- 参数配置卡片 -->
      <ConfigCard
        :config="config"
        :is-running="isRunning"
        :is-password-visible="isPasswordVisible"
        :is-advanced-open="isAdvancedOpen"
        :save-tip-text="saveTipText"
        :is-save-tip-active="isSaveTipActive"
        :settings-summary="settingsSummary"
        @toggle-password="togglePasswordVisibility"
        @update:is-advanced-open="(v) => (isAdvancedOpen = v)"
        @submit="() => startTest(config)"
        @reset="handleResetConfig"
      />

      <!-- 探测进度卡片 -->
      <ProgressCard
        :visible="hasStarted"
        :title="statusTitle"
        :desc="statusDesc"
        :percent="progressPercent"
        :completed-count="completedCount"
        :total-count="totalCount"
        :steps="steps"
        :status-alert="statusAlert"
      />

      <!-- 归因诊断报告卡片 -->
      <ResultCard :analysis="analysisResult" />
    </main>
  </div>
</template>

