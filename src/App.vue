<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useConfig } from "./composables/useConfig";
import { useProbeTest } from "./composables/useProbeTest";
import { usePelicanTest } from "./composables/usePelicanTest";
import AppHeader from "./components/AppHeader.vue";
import ConfigCard from "./components/ConfigCard.vue";
import ConfigListModal from "./components/ConfigListModal.vue";
import ConfigEditModal from "./components/ConfigEditModal.vue";
import ConfirmModal from "./components/common/ConfirmModal.vue";
import ProgressCard from "./components/ProgressCard.vue";
import ResultCard from "./components/ResultCard.vue";
import PelicanTestCard from "./components/PelicanTestCard.vue";

const configCardRef = ref<InstanceType<typeof ConfigCard> | null>(null);
const activeMode = ref<"probe" | "pelican">("probe");

const {
  isRunning,
  hasStarted,
  hasResult: hasProbeResult,
  progressPercent,
  completedCount,
  totalCount,
  statusTitle,
  statusDesc,
  steps,
  statusAlert,
  analysisResult,
  startTest,
  cancelTest,
  resetTest,
  refreshQuestions,
  refreshSingleQuestion,
} = useProbeTest();

const {
  isPelicanRunning,
  pelicanSvg,
  pelicanContent,
  pelicanContentType,
  rawResponseText,
  durationMs,
  testedModel,
  errorMsg: pelicanErrorMsg,
  hasTested: hasPelicanTested,
  hasResult: hasPelicanResult,
  pelicanPrompt,
  setPelicanPrompt,
  resetPelicanPrompt,
  startPelicanTest,
  cancelPelicanTest,
  resetPelicanTest,
} = usePelicanTest();

const hasActiveResult = computed(() => {
  return activeMode.value === "probe" ? hasProbeResult.value : hasPelicanResult.value;
});

const {
  config,
  configList,
  activeConfigId,
  activeConfigName,
  isPasswordVisible,
  isAdvancedOpen,
  isConfigListModalOpen,
  isConfigEditModalOpen,
  configEditModalMode,
  editingConfigItem,
  settingsSummary,
  hasCurrentInput,
  canSaveCurrent,
  isConfigModified,
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
  swapConfigItems,
} = useConfig({
  onApply: () => {
    resetTest();
    resetPelicanTest();
    configCardRef.value?.resetModelList();
  },
});

onMounted(() => {
  loadConfig();
});

function handleCancelTest(): void {
  if (activeMode.value === "probe") {
    cancelTest();
  } else {
    cancelPelicanTest();
  }
}

function handleStartTest(): void {
  if (activeMode.value === "probe") {
    if (isRunning.value) {
      cancelTest();
      return;
    }
    startTest(config);
  } else {
    if (isPelicanRunning.value) {
      cancelPelicanTest();
      return;
    }
    startPelicanTest(config);
  }
}

async function handleResetConfig(): Promise<void> {
  const confirmed = await resetConfig();
  if (confirmed) {
    resetTest();
    resetPelicanTest();
    configCardRef.value?.resetModelList();
  }
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
        ref="configCardRef"
        :config="config"
        :active-config-name="activeConfigName"
        :is-running="isRunning"
        :is-pelican-running="isPelicanRunning"
        :active-mode="activeMode"
        :has-result="hasActiveResult"
        :is-password-visible="isPasswordVisible"
        :is-advanced-open="isAdvancedOpen"
        :settings-summary="settingsSummary"
        :is-config-modified="isConfigModified"
        @toggle-password="togglePasswordVisibility"
        @update:is-advanced-open="(v) => (isAdvancedOpen = v)"
        @update:active-mode="(v) => (activeMode = v)"
        @submit="handleStartTest"
        @cancel="handleCancelTest"
        @reset="handleResetConfig"
        @open-save-config="openSaveCurrentModal"
        @open-config-list="openConfigListModal"
      />

      <!-- 常规探测题目与测试进度卡片（常规模式展示） -->
      <template v-if="activeMode === 'probe'">
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

        <!-- 探测诊断报告卡片 -->
        <ResultCard :analysis="analysisResult" />
      </template>

      <!-- 鹈鹕测试模式卡片（点击鹈鹕测试后切换展示） -->
      <PelicanTestCard
        v-else-if="activeMode === 'pelican'"
        :is-running="isPelicanRunning"
        :svg="pelicanSvg"
        :content="pelicanContent"
        :content-type="pelicanContentType"
        :raw-text="rawResponseText"
        :duration-ms="durationMs"
        :model-name="testedModel || config.modelName"
        :error-message="pelicanErrorMsg"
        :has-tested="hasPelicanTested"
        :prompt="pelicanPrompt"
        @update:prompt="setPelicanPrompt"
        @reset-prompt="resetPelicanPrompt"
      />
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
      @swap="({ sourceId, targetId }) => swapConfigItems(sourceId, targetId)"
    />

    <!-- 添加 / 编辑 / 保存当前配置弹窗 -->
    <ConfigEditModal
      :is-open="isConfigEditModalOpen"
      :mode="configEditModalMode"
      :initial-data="editingConfigItem"
      @close="closeConfigEditModal"
      @save="handleSaveConfigItem"
    />

    <!-- 全局通用公共确认弹窗 -->
    <ConfirmModal />
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


