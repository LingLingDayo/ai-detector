<script setup lang="ts">
import { RefreshCw, Copy, Check } from "@lucide/vue";
import { useClipboard } from "../../composables/useClipboard";

const props = defineProps<{
  prompt?: string;
  expectedCount?: number;
  isRunning?: boolean;
}>();

const emit = defineEmits<{
  (e: "refreshSingle"): void;
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
      <div class="prompt-actions">
        <button
          v-if="prompt"
          type="button"
          class="btn-action btn-refresh"
          :disabled="isRunning"
          title="重新抽取当前这道测试题目"
          @click="emit('refreshSingle')"
        >
          <RefreshCw :size="13" />
          <span>换一题</span>
        </button>
        <button
          v-if="prompt"
          type="button"
          class="btn-action btn-copy"
          :class="{ copied: isPromptCopied }"
          title="复制题目 Prompt 文本"
          @click="handleCopy"
        >
          <Copy v-if="!isPromptCopied" :size="13" />
          <Check v-else :size="13" />
          <span>{{ isPromptCopied ? "已复制" : "复制" }}</span>
        </button>
      </div>
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

    .prompt-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 24px;
      padding: 0 8px;
      line-height: 1;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
      background: var(--bg-input);
      color: var(--text-secondary);
      font-size: 0.72rem;
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
      }

      &:hover:not(:disabled) {
        background: rgba(99, 102, 241, 0.12);
        border-color: var(--accent-primary);
        color: var(--text-primary);
      }

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
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
