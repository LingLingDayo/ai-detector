<script setup lang="ts">
import { ref, watch } from "vue";
import type { ProbeStepItem } from "../../types";
import { useClipboard } from "../../composables/useClipboard";

const props = defineProps<{
  step: ProbeStepItem;
}>();

const showNumbersPreview = ref(false);
const { copied: isAnswerCopied, copy: copyAnswer, reset: resetAnswerCopy } = useClipboard();
const { copied: isParsedCopied, copy: copyParsed, reset: resetParsedCopy } = useClipboard();

watch(
  () => props.step.id,
  () => {
    showNumbersPreview.value = false;
    resetAnswerCopy();
    resetParsedCopy();
  }
);

function handleCopyAnswer(): void {
  if (props.step.answer) {
    copyAnswer(props.step.answer);
  }
}

function handleCopyParsed(): void {
  if (props.step.parsedNumbers && props.step.parsedNumbers.length > 0) {
    copyParsed(props.step.parsedNumbers.join(", "));
  }
}
</script>

<template>
  <section class="probe-answer-section">
    <div class="section-header">
      <div class="section-title-wrap">
        <span class="section-label">模型实际回答 (Model Output)</span>
        <span
          v-if="step.parsedNumbers && step.parsedNumbers.length > 0"
          class="section-hint success-hint"
        >
          已提取有效整数：{{ step.parsedNumbers.length }} 个
        </span>
        <span
          v-else-if="step.state === 'working'"
          class="section-hint working-hint"
        >
          正在生成中...
        </span>
      </div>
      <div class="header-actions">
        <button
          v-if="step.parsedNumbers && step.parsedNumbers.length > 0"
          type="button"
          class="btn-toggle-numbers"
          :class="{ active: showNumbersPreview }"
          title="展开/收起解析出的整数列表"
          @click="showNumbersPreview = !showNumbersPreview"
        >
          <span>{{ showNumbersPreview ? "收起数字列表" : "查看解析数字" }}</span>
        </button>
        <button
          v-if="step.answer"
          type="button"
          class="btn-copy"
          :class="{ copied: isAnswerCopied }"
          title="复制模型实际回答文本"
          @click="handleCopyAnswer"
        >
          <svg v-if="!isAnswerCopied" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>{{ isAnswerCopied ? "已复制" : "复制回答" }}</span>
        </button>
      </div>
    </div>

    <!-- 解析出的纯数字网格预览（可选展开） -->
    <div
      v-if="showNumbersPreview && step.parsedNumbers && step.parsedNumbers.length > 0"
      class="numbers-preview-box"
    >
      <div class="numbers-preview-header">
        <span>有效整数序列预览（共 {{ step.parsedNumbers.length }} 个）：</span>
        <button
          type="button"
          class="btn-copy-mini"
          @click="handleCopyParsed"
        >
          {{ isParsedCopied ? "已复制" : "复制数字列表" }}
        </button>
      </div>
      <div class="numbers-chip-grid">
        <span
          v-for="(num, nIdx) in step.parsedNumbers"
          :key="nIdx"
          class="number-chip"
        >
          {{ num }}
        </span>
      </div>
    </div>

    <!-- 已有完整回答 -->
    <div v-if="step.answer" class="answer-text-box">
      <pre class="answer-pre">{{ step.answer }}</pre>
    </div>

    <!-- 正在思考与生成回答中 -->
    <div v-else-if="step.state === 'working'" class="modal-status-placeholder working">
      <div class="status-spinner"></div>
      <div class="placeholder-text">
        <strong>模型正在生成长整数序列...</strong>
        <p>正在执行 API 探测请求并实时等待完整返回，请稍候。</p>
      </div>
    </div>

    <!-- 等待发起 -->
    <div v-else-if="step.state === 'pending'" class="modal-status-placeholder pending">
      <div class="placeholder-text">
        <span>等待发起请求...</span>
      </div>
    </div>

    <!-- 异常无有效回答 -->
    <div v-else class="modal-status-placeholder error">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <div class="placeholder-text">
        <strong>未能获取到符合要求的有效回答</strong>
        <p class="error-msg">{{ step.error || "未收到模型返回的有效文本数据" }}</p>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.probe-answer-section {
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

        &.success-hint {
          color: var(--success);
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.25);
        }

        &.working-hint {
          color: var(--accent-primary);
          background: rgba(99, 102, 241, 0.08);
          border-color: rgba(99, 102, 241, 0.25);
        }
      }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-toggle-numbers {
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
      background: var(--bg-input);
      color: var(--text-secondary);
      font-size: 0.72rem;
      cursor: pointer;
      transition: all var(--transition-fast);

      &:hover,
      &.active {
        background: rgba(6, 182, 212, 0.12);
        border-color: var(--accent-secondary);
        color: var(--accent-secondary);
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

  .numbers-preview-box {
    background: rgba(10, 14, 22, 0.8);
    border: 1px solid rgba(6, 182, 212, 0.3);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: fadeIn 0.2s ease;

    .numbers-preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.72rem;
      color: var(--text-secondary);

      .btn-copy-mini {
        background: transparent;
        border: 1px solid var(--border-subtle);
        color: var(--accent-secondary);
        font-size: 0.68rem;
        padding: 1px 6px;
        border-radius: var(--radius-sm);
        cursor: pointer;

        &:hover {
          background: rgba(6, 182, 212, 0.15);
        }
      }
    }

    .numbers-chip-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      max-height: 100px;
      overflow-y: auto;

      .number-chip {
        background: rgba(6, 182, 212, 0.12);
        color: #a5f3fc;
        border: 1px solid rgba(6, 182, 212, 0.25);
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 0.7rem;
        font-family: ui-monospace, SFMono-Regular, monospace;
      }
    }
  }

  .answer-text-box {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: rgba(7, 10, 17, 0.85);
    overflow: hidden;

    .answer-pre {
      margin: 0;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8rem;
      line-height: 1.55;
      color: var(--text-primary);
      max-height: 220px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      user-select: text;
    }
  }

  .modal-status-placeholder {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border-radius: var(--radius-sm);
    border: 1px dashed var(--border-subtle);
    background: rgba(15, 20, 30, 0.4);
    font-size: 0.78rem;

    .placeholder-text {
      display: flex;
      flex-direction: column;
      gap: 3px;

      strong {
        font-size: 0.8rem;
      }

      p {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.74rem;
      }
    }

    &.working {
      color: var(--accent-primary);
      border-color: rgba(99, 102, 241, 0.35);
      background: rgba(99, 102, 241, 0.05);

      p {
        color: var(--text-secondary);
      }
    }

    &.pending {
      color: var(--text-muted);
    }

    &.error {
      color: #fca5a5;
      border-color: rgba(239, 68, 68, 0.35);
      background: rgba(239, 68, 68, 0.06);

      svg {
        color: var(--danger);
        flex-shrink: 0;
        margin-top: 2px;
      }

      .error-msg {
        color: #fca5a5;
        word-break: break-word;
      }
    }

    .status-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(99, 102, 241, 0.3);
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
      margin-top: 2px;
    }
  }
}
</style>
