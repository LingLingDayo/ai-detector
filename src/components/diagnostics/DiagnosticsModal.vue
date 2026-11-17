<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";
import { AlertTriangle, Check, Copy, Search, Terminal, Trash2, X } from "@lucide/vue";
import { useClipboard } from "../../composables/useClipboard";
import { useToast } from "../../composables/useToast";
import { getTauriInvoke, isTauriApp } from "../../services/api";
import {
  clearDiagnosticEntries,
  formatDiagnosticText,
  getDiagnosticEntries,
  subscribeDiagnostics,
  type DiagnosticEntry,
  type DiagnosticLevel,
} from "../../services/diagnostics";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { copied, copy } = useClipboard();
const { showToast } = useToast();

const entries = shallowRef<readonly DiagnosticEntry[]>([]);
const levelFilter = ref<"all" | DiagnosticLevel>("all");
const keyword = ref("");
const openingDevtools = ref(false);

const filters: Array<{ value: "all" | DiagnosticLevel; label: string }> = [
  { value: "all", label: "全部" },
  { value: "error", label: "错误" },
  { value: "warn", label: "警告" },
  { value: "info", label: "信息" },
  { value: "debug", label: "调试" },
];

let unsubscribe: (() => void) | null = null;

const visibleEntries = computed(() => {
  const needle = keyword.value.trim().toLowerCase();
  return entries.value.filter((entry) => {
    if (levelFilter.value !== "all" && entry.level !== levelFilter.value) return false;
    if (!needle) return true;
    return (
      entry.message.toLowerCase().includes(needle) ||
      entry.target.toLowerCase().includes(needle)
    );
  });
});

const errorCount = computed(
  () => entries.value.filter((entry) => entry.level === "error").length
);

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString("zh-CN", { hour12: false });
  return `${time}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

async function handleCopy(): Promise<void> {
  const ok = await copy(formatDiagnosticText(entries.value));
  showToast({
    type: ok ? "success" : "warning",
    title: ok ? "诊断信息已复制" : "复制失败",
    message: ok ? "可粘贴给开发者，全程未生成任何文件" : "请手动选中日志内容复制",
    duration: 3000,
  });
}

function handleClear(): void {
  clearDiagnosticEntries();
}

async function handleOpenDevtools(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    showToast({
      type: "warning",
      title: "仅桌面端可用",
      message: "开发者工具需要在打包后的桌面应用中打开",
      duration: 3000,
    });
    return;
  }

  openingDevtools.value = true;
  try {
    await invoke("open_devtools");
  } catch (err) {
    showToast({
      type: "warning",
      title: "打开开发者工具失败",
      message: String(err),
      duration: 3000,
    });
  } finally {
    openingDevtools.value = false;
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && props.isOpen) emit("close");
}

onMounted(() => {
  unsubscribe = subscribeDiagnostics((next) => {
    entries.value = next;
  });
  document.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  unsubscribe?.();
  document.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="diagnostics-backdrop"
      @click.self="emit('close')"
    >
      <div
        class="diagnostics-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnostics-title"
      >
        <header class="diagnostics-header">
          <div class="header-left">
            <span class="header-icon">
              <AlertTriangle :size="16" />
            </span>
            <h3 id="diagnostics-title">诊断中心</h3>
            <span v-if="errorCount > 0" class="error-badge">{{ errorCount }} 条错误</span>
            <span class="entry-count">共 {{ entries.length }} 条</span>
          </div>

          <button
            type="button"
            class="close-btn"
            aria-label="关闭诊断中心"
            title="关闭诊断中心 (Esc)"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="diagnostics-toolbar">
          <div class="level-filters" role="group" aria-label="日志级别筛选">
            <button
              v-for="item in filters"
              :key="item.value"
              type="button"
              class="filter-btn"
              :class="{ active: levelFilter === item.value }"
              @click="levelFilter = item.value"
            >
              {{ item.label }}
            </button>
          </div>

          <label class="search-box">
            <Search :size="14" />
            <input
              v-model="keyword"
              type="search"
              placeholder="搜索日志内容或来源"
              aria-label="搜索日志"
            />
          </label>
        </div>

        <div class="diagnostics-list" role="log" aria-live="polite">
          <p v-if="visibleEntries.length === 0" class="empty-state">
            {{ entries.length === 0 ? "暂无日志记录" : "没有匹配的日志" }}
          </p>

          <div
            v-for="entry in visibleEntries"
            :key="entry.id"
            class="log-row"
            :class="`level-${entry.level}`"
          >
            <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
            <span class="log-level">{{ entry.level.toUpperCase() }}</span>
            <span class="log-target" :title="entry.target">{{ entry.target }}</span>
            <span class="log-message">{{ entry.message }}</span>
          </div>
        </div>

        <footer class="diagnostics-footer">
          <p class="privacy-hint">
            日志仅保存在内存中，关闭应用即清空，不会在电脑中生成任何文件。
          </p>
          <div class="footer-actions">
            <button
              v-if="isTauriApp()"
              type="button"
              class="action-btn"
              :disabled="openingDevtools"
              @click="handleOpenDevtools"
            >
              <Terminal :size="14" />
              <span>打开开发者工具</span>
            </button>
            <button type="button" class="action-btn" @click="handleClear">
              <Trash2 :size="14" />
              <span>清空</span>
            </button>
            <button type="button" class="action-btn primary" @click="handleCopy">
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
              <span>{{ copied ? "已复制" : "复制全部" }}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.diagnostics-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--backdrop-color);
}

.diagnostics-dialog {
  display: flex;
  flex-direction: column;
  width: min(900px, 94vw);
  max-height: 84vh;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-solid);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.diagnostics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-icon);
  }

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-strong);
  }

  .error-badge {
    padding: 2px 8px;
    border: 1px solid rgba(248, 113, 113, 0.5);
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.15);
    font-size: 11px;
    color: #fecaca;
  }

  .entry-count {
    font-size: 11px;
    color: var(--text-muted);
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;

    &:hover {
      border-color: var(--border-subtle);
      background: var(--bg-control);
      color: var(--text-strong);
    }
  }
}

.diagnostics-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);

  .level-filters {
    display: flex;
    gap: 6px;
  }

  .filter-btn {
    padding: 5px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;

    &:hover {
      color: var(--text-strong);
    }

    &.active {
      border-color: var(--border-segment-active);
      background: var(--bg-segment-active);
      color: var(--text-segment-active);
    }
  }

  .search-box {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 220px;
    padding: 6px 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--bg-input);
    color: var(--text-muted);

    input {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text-primary);
      font-size: 12px;
    }
  }
}

.diagnostics-list {
  flex: 1;
  min-height: 180px;
  overflow-y: auto;
  background: var(--bg-code);

  .empty-state {
    padding: 48px 16px;
    margin: 0;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
  }

  .log-row {
    display: grid;
    grid-template-columns: 100px 58px 180px minmax(0, 1fr);
    gap: 10px;
    padding: 7px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;

    .log-time {
      color: var(--text-muted);
    }

    .log-level {
      font-weight: 600;
      color: var(--text-secondary);
    }

    .log-target {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--accent-text);
    }

    .log-message {
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--text-body);
    }

    &.level-error .log-level { color: #f87171; }
    &.level-warn .log-level { color: #fbbf24; }
    &.level-info .log-level { color: #93c5fd; }
    &.level-debug .log-level,
    &.level-trace .log-level { color: var(--text-muted); }
  }
}

.diagnostics-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-subtle);

  .privacy-hint {
    margin: 0;
    font-size: 11px;
    color: var(--text-muted);
  }

  .footer-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--bg-control-hover);
      color: var(--text-strong);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.primary {
      border-color: rgba(99, 102, 241, 0.5);
      background: rgba(99, 102, 241, 0.2);
      color: var(--accent-text-contrast);
    }
  }
}

@media (max-width: 720px) {
  .diagnostics-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .diagnostics-list .log-row {
    grid-template-columns: 80px 54px minmax(0, 1fr);

    .log-target {
      display: none;
    }
  }

  .diagnostics-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
