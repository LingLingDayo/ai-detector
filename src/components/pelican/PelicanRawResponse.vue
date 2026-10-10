<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  rawText: string;
}>();

const showRawText = ref(false);
</script>

<template>
  <div class="raw-toggle-wrap">
    <button
      type="button"
      class="btn-text-toggle"
      @click="showRawText = !showRawText"
    >
      <span>{{ showRawText ? "收起模型完整响应" : "查看模型完整响应内容" }}</span>
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        :class="{ rotated: showRawText }"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div v-if="showRawText" class="raw-response-dropdown">
      <pre class="raw-response-pre">{{ rawText }}</pre>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.raw-toggle-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .btn-text-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.72rem;
    cursor: pointer;
    padding: 2px 4px;
    transition: color var(--transition-fast);

    &:hover {
      color: var(--text-secondary);
    }

    svg {
      transition: transform var(--transition-fast);

      &.rotated {
        transform: rotate(180deg);
      }
    }
  }
}

.raw-response-dropdown {
  animation: fadeIn 0.15s ease-out;
}

.raw-response-pre {
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.74rem;
  color: #cbd5e1;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow-y: auto;
  user-select: text;
}
</style>
