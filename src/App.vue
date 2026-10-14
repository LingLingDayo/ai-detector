<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from "vue";
import { useConfig } from "./composables/useConfig";
import { useProbeTest } from "./composables/useProbeTest";
import { usePelicanTest } from "./composables/usePelicanTest";
import type { PelicanHistoryItem, ProbeHistoryItem } from "./types";
import type { GlobalAnalysisResult } from "./utils/fingerprint";
import AppHeader from "./components/AppHeader.vue";
import ConfigCard from "./components/ConfigCard.vue";
import ConfigListModal from "./components/ConfigListModal.vue";
import ConfigEditModal from "./components/ConfigEditModal.vue";
import ConfirmModal from "./components/common/ConfirmModal.vue";
import ProgressCard from "./components/ProgressCard.vue";
import ResultCard from "./components/ResultCard.vue";
import PelicanTestCard from "./components/PelicanTestCard.vue";
import TestHistoryModal from "./components/history/TestHistoryModal.vue";
import { APP_VERSION, GITHUB_REPO_URL } from "./constants";
import { openExternalUrl } from "./services/api";

const configCardRef = ref<InstanceType<typeof ConfigCard> | null>(null);
const activeMode = ref<"probe" | "pelican">("probe");
const isHistoryModalOpen = ref(false);

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
  probeHistoryList,
  startTest,
  cancelTest,
  resetTest,
  refreshQuestions,
  refreshSingleQuestion,
  deleteProbeHistoryItem,
  clearProbeHistory,
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
  pelicanHistoryList,
  setPelicanPrompt,
  resetPelicanPrompt,
  startPelicanTest,
  cancelPelicanTest,
  resetPelicanTest,
  deletePelicanHistoryItem,
  clearPelicanHistory,
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
  isCurrentConfigSaved,
  canSaveCurrent,
  matchedConfigItem,
  isConfigModified,
  togglePasswordVisibility,
  openConfigListModal,
  closeConfigListModal,
  openSaveCurrentModal,
  openCreateConfigModal,
  openEditConfigModal,
  closeConfigEditModal,
  updateCurrentConfig,
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

const totalHistoryCount = computed(
  () => pelicanHistoryList.value.length + probeHistoryList.value.length
);

function handleUpdateConfig(): void {
  const success = updateCurrentConfig();
  if (!success) {
    openSaveCurrentModal();
  }
}

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
    const currentSavedName =
      matchedConfigItem.value?.name ||
      (isCurrentConfigSaved.value ? activeConfigName.value : undefined);
    startTest(config, currentSavedName);
  } else {
    if (isPelicanRunning.value) {
      cancelPelicanTest();
      return;
    }
    const currentSavedName =
      matchedConfigItem.value?.name ||
      (isCurrentConfigSaved.value ? activeConfigName.value : undefined);
    startPelicanTest(config, currentSavedName);
  }
}

function handleApplyPelicanHistoryItem(item: PelicanHistoryItem): void {
  pelicanContent.value = item.content;
  pelicanSvg.value = item.content;
  pelicanContentType.value = item.contentType;
  testedModel.value = item.modelName;
  rawResponseText.value = item.content;
  durationMs.value = item.durationMs || 0;
  hasPelicanTested.value = true;
  hasPelicanResult.value = true;
  activeMode.value = "pelican";
  isHistoryModalOpen.value = false;
}

function handleApplyProbeHistoryItem(item: ProbeHistoryItem): void {
  if (item.fullAnalysis) {
    analysisResult.value = item.fullAnalysis as GlobalAnalysisResult;
    hasProbeResult.value = true;
    hasStarted.value = true;
  }
  activeMode.value = "probe";
  isHistoryModalOpen.value = false;
  scrollToBottom();
}

async function handleResetConfig(): Promise<void> {
  const confirmed = await resetConfig();
  if (confirmed) {
    resetTest();
    resetPelicanTest();
    configCardRef.value?.resetModelList();
  }
}

function scrollToBottom(): void {
  nextTick(() => {
    const doScroll = () => {
      const scrollHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      window.scrollTo({
        top: scrollHeight,
        behavior: "smooth",
      });
      if (document.documentElement.scrollTop !== undefined) {
        document.documentElement.scrollTo?.({
          top: scrollHeight,
          behavior: "smooth",
        });
      }
      if (document.body && document.body.scrollTop !== undefined) {
        document.body.scrollTo?.({
          top: scrollHeight,
          behavior: "smooth",
        });
      }
    };

    requestAnimationFrame(() => {
      doScroll();
      setTimeout(doScroll, 120);
    });
  });
}

// 常规探测测试结束自动滚动到底部
watch(
  () => isRunning.value,
  (running, wasRunning) => {
    if (wasRunning && !running && hasProbeResult.value && activeMode.value === "probe") {
      scrollToBottom();
    }
  }
);

// 鹈鹕测试结束自动滚动到底部
watch(
  () => isPelicanRunning.value,
  (running, wasRunning) => {
    if (wasRunning && !running && hasPelicanResult.value && activeMode.value === "pelican") {
      scrollToBottom();
    }
  }
);

function handleOpenGithub(): void {
  openExternalUrl(GITHUB_REPO_URL);
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
        :is-current-config-saved="isCurrentConfigSaved"
        :history-count="totalHistoryCount"
        @toggle-password="togglePasswordVisibility"
        @update:is-advanced-open="(v) => (isAdvancedOpen = v)"
        @update:active-mode="(v) => (activeMode = v)"
        @submit="handleStartTest"
        @cancel="handleCancelTest"
        @reset="handleResetConfig"
        @update-config="handleUpdateConfig"
        @open-save-config="openSaveCurrentModal"
        @open-config-list="openConfigListModal"
        @open-history="isHistoryModalOpen = true"
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

    <!-- 统一测试历史记录弹窗（包含鹈鹕测试与模型测试 Tab 架构） -->
    <TestHistoryModal
      :is-open="isHistoryModalOpen"
      :initial-tab="activeMode === 'pelican' ? 'pelican' : 'probe'"
      :pelican-list="pelicanHistoryList"
      :probe-list="probeHistoryList"
      @close="isHistoryModalOpen = false"
      @delete-pelican="deletePelicanHistoryItem"
      @clear-pelican="clearPelicanHistory"
      @apply-pelican="handleApplyPelicanHistoryItem"
      @delete-probe="deleteProbeHistoryItem"
      @clear-probe="clearProbeHistory"
      @apply-probe="handleApplyProbeHistoryItem"
    />

    <!-- 全局通用公共确认弹窗 -->
    <ConfirmModal />

    <!-- 页面右下角版本号（浅色小字，点击跳转至 GitHub 仓库） -->
    <aside class="app-version-badge">
      <a
        :href="GITHUB_REPO_URL"
        class="version-link"
        :title="`访问 GitHub 仓库 (${GITHUB_REPO_URL})`"
        target="_blank"
        rel="noopener noreferrer"
        @click.prevent="handleOpenGithub"
      >
        <svg class="version-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
        <span class="version-text">{{ APP_VERSION }}</span>
      </a>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.app-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 12px 16px 22px;
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

.app-version-badge {
  position: fixed;
  right: 10px;
  bottom: 4px;
  z-index: 50;
  display: flex;
  align-items: center;
  pointer-events: auto;

  .version-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    color: var(--text-muted);
    opacity: 0.65;
    text-decoration: none;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    cursor: pointer;
    user-select: none;
    letter-spacing: 0.02em;

    .version-icon {
      display: inline-block;
      flex-shrink: 0;
      opacity: 0.8;
      transition: transform var(--transition-fast);
    }

    &:hover {
      opacity: 1;
      color: var(--text-secondary);
      background: rgba(255, 255, 255, 0.06);

      .version-icon {
        transform: scale(1.1);
        opacity: 1;
      }
    }

    &:active {
      transform: scale(0.96);
    }
  }
}
</style>


