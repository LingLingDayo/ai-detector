<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { AlertTriangle, Download, ExternalLink, Sparkles, X } from "@lucide/vue";
import { useUpdaterStore } from "../../stores";
import { useConfirm } from "../../composables/useConfirm";
import { parseReleaseNotes } from "../../utils/releaseNotes";

const updaterStore = useUpdaterStore();
const { confirmState } = useConfirm();

const update = computed(() => updaterStore.updateInfo);
const isInstalling = computed(
  () => updaterStore.status === "downloading" || updaterStore.status === "restarting"
);

const noteSections = computed(() =>
  update.value ? parseReleaseNotes(update.value.notes) : []
);

const formattedDate = computed(() => {
  const raw = update.value?.pubDate;
  if (!raw) return "";
  return raw.slice(0, 10);
});

const installHint = computed(() => {
  const kind = update.value?.installKind;
  if (kind === "nsis" || kind === "msi") {
    return "将下载安装包并自动完成安装，期间应用会重启";
  }
  if (kind === "portable") {
    return "将下载新版本替换当前程序并自动重启";
  }
  return "当前环境不支持自动安装，请前往发布页下载";
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 0.1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

const downloadText = computed(() => {
  const p = updaterStore.progress;
  if (!p) return "正在准备下载…";
  const dl = formatBytes(p.downloaded);
  if (p.total && p.total > 0) {
    const pct = updaterStore.progressPercent ?? 0;
    return `下载中 ${dl} / ${formatBytes(p.total)} · ${pct}%`;
  }
  return `下载中 ${dl}`;
});

function handleBackdropClick(): void {
  if (!isInstalling.value) {
    updaterStore.closeDialog();
  }
}

function handleDocumentKeydown(e: KeyboardEvent): void {
  if (
    e.key === "Escape" &&
    updaterStore.isDialogOpen &&
    !isInstalling.value &&
    !confirmState.isOpen
  ) {
    updaterStore.closeDialog();
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="updaterStore.isDialogOpen && update"
      class="update-backdrop"
      @click.self="handleBackdropClick"
    >
      <div
        class="update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <header class="update-header">
          <div class="header-left">
            <span class="header-icon">
              <Sparkles :size="16" />
            </span>
            <div class="header-titles">
              <h3 id="update-dialog-title">发现新版本</h3>
              <p class="header-sub">
                <span class="version-mono">
                  v{{ update.currentVersion.replace(/^v/i, "") }} → v{{ update.version.replace(/^v/i, "") }}
                </span>
                <template v-if="formattedDate">
                  <span class="sub-dot">·</span>
                  <span>{{ formattedDate }}</span>
                </template>
              </p>
            </div>
          </div>

          <button
            type="button"
            class="close-btn"
            :disabled="isInstalling"
            aria-label="关闭更新弹窗"
            title="关闭 (Esc)"
            @click="updaterStore.closeDialog()"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="update-body">
          <div class="notes-scroll">
            <template v-if="noteSections.length > 0">
              <div
                v-for="(sec, idx) in noteSections"
                :key="idx"
                class="note-section"
              >
                <div v-if="sec.title" class="note-section-title">
                  {{ sec.title }}
                </div>
                <ul class="note-list">
                  <li v-for="(item, itemIdx) in sec.items" :key="itemIdx">
                    {{ item }}
                  </li>
                </ul>
              </div>
            </template>
            <p v-else class="notes-empty">暂无更新说明</p>
          </div>

          <p class="install-hint">{{ installHint }}</p>

          <div v-if="updaterStore.status === 'downloading'" class="progress-block">
            <div class="progress-track">
              <div
                class="progress-fill"
                :class="{ 'is-indeterminate': updaterStore.progressPercent === null }"
                :style="
                  updaterStore.progressPercent !== null
                    ? { width: `${updaterStore.progressPercent}%` }
                    : undefined
                "
              ></div>
            </div>
            <div class="progress-text">{{ downloadText }}</div>
          </div>

          <div v-else-if="updaterStore.status === 'restarting'" class="restarting-text">
            更新完成，正在重启…
          </div>

          <div v-if="updaterStore.installError" class="error-box">
            <div class="error-msg">
              <AlertTriangle :size="14" />
              <span>{{ updaterStore.installError }}</span>
            </div>
            <div class="error-actions">
              <button
                type="button"
                class="error-btn"
                @click="updaterStore.openReleasePage()"
              >
                手动下载
              </button>
              <button
                type="button"
                class="error-btn error-btn-retry"
                @click="updaterStore.installUpdate()"
              >
                重试
              </button>
            </div>
          </div>
        </div>

        <footer class="update-footer">
          <button
            v-if="!isInstalling"
            type="button"
            class="skip-btn"
            @click="updaterStore.skipCurrentVersion()"
          >
            跳过此版本
          </button>
          <span v-else></span>

          <div class="footer-actions">
            <button
              type="button"
              class="btn btn-cancel"
              :disabled="isInstalling"
              @click="updaterStore.closeDialog()"
            >
              稍后
            </button>

            <button
              v-if="update.canAutoInstall"
              type="button"
              class="btn btn-primary"
              :disabled="isInstalling"
              @click="updaterStore.installUpdate()"
            >
              <span v-if="isInstalling" class="btn-spinner"></span>
              <Download v-else :size="14" />
              <span>{{ isInstalling ? "更新中..." : "立即更新" }}</span>
            </button>

            <button
              v-else
              type="button"
              class="btn btn-primary"
              @click="updaterStore.openReleasePage()"
            >
              <ExternalLink :size="14" />
              <span>前往下载</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.update-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--backdrop-color);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.update-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 420px;
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
  animation: modalScaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.update-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .header-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    background: rgba(var(--accent-rgb), 0.15);
    border: 1px solid rgba(var(--accent-rgb), 0.3);
    color: var(--accent-icon);

    :deep(svg) {
      display: block;
      flex-shrink: 0;
    }
  }

  .header-titles {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    h3 {
      margin: 0;
      font-size: 14.5px;
      font-weight: 600;
      color: var(--text-strong);
      line-height: 1.25;
    }
  }

  .header-sub {
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

  .sub-dot {
    opacity: 0.6;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 0;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);

    :deep(svg) {
      display: block;
      flex-shrink: 0;
    }

    &:hover:not(:disabled) {
      color: var(--text-strong);
      background: var(--overlay-medium);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}

.update-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
}

.notes-scroll {
  max-height: 260px;
  overflow-y: auto;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-inset);
}

.note-section + .note-section {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.note-section-title {
  margin-bottom: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.note-list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-primary);
}

.notes-empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.install-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.4;
}

.progress-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-track {
  height: 4px;
  border-radius: 999px;
  background: var(--overlay-medium);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent-primary);
  transition: width 0.18s ease;

  &.is-indeterminate {
    width: 40%;
    animation: indeterminate 1.2s ease-in-out infinite;
  }
}

@keyframes indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(300%);
  }
}

.progress-text,
.restarting-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.error-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
}

.error-msg {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-danger, #ef4444);
  word-break: break-word;

  :deep(svg) {
    display: block;
    flex-shrink: 0;
    margin-top: 2px;
  }
}

.error-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.error-btn {
  height: 25px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface-control);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;

  &:hover {
    color: var(--text-strong);
    background: var(--bg-surface-control-hover);
  }

  &.error-btn-retry {
    color: var(--accent-text);
  }
}

.update-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.skip-btn {
  padding: 4px 2px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition: color var(--transition-fast);

  &:hover {
    color: var(--text-secondary);
  }
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  box-sizing: border-box;
  height: 32px;
  min-width: 72px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-fast);
  border: 1px solid transparent;

  :deep(svg) {
    display: block;
    flex-shrink: 0;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.btn-cancel {
  background: var(--bg-control);
  border-color: var(--border-subtle);
  color: var(--text-secondary);

  &:hover:not(:disabled) {
    background: var(--bg-control-hover);
    color: var(--text-strong);
  }
}

.btn-primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: #ffffff;

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }
}

.btn-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
</style>
