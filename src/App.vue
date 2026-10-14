<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
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
  currentProbeHistoryItem,
  probeHistoryList,
  testedModel: testedProbeModel,
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
  probeConfig,
  pelicanConfig,
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
  activeMode,
  isRunning,
  isPelicanRunning,
  onApply: () => {
    if (!isRunning.value) {
      resetTest();
    }
    if (!isPelicanRunning.value) {
      resetPelicanTest();
    }
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

const isProbeCancelled = ref(false);
const isPelicanCancelled = ref(false);

function handleCancelTest(): void {
  cancelScroll();
  if (activeMode.value === "probe") {
    isProbeCancelled.value = true;
    cancelTest();
  } else {
    isPelicanCancelled.value = true;
    cancelPelicanTest();
  }
}

function handleStartTest(): void {
  if (activeMode.value === "probe") {
    if (isRunning.value) {
      cancelScroll();
      isProbeCancelled.value = true;
      cancelTest();
      return;
    }
    isProbeCancelled.value = false;
    const currentSavedName =
      matchedConfigItem.value?.name ||
      (isCurrentConfigSaved.value ? activeConfigName.value : undefined);
    startTest(probeConfig, currentSavedName);
  } else {
    if (isPelicanRunning.value) {
      cancelScroll();
      isPelicanCancelled.value = true;
      cancelPelicanTest();
      return;
    }
    isPelicanCancelled.value = false;
    const currentSavedName =
      matchedConfigItem.value?.name ||
      (isCurrentConfigSaved.value ? activeConfigName.value : undefined);
    startPelicanTest(pelicanConfig, currentSavedName);
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
    currentProbeHistoryItem.value = item;
  }
  testedProbeModel.value = item.modelName;
  activeMode.value = "probe";
  isHistoryModalOpen.value = false;
  scrollToElement("#result-section", 10);
}

async function handleResetConfig(): Promise<void> {
  const confirmed = await resetConfig();
  if (confirmed) {
    cancelScroll();
    resetTest();
    resetPelicanTest();
    configCardRef.value?.resetModelList();
  }
}

let scrollRafId: number | null = null;
const scrollTimers: number[] = [];

function cancelScroll(): void {
  if (scrollRafId !== null) {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
  while (scrollTimers.length > 0) {
    const tid = scrollTimers.pop();
    if (tid !== undefined) {
      clearTimeout(tid);
    }
  }
}

function scrollToElement(selector: string, offsetTop: number = 10): void {
  cancelScroll();
  nextTick(() => {
    let attempts = 0;
    const maxAttempts = 15;
    let lastTargetTop: number | null = null;

    const performScroll = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        if (attempts < maxAttempts) {
          attempts++;
          scrollRafId = requestAnimationFrame(performScroll);
        }
        return;
      }

      const rect = el.getBoundingClientRect();
      const currentScrollTop =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      const targetScrollTop = Math.max(0, Math.round(rect.top + currentScrollTop - offsetTop));

      if (lastTargetTop === null || Math.abs(targetScrollTop - lastTargetTop) > 2) {
        lastTargetTop = targetScrollTop;
        window.scrollTo({
          top: targetScrollTop,
          behavior: "smooth",
        });
        if (document.documentElement && document.documentElement.scrollTop !== undefined) {
          document.documentElement.scrollTo?.({
            top: targetScrollTop,
            behavior: "smooth",
          });
        }
        if (document.body && document.body.scrollTop !== undefined) {
          document.body.scrollTo?.({
            top: targetScrollTop,
            behavior: "smooth",
          });
        }
      }
    };

    scrollRafId = requestAnimationFrame(() => {
      performScroll();
      scrollTimers.push(window.setTimeout(performScroll, 120));
      scrollTimers.push(window.setTimeout(performScroll, 260));
    });
  });
}

// 模型测试结束自动滚动到 result-section（使其顶部距离页面顶部 10px）
watch(
  () => isRunning.value,
  (running, wasRunning) => {
    if (wasRunning && !running) {
      if (isProbeCancelled.value) {
        isProbeCancelled.value = false;
        return;
      }
      if (hasProbeResult.value && activeMode.value === "probe") {
        scrollToElement("#result-section", 10);
      }
    }
  }
);

// 鹈鹕测试开始后立即自动滚动到 status-summary-bar；生成结束后再次触发自动滚动，使其顶部距离页面顶部均为 10px
watch(
  () => isPelicanRunning.value,
  (running, wasRunning) => {
    if (activeMode.value === "pelican" && running !== wasRunning) {
      if (wasRunning && !running && isPelicanCancelled.value) {
        isPelicanCancelled.value = false;
        return;
      }
      scrollToElement("#status-summary-bar", 10);
    }
  }
);

onUnmounted(() => {
  cancelScroll();
});

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
      <div v-show="activeMode === 'probe'" class="mode-view-group">
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
        <ResultCard
          :analysis="analysisResult"
          :history-item="currentProbeHistoryItem"
          :model-name="testedProbeModel || probeConfig.modelName"
        />
      </div>

      <!-- 鹈鹕测试模式卡片（点击鹈鹕测试后切换展示） -->
      <div v-show="activeMode === 'pelican'" class="mode-view-group">
        <PelicanTestCard
          :is-running="isPelicanRunning"
          :svg="pelicanSvg"
          :content="pelicanContent"
          :content-type="pelicanContentType"
          :raw-text="rawResponseText"
          :duration-ms="durationMs"
          :model-name="testedModel || pelicanConfig.modelName"
          :error-message="pelicanErrorMsg"
          :has-tested="hasPelicanTested"
          :prompt="pelicanPrompt"
          @update:prompt="setPelicanPrompt"
          @reset-prompt="resetPelicanPrompt"
        />
      </div>
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
      initial-tab="probe"
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

.mode-view-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
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


