<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Radio,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "@lucide/vue";
import SegmentedControl from "../common/SegmentedControl.vue";
import SettingsField from "./SettingsField.vue";
import { aboutPage } from "../../settings/about";
import { useUpdaterStore } from "../../stores";
import { APP_VERSION, GITHUB_RELEASES_URL, GITHUB_REPO_URL } from "../../constants";
import { isTauriApp, openExternalUrl } from "../../services/api";
import { formatHistoryTime } from "../../utils/pelicanFormatters";
import { DEFAULT_DEV_UPDATE_ENDPOINT } from "../../utils/updaterDevMock";
import type { AppInstallKind } from "../../services/updater";

const updaterStore = useUpdaterStore();
const isDev = import.meta.env.DEV;
const isDesktop = isTauriApp();
const devInstallKind = ref<AppInstallKind>("portable");
const devEndpoint = ref(DEFAULT_DEV_UPDATE_ENDPOINT);

const devKindOptions = [
  { value: "nsis", label: "安装版" },
  { value: "portable", label: "便携版" },
  { value: "dev", label: "开发环境" },
];

const INSTALL_KIND_LABELS: Record<AppInstallKind, string> = {
  nsis: "安装版",
  msi: "安装版 (MSI)",
  portable: "便携版",
  dev: "开发环境",
  unsupported: "桌面端",
};

const installKindLabel = computed(() => {
  const kind = updaterStore.installInfo?.kind;
  return kind ? INSTALL_KIND_LABELS[kind] : "桌面端";
});

const lastCheckedText = computed(() => {
  if (!updaterStore.lastCheckedAt) return "";
  return formatHistoryTime(updaterStore.lastCheckedAt);
});

function handleCheckUpdate(): void {
  void updaterStore.checkForUpdate({ silent: false });
}

function handleOpenLink(url: string): void {
  void openExternalUrl(url);
}

function handleDevRealCheck(): void {
  const endpoint = devEndpoint.value.trim();
  if (!endpoint || !isDesktop) return;
  void updaterStore.checkForUpdate({
    silent: false,
    devOverride: {
      endpoint,
      installKind: devInstallKind.value,
    },
  });
}

onMounted(() => {
  if (!updaterStore.installInfo) {
    void updaterStore.loadInstallInfo();
  }
});
</script>

<template>
  <div class="about-panel">
    <!-- 应用信息 Hero 区 -->
    <section class="hero-card">
      <div class="hero-left">
        <img src="../../assets/logo.png" alt="AI Detector Logo" class="hero-logo" />
        <div class="hero-meta">
          <h4 class="hero-title">AI Detector</h4>
          <p class="hero-sub">
            <span class="version-mono">{{ APP_VERSION }}</span>
            <span class="meta-dot">·</span>
            <span>{{ installKindLabel }}</span>
          </p>
        </div>
      </div>

      <button
        type="button"
        class="check-btn"
        :disabled="updaterStore.isBusy"
        @click="handleCheckUpdate"
      >
        <RefreshCw
          :size="13"
          :class="{ 'is-spinning': updaterStore.status === 'checking' }"
        />
        <span>{{ updaterStore.status === "checking" ? "检查中..." : "检查更新" }}</span>
      </button>
    </section>

    <!-- 更新状态栏 -->
    <div class="status-row">
      <template v-if="updaterStore.status === 'checking'">
        <span class="status-muted">正在检查新版本…</span>
      </template>

      <template v-else-if="updaterStore.status === 'upToDate'">
        <CheckCircle2 :size="13" class="status-icon-success" />
        <span class="status-text">
          已是最新版本
          <template v-if="lastCheckedText"> · 上次检查 {{ lastCheckedText }}</template>
        </span>
      </template>

      <template v-else-if="updaterStore.status === 'available' && updaterStore.updateInfo">
        <Sparkles :size="13" class="status-icon-accent" />
        <span class="status-text">
          发现新版本 v{{ updaterStore.updateInfo.version.replace(/^v/i, "") }}
        </span>
        <button
          type="button"
          class="status-link-btn"
          @click="updaterStore.openDialog()"
        >
          查看详情
        </button>
      </template>

      <template v-else-if="updaterStore.status === 'downloading'">
        <span class="status-text">
          正在下载更新
          <template v-if="updaterStore.progressPercent !== null">
            {{ updaterStore.progressPercent }}%
          </template>
        </span>
      </template>

      <template v-else-if="updaterStore.status === 'restarting'">
        <span class="status-text">更新完成，正在重启…</span>
      </template>

      <template v-else-if="updaterStore.status === 'error' && updaterStore.checkError">
        <AlertTriangle :size="13" class="status-icon-error" />
        <span class="status-error-text" :title="updaterStore.checkError">
          {{ updaterStore.checkError }}
        </span>
      </template>

      <template v-else>
        <span class="status-muted">
          {{ lastCheckedText ? `上次检查 ${lastCheckedText}` : "尚未检查更新" }}
        </span>
      </template>
    </div>

    <!-- 更新设置分组 -->
    <section
      v-for="section in aboutPage.sections"
      :key="section.id"
      class="about-section"
    >
      <header v-if="section.title || section.description" class="section-head">
        <h4 v-if="section.title">{{ section.title }}</h4>
        <p v-if="section.description">{{ section.description }}</p>
      </header>

      <div class="section-fields">
        <SettingsField
          v-for="field in section.fields"
          :key="field.key"
          :field="field"
        />
      </div>
    </section>

    <!-- 相关链接 -->
    <section class="about-section">
      <header class="section-head">
        <h4>相关链接</h4>
      </header>

      <div class="links-row">
        <button
          type="button"
          class="link-btn"
          @click="handleOpenLink(GITHUB_REPO_URL)"
        >
          <ExternalLink :size="12" />
          <span>GitHub 仓库</span>
        </button>
        <button
          type="button"
          class="link-btn"
          @click="handleOpenLink(GITHUB_RELEASES_URL)"
        >
          <ExternalLink :size="12" />
          <span>发布页</span>
        </button>
        <button
          type="button"
          class="link-btn"
          @click="handleOpenLink(`${GITHUB_REPO_URL}/issues`)"
        >
          <ExternalLink :size="12" />
          <span>问题反馈</span>
        </button>
      </div>
    </section>

    <!-- 开发调试（仅 Dev 环境可见） -->
    <section v-if="isDev" class="about-section dev-section">
      <header class="section-head dev-head">
        <h4>开发调试</h4>
        <span class="dev-badge">Dev</span>
      </header>

      <div class="dev-row">
        <span class="dev-label">安装类型</span>
        <SegmentedControl
          v-model="devInstallKind"
          class="dev-kind-control"
          :options="devKindOptions"
        />
      </div>

      <div class="links-row">
        <button
          type="button"
          class="link-btn"
          :disabled="updaterStore.isBusy"
          @click="updaterStore.openDevMockDialog(devInstallKind)"
        >
          <Eye :size="12" />
          <span>预览弹窗</span>
        </button>
        <button
          type="button"
          class="link-btn"
          :disabled="updaterStore.isBusy"
          @click="updaterStore.triggerDevMockDownload(devInstallKind)"
        >
          <Download :size="12" />
          <span>模拟下载</span>
        </button>
        <button
          type="button"
          class="link-btn"
          :disabled="updaterStore.isBusy"
          @click="updaterStore.triggerDevMockError(devInstallKind)"
        >
          <AlertTriangle :size="12" />
          <span>模拟失败</span>
        </button>
        <button
          type="button"
          class="link-btn"
          @click="updaterStore.resetDevUpdaterState()"
        >
          <RotateCcw :size="12" />
          <span>重置状态</span>
        </button>
      </div>

      <div class="dev-endpoint-row">
        <input
          v-model="devEndpoint"
          type="text"
          class="dev-endpoint-input"
          placeholder="http://127.0.0.1:4199/latest.json"
          spellcheck="false"
        />
        <button
          type="button"
          class="link-btn dev-fetch-btn"
          :disabled="!isDesktop || updaterStore.isBusy || !devEndpoint.trim()"
          :title="isDesktop ? '从本地更新源真实拉取并验签' : '仅桌面端 (npm run tauri dev) 可用'"
          @click="handleDevRealCheck"
        >
          <Radio :size="12" />
          <span>真实拉取</span>
        </button>
      </div>
      <p class="dev-hint">桌面端配合 npm run dev:update-server 可测试真实下载、进度与签名校验</p>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.about-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  gap: 14px;
  padding-right: 2px;
}

.hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.hero-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.hero-logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  flex-shrink: 0;
  object-fit: cover;
  border: 1px solid var(--border-subtle);
}

.hero-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.hero-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
  line-height: 1.2;
}

.hero-sub {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.2;
}

.version-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.meta-dot {
  opacity: 0.6;
}

.check-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 31px;
  padding: 0 12px;
  flex-shrink: 0;
  background: var(--bg-surface-control);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition: all var(--transition-fast);

  :deep(svg) {
    display: block;
    flex-shrink: 0;
  }

  .is-spinning {
    animation: spin 0.9s linear infinite;
  }

  &:hover:not(:disabled) {
    background: var(--bg-surface-control-hover);
    color: var(--accent-text);
    border-color: var(--border-surface-control-hover);
  }

  &:active:not(:disabled) {
    background: var(--bg-surface-control-active);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1.3;

  :deep(svg) {
    display: block;
    flex-shrink: 0;
  }
}

.status-muted {
  color: var(--text-muted);
}

.status-text {
  color: var(--text-secondary);
}

.status-icon-success {
  color: var(--accent-text);
}

.status-icon-accent {
  color: var(--accent-icon);
}

.status-icon-error {
  color: var(--color-danger, #ef4444);
}

.status-error-text {
  flex: 1;
  min-width: 0;
  color: var(--color-danger, #ef4444);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-link-btn {
  padding: 0 4px;
  border: none;
  background: transparent;
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  line-height: 1.2;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.about-section {
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.section-head {
  margin-bottom: 10px;

  h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  p {
    margin-top: 3px;
    font-size: 12px;
    color: var(--text-muted);
  }
}

.section-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.links-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 29px;
  padding: 0 11px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface-control);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition: all var(--transition-fast);

  :deep(svg) {
    display: block;
    flex-shrink: 0;
  }

  &:hover {
    background: var(--bg-surface-control-hover);
    color: var(--accent-text);
    border-color: var(--border-surface-control-hover);
  }

  &:active {
    background: var(--bg-surface-control-active);
  }
}

.dev-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dev-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
}

.dev-badge {
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid rgba(var(--accent-rgb), 0.35);
  background: rgba(var(--accent-rgb), 0.14);
  color: var(--accent-text);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
}

.dev-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dev-label {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.dev-kind-control {
  width: 212px;
  flex-shrink: 0;
}

.dev-endpoint-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dev-endpoint-input {
  flex: 1;
  min-width: 0;
  height: 29px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-input);
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  outline: none;

  &:focus {
    border-color: var(--accent-primary);
  }
}

.dev-fetch-btn {
  flex-shrink: 0;
}

.link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dev-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
