<script setup lang="ts">
import { computed } from "vue";
import type { PelicanContentType } from "../../stores/pelicanTest";

const props = withDefaults(
  defineProps<{
    svg?: string;
    content?: string;
    contentType?: PelicanContentType;
    svgCopied: boolean;
  }>(),
  {
    svg: "",
    content: "",
    contentType: "svg",
  }
);

const emit = defineEmits<{
  (e: "copy-svg"): void;
}>();

const displayContent = computed(() => props.content || props.svg || "");
const typeUpper = computed(() => (props.contentType === "html" ? "HTML" : "SVG"));
</script>

<template>
  <div class="code-viewer-box">
    <div class="code-viewer-header">
      <span>{{ typeUpper }} 源码 ({{ displayContent.length }} 字符)</span>
      <button type="button" class="btn-copy-code" @click="emit('copy-svg')">
        {{ svgCopied ? "已复制 ✓" : "复制代码" }}
      </button>
    </div>
    <pre class="code-pre"><code>{{ displayContent }}</code></pre>
  </div>
</template>

<style lang="scss" scoped>
.code-viewer-box {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(51, 65, 85, 0.5);
  border-radius: var(--radius-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.code-viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: rgba(30, 41, 59, 0.5);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 0.72rem;
  color: var(--text-secondary);

  .btn-copy-code {
    background: transparent;
    border: none;
    color: #818cf8;
    font-size: 0.72rem;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
}

.code-pre {
  padding: 10px;
  max-height: 220px;
  overflow-y: auto;
  user-select: text;

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.72rem;
    color: #93c5fd;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
  }
}
</style>
