<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import {
  useConfigStore,
  useProbeTestStore,
  usePelicanTestStore,
  useAppStore,
} from "./stores";
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

const configStore = useConfigStore();
const probeStore = useProbeTestStore();
const pelicanStore = usePelicanTestStore();
const appStore = useAppStore();

const configCardRef = ref<InstanceType<typeof ConfigCard> | null>(null);

onMounted(() => {
  configStore.loadConfig();
  probeStore.initStartupFingerprintCheck();
});

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
  () => probeStore.isRunning,
  (running, wasRunning) => {
    if (wasRunning && !running) {
      if (appStore.isProbeCancelled) {
        appStore.isProbeCancelled = false;
        return;
      }
      if (probeStore.hasResult && appStore.activeMode === "probe") {
        scrollToElement("#result-section", 10);
      }
    }
  }
);

// 鹈鹕测试开始后立即自动滚动到 status-summary-bar；生成结束后再次触发自动滚动，使其顶部距离页面顶部均为 10px
watch(
  () => pelicanStore.isPelicanRunning,
  (running, wasRunning) => {
    if (appStore.activeMode === "pelican" && running !== wasRunning) {
      if (wasRunning && !running && appStore.isPelicanCancelled) {
        appStore.isPelicanCancelled = false;
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
      <ConfigCard ref="configCardRef" />

      <!-- 常规探测题目与测试进度卡片（常规模式展示） -->
      <div v-show="appStore.activeMode === 'probe'" class="mode-view-group">
        <ProgressCard
          :visible="true"
          :title="probeStore.statusTitle"
          :desc="probeStore.statusDesc"
          :percent="probeStore.progressPercent"
          :completed-count="probeStore.completedCount"
          :total-count="probeStore.totalCount"
          :steps="probeStore.steps"
          :status-alert="probeStore.statusAlert"
          :is-running="probeStore.isRunning"
          :has-started="probeStore.hasStarted"
          :has-fingerprint-update="probeStore.hasFingerprintUpdate"
          :is-updating-fingerprint="probeStore.isUpdatingFingerprint"
          @refresh-questions="probeStore.refreshQuestions"
          @refresh-single-question="probeStore.refreshSingleQuestion"
          @retry-single-question="probeStore.retrySingleQuestion"
          @update-fingerprint="probeStore.performFingerprintUpdate"
        />

        <!-- 探测诊断报告卡片 -->
        <ResultCard
          :analysis="probeStore.analysisResult"
          :history-item="probeStore.currentProbeHistoryItem"
          :model-name="probeStore.testedModel || configStore.probeConfig.modelName"
        />
      </div>

      <!-- 鹈鹕测试模式卡片（点击鹈鹕测试后切换展示） -->
      <div v-show="appStore.activeMode === 'pelican'" class="mode-view-group">
        <PelicanTestCard
          :is-running="pelicanStore.isPelicanRunning"
          :is-generating="pelicanStore.isPelicanGenerating"
          :svg="pelicanStore.pelicanSvg"
          :content="pelicanStore.pelicanContent"
          :content-type="pelicanStore.pelicanContentType"
          :raw-text="pelicanStore.rawResponseText"
          :duration-ms="pelicanStore.durationMs"
          :model-name="pelicanStore.testedModel || configStore.pelicanConfig.modelName"
          :error-message="pelicanStore.errorMsg"
          :has-tested="pelicanStore.hasTested"
          :prompt="pelicanStore.pelicanPrompt"
          :custom-prompt="pelicanStore.pelicanCustomPrompt"
          @update:prompt="pelicanStore.setPelicanPrompt"
          @reset-prompt="pelicanStore.resetPelicanPrompt"
        />
      </div>
    </main>

    <!-- 配置列表弹窗 -->
    <ConfigListModal
      :is-open="configStore.isConfigListModalOpen"
      :configs="configStore.configList"
      :active-config-id="configStore.activeConfigId"
      :can-save-current="configStore.canSaveCurrent"
      @close="configStore.closeConfigListModal"
      @apply="(item) => {
        if (!probeStore.isRunning) probeStore.resetTest();
        if (!pelicanStore.isPelicanRunning) pelicanStore.resetPelicanTest();
        configStore.applyConfig(item, () => configCardRef?.resetModelList());
      }"
      @open-create="configStore.openCreateConfigModal"
      @open-edit="configStore.openEditConfigModal"
      @open-save-current="configStore.openSaveCurrentModal"
      @delete="configStore.deleteConfigItem"
      @swap="({ sourceId, targetId }) => configStore.swapConfigItems(sourceId, targetId)"
    />

    <!-- 添加 / 编辑 / 保存当前配置弹窗 -->
    <ConfigEditModal
      :is-open="configStore.isConfigEditModalOpen"
      :mode="configStore.configEditModalMode"
      :initial-data="configStore.editingConfigItem"
      @close="configStore.closeConfigEditModal"
      @save="configStore.handleSaveConfigItem"
    />

    <!-- 统一测试历史记录弹窗（包含鹈鹕测试与模型测试 Tab 架构） -->
    <TestHistoryModal
      :is-open="appStore.isHistoryModalOpen"
      initial-tab="probe"
      :pelican-list="pelicanStore.pelicanHistoryList"
      :probe-list="probeStore.probeHistoryList"
      :probe-running="probeStore.isRunning"
      :pelican-running="pelicanStore.isPelicanRunning"
      @close="appStore.closeHistoryModal"
      @delete-pelican="pelicanStore.deletePelicanHistoryItem"
      @clear-pelican="pelicanStore.clearPelicanHistory"
      @apply-pelican="appStore.applyPelicanHistory"
      @delete-probe="probeStore.deleteProbeHistoryItem"
      @clear-probe="probeStore.clearProbeHistory"
      @apply-probe="(item) => { appStore.applyProbeHistory(item); scrollToElement('#result-section', 10); }"
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


