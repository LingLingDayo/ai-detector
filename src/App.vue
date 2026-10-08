<script setup lang="ts">
import { onMounted } from "vue";
import { useConfig } from "./composables/useConfig";
import { useProbeTest } from "./composables/useProbeTest";
import AppHeader from "./components/AppHeader.vue";
import ConfigCard from "./components/ConfigCard.vue";
import ConfigListModal from "./components/ConfigListModal.vue";
import ConfigEditModal from "./components/ConfigEditModal.vue";
import ProgressCard from "./components/ProgressCard.vue";
import ResultCard from "./components/ResultCard.vue";

const {
  config,
  configList,
  activeConfigId,
  activeConfigName,
  configListCount,
  isPasswordVisible,
  isAdvancedOpen,
  isConfigListModalOpen,
  isConfigEditModalOpen,
  configEditModalMode,
  editingConfigItem,
  settingsSummary,
  hasCurrentInput,
  canSaveCurrent,
  togglePasswordVisibility,
  openConfigListModal,
  closeConfigListModal,
  openSaveCurrentModal,
  openCreateConfigModal,
  openEditConfigModal,
  closeConfigEditModal,
  loadConfig,
  resetConfig,
  applyConfig,
  handleSaveConfigItem,
  deleteConfigItem,
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
  refreshQuestions,
  refreshSingleQuestion,
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
        :active-config-name="activeConfigName"
        :config-list-count="configListCount"
        :is-running="isRunning"
        :is-password-visible="isPasswordVisible"
        :is-advanced-open="isAdvancedOpen"
        :settings-summary="settingsSummary"
        @toggle-password="togglePasswordVisibility"
        @update:is-advanced-open="(v) => (isAdvancedOpen = v)"
        @submit="() => startTest(config)"
        @reset="handleResetConfig"
        @open-save-config="openSaveCurrentModal"
        @open-config-list="openConfigListModal"
      />

      <!-- 探测题目与测试进度卡片（默认展示） -->
      <ProgressCard
        :visible="true"
        :title="statusTitle"
        :desc="statusDesc"
        :percent="progressPercent"
        :completed-count="completedCount"
        :total-count="totalCount"
        :steps="steps"
        :status-alert="statusAlert"
        :is-running="isRunning"
        :has-started="hasStarted"
        @refresh-questions="refreshQuestions"
        @refresh-single-question="refreshSingleQuestion"
      />

      <!-- 归因诊断报告卡片 -->
      <ResultCard :analysis="analysisResult" />
    </main>

    <!-- 配置列表弹窗 -->
    <ConfigListModal
      :is-open="isConfigListModalOpen"
      :configs="configList"
      :active-config-id="activeConfigId"
      :can-save-current="canSaveCurrent"
      @close="closeConfigListModal"
      @apply="applyConfig"
      @open-create="openCreateConfigModal"
      @open-edit="openEditConfigModal"
      @open-save-current="openSaveCurrentModal"
      @delete="deleteConfigItem"
    />

    <!-- 添加 / 编辑 / 保存当前配置弹窗 -->
    <ConfigEditModal
      :is-open="isConfigEditModalOpen"
      :mode="configEditModalMode"
      :initial-data="editingConfigItem"
      @close="closeConfigEditModal"
      @save="handleSaveConfigItem"
    />
  </div>
</template>

<style lang="scss" scoped>
.app-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 12px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.app-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}
</style>


