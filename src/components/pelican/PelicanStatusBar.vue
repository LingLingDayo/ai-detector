<script setup lang="ts">
import { computed } from "vue";
import type { PelicanContentType } from "../../composables/usePelicanTest";

const props = withDefaults(
  defineProps<{
    isRunning: boolean;
    errorMessage: string | null;
    svg?: string;
    content?: string;
    contentType?: PelicanContentType;
    modelName: string;
    durationMs: number;
    showCode: boolean;
    svgCopied: boolean;
  }>(),
  {
    svg: "",
    content: "",
    contentType: "svg",
  }
);

const emit = defineEmits<{
  (e: "update:showCode", value: boolean): void;
  (e: "copy-svg"): void;
  (e: "download-svg"): void;
}>();

const displayContent = computed(() => props.content || props.svg || "");
const typeUpper = computed(() => (props.contentType === "html" ? "HTML" : "SVG"));
</script>

<template>
  <div class="status-summary-bar">
    <div class="status-left">
      <span v-if="isRunning" class="state-pill running">
        <span class="state-spinner"></span>
        正在生成图形...
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
      <span v-if="durationMs > 0" class="meta-item">
        耗时: <strong>{{ (durationMs / 1000).toFixed(2) }}s</strong>
      </span>
    </div>

    <!-- 背景样式与视图切换 -->
    <div v-if="displayContent && !isRunning" class="view-controls">
      <button
        type="button"
        class="ctrl-btn"
        :title="`复制 ${typeUpper} 源码`"
        @click="emit('copy-svg')"
      >
        <svg
          v-if="!svgCopied"
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="#10b981"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>{{ svgCopied ? "已复制" : `复制 ${typeUpper}` }}</span>
      </button>

      <button
        type="button"
        class="ctrl-btn"
        :title="`下载 ${typeUpper} 文件`"
        @click="emit('download-svg')"
      >
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>下载 {{ typeUpper }}</span>
      </button>

      <button
        type="button"
        class="ctrl-btn"
        :class="{ active: showCode }"
        :title="`查看或折叠 ${typeUpper} 源码`"
        @click="emit('update:showCode', !showCode)"
      >
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
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
    gap: 5px;
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 500;

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
    }
  }

  .meta-item {
    color: var(--text-muted);

    strong {
      color: var(--text-primary);
      font-weight: 500;
    }
  }
}

.view-controls {
  display: flex;
  align-items: center;
  gap: 6px;

  .ctrl-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all var(--transition-fast);

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
