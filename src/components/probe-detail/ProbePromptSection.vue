<script setup lang="ts">
import { useClipboard } from "../../composables/useClipboard";

const props = defineProps<{
  prompt?: string;
  expectedCount?: number;
}>();

const { copied: isPromptCopied, copy: copyPrompt } = useClipboard();

function handleCopy(): void {
  if (props.prompt) {
    copyPrompt(props.prompt);
  }
}
</script>

<template>
  <section class="probe-prompt-section">
    <div class="section-header">
      <div class="section-title-wrap">
        <span class="section-label">当前实际抽到的题目 (Prompt)</span>
        <span v-if="expectedCount" class="section-hint">
          抽取目标：{{ expectedCount }} 个无语义整数 (1~355)
        </span>
      </div>
      <button
        v-if="prompt"
        type="button"
        class="btn-copy"
        :class="{ copied: isPromptCopied }"
        title="复制题目 Prompt 文本"
        @click="handleCopy"
      >
        <svg v-if="!isPromptCopied" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>{{ isPromptCopied ? "已复制" : "复制题目" }}</span>
      </button>
    </div>
    <div class="prompt-text-box">
      {{ prompt || "暂无题目内容（测试尚未开始）" }}
    </div>
  </section>
</template>

<style lang="scss" scoped>
.probe-prompt-section {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .section-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;

      .section-label {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: 0.02em;
      }

      .section-hint {
        font-size: 0.72rem;
        color: var(--text-muted);
        background: rgba(255, 255, 255, 0.04);
        padding: 1px 7px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-subtle);
      }
    }

    .btn-copy {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
      background: var(--bg-input);
      color: var(--text-secondary);
      font-size: 0.72rem;
      cursor: pointer;
      transition: all var(--transition-fast);

      &:hover {
        background: rgba(99, 102, 241, 0.12);
        border-color: var(--accent-primary);
        color: var(--text-primary);
      }

      &.copied {
        background: rgba(16, 185, 129, 0.15);
        border-color: var(--success);
        color: var(--success);
      }
    }
  }

  .prompt-text-box {
    padding: 10px 12px;
    background: rgba(10, 14, 22, 0.65);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    line-height: 1.55;
    color: var(--text-secondary);
    max-height: 130px;
    overflow-y: auto;
    user-select: text;
    word-break: break-word;
  }
}
</style>
