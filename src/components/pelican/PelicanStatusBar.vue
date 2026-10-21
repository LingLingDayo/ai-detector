<script setup lang="ts">
import { computed } from "vue";
import { Copy, Check, Download, Code, Sun, Moon } from "@lucide/vue";
import type { PelicanContentType } from "../../stores/pelicanTest";

const props = withDefaults(
  defineProps<{
    isRunning: boolean;
    isGenerating?: boolean;
    errorMessage: string | null;
    svg?: string;
    content?: string;
    contentType?: PelicanContentType;
    streamedCharCount?: number;
    streamedTextTail?: string;
    modelName: string;
    durationMs: number;
    bgTheme?: "dark" | "light";
    showCode: boolean;
    svgCopied: boolean;
  }>(),
  {
    isGenerating: false,
    svg: "",
    content: "",
    contentType: "svg",
    streamedCharCount: 0,
    streamedTextTail: "",
    bgTheme: "dark",
  }
);

const emit = defineEmits<{
  (e: "update:bgTheme", value: "dark" | "light"): void;
  (e: "update:showCode", value: boolean): void;
  (e: "copy-svg"): void;
  (e: "download-svg"): void;
}>();

const displayContent = computed(() => props.content || props.svg || "");
const typeUpper = computed(() => (props.contentType === "html" ? "HTML" : "SVG"));
const durationSeconds = computed(() => Math.floor(props.durationMs / 1000));
const streamTail = computed(() => {
  const compact = props.streamedTextTail.replace(/\s+/g, " ").trim();
  return compact.length > 48 ? `…${compact.slice(-48)}` : compact;
});

function toggleBgTheme(): void {
  emit("update:bgTheme", props.bgTheme === "dark" ? "light" : "dark");
}
</script>

<template>
  <div id="status-summary-bar" class="status-summary-bar">
    <div class="status-left">
      <span v-if="isRunning" class="state-pill running">
        <span class="state-spinner"></span>
        {{ isGenerating ? "正在生成图形..." : "等待模型响应..." }}
      </span>
      <span v-else-if="errorMessage" class="state-pill error">
        <span class="dot error"></span>
        请求异常
      </span>
      <span v-else-if="displayContent" class="state-pill success">
        <span class="dot success"></span>
        {{ typeUpper }} 渲染就绪
      </span>
      <span v-else class="state-pill warning">
        <span class="dot warning"></span>
        未提取到有效 {{ typeUpper }}
      </span>

      <span v-if="modelName" class="meta-item">
        模型: <strong>{{ modelName }}</strong>
      </span>
      <span v-if="durationMs > 0 || isRunning" class="meta-item">
        耗时: <strong>{{ durationSeconds }}s</strong>
      </span>
    </div>

    <!-- 流式输出实时进度 -->
    <div
      v-if="isRunning && isGenerating"
      class="stream-progress"
      :title="`已实时接收 ${streamedCharCount} 个字符`"
    >
      <span class="stream-pulse"></span>
      <span class="stream-count">{{ streamedCharCount }} 字符</span>
      <span v-if="streamTail" class="stream-tail">{{ streamTail }}</span>
    </div>

    <!-- 背景样式与视图切换 -->
    <div v-if="displayContent && !isRunning" class="view-controls">
      <button
        type="button"
        class="ctrl-btn"
        :title="`复制 ${typeUpper} 源码`"
        @click="emit('copy-svg')"
      >
        <Copy v-if="!svgCopied" :size="12" />
        <Check
          v-else
          :size="12"
          stroke="#10b981"
          :stroke-width="2.5"
        />
        <span>{{ svgCopied ? "已复制" : "复制" }}</span>
      </button>

      <button
        type="button"
        class="ctrl-btn"
        :title="`下载 ${typeUpper} 文件`"
        @click="emit('download-svg')"
      >
        <Download :size="12" />
        <span>下载</span>
      </button>

      <button
        type="button"
        class="ctrl-btn"
        :title="bgTheme === 'dark' ? '当前为暗色背景，点击切换为亮色' : '当前为亮色背景，点击切换为暗色'"
        @click="toggleBgTheme"
      >
        <Moon v-if="bgTheme === 'dark'" :size="12" />
        <Sun v-else :size="12" />
        <span>{{ bgTheme === 'dark' ? "暗色" : "亮色" }}</span>
      </button>

      <button
        type="button"
        class="ctrl-btn"
        :class="{ active: showCode }"
        :title="`查看或折叠 ${typeUpper} 源码`"
        @click="emit('update:showCode', !showCode)"
      >
        <Code :size="12" />
        <span>源码</span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.status-summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(17, 24, 39, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.status-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 0.74rem;

  .state-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 20px;
    padding: 0 7px;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 500;
    line-height: 1;

    &.running {
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #60a5fa;
    }

    &.success {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }

    &.error {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }

    &.warning {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
    }

    .dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      flex-shrink: 0;

      &.success { background: #10b981; }
      &.error { background: #ef4444; }
      &.warning { background: #f59e0b; }
    }

    .state-spinner {
      width: 9px;
      height: 9px;
      border: 1.5px solid rgba(96, 165, 250, 0.3);
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }
  }

  .meta-item {
    color: var(--text-muted);

    strong {
      color: var(--text-primary);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
  }
}

.stream-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 38%;
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--text-muted);

  .stream-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #818cf8;
    flex-shrink: 0;
    animation: stream-pulse 1.1s ease-in-out infinite;
  }

  .stream-count {
    flex-shrink: 0;
    color: #a5b4fc;
    font-variant-numeric: tabular-nums;
  }

  .stream-tail {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    opacity: 0.8;
  }
}

@keyframes stream-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.8);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.view-controls {
  display: flex;
  align-items: center;
  gap: 6px;

  .ctrl-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 22px;
    padding: 0 7px;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.7rem;
    line-height: 1;
    font-family: inherit;
    cursor: pointer;
    transition: all var(--transition-fast);

    svg {
      display: block;
      flex-shrink: 0;
    }

    span {
      display: inline-flex;
      align-items: center;
      line-height: 1;
      transform: translateY(-0.5px);
    }

    &:hover {
      background: rgba(30, 41, 59, 0.9);
      color: #fff;
      border-color: rgba(99, 102, 241, 0.4);
    }

    &.active {
      background: rgba(99, 102, 241, 0.25);
      border-color: #6366f1;
      color: #fff;
    }
  }
}
</style>
