<script setup lang="ts">
import { computed } from "vue";
import { Copy, Check, Download, Code } from "@lucide/vue";
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
const durationSeconds = computed(() => Math.floor(props.durationMs / 1000));
</script>

<template>
  <div id="status-summary-bar" class="status-summary-bar">
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
      <span v-if="durationMs > 0 || isRunning" class="meta-item">
        耗时: <strong>{{ durationSeconds }}s</strong>
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
        <Copy v-if="!svgCopied" :size="12" />
        <Check
          v-else
          :size="12"
          stroke="#10b981"
          :stroke-width="2.5"
        />
        <span>{{ svgCopied ? "已复制" : `复制 ${typeUpper}` }}</span>
      </button>

      <button
        type="button"
        class="ctrl-btn"
        :title="`下载 ${typeUpper} 文件`"
        @click="emit('download-svg')"
      >
        <Download :size="12" />
        <span>下载 {{ typeUpper }}</span>
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
      font-variant-numeric: tabular-nums;
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
