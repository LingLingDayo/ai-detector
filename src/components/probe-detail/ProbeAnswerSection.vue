<script setup lang="ts">
import { watch } from "vue";
import { Copy, Check, AlertCircle, RefreshCw } from "@lucide/vue";
import type { ProbeStepItem } from "../../types";
import { useClipboard } from "../../composables/useClipboard";

const props = defineProps<{
  step: ProbeStepItem;
  isRunning?: boolean;
}>();

const emit = defineEmits<{
  (e: "retry"): void;
}>();

const { copied: isAnswerCopied, copy: copyAnswer, reset: resetAnswerCopy } = useClipboard();

watch(
  () => props.step.id,
  () => {
    resetAnswerCopy();
  }
);

function handleCopyAnswer(): void {
  if (props.step.answer) {
    copyAnswer(props.step.answer);
  }
}

function handleCopyError(): void {
  const errorText = props.step.error || "未收到模型返回的有效文本数据";
  copyAnswer(errorText);
}
</script>

<template>
  <section class="probe-answer-section">
    <div class="section-header">
      <div class="section-title-wrap">
        <span class="section-label">模型实际回答 (Model Output)</span>
        <template v-if="step.expectedAnswer !== undefined">
          <span
            v-if="step.state === 'working'"
            class="section-hint working-hint"
          >
            正在生成中...
          </span>
          <span
            v-else-if="step.isCorrect === true"
            class="section-hint success-hint"
          >
            模型答案：{{ step.modelAnswer }} · 回答正确
          </span>
          <span
            v-else-if="step.answer || step.state === 'error'"
            class="section-hint error-hint"
          >
            模型答案：{{ step.modelAnswer ?? "未识别" }} · {{ step.answer ? "回答错误" : "请求失败" }}
          </span>
        </template>
        <template v-else>
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
        </template>
      </div>
      <div class="header-actions">
        <button
          v-if="step.expectedAnswer !== undefined && step.state === 'error' && step.answer"
          type="button"
          class="btn-copy"
          :disabled="isRunning"
          title="重试当前题目"
          @click="emit('retry')"
        >
          <RefreshCw :size="13" />
          <span>重试</span>
        </button>
        <button
          v-if="step.answer"
          type="button"
          class="btn-copy"
          :class="{ copied: isAnswerCopied }"
          title="复制模型实际回答文本"
          @click="handleCopyAnswer"
        >
          <Copy v-if="!isAnswerCopied" :size="13" />
          <Check v-else :size="13" />
          <span>{{ isAnswerCopied ? "已复制" : "复制" }}</span>
        </button>
        <button
          v-else-if="step.state === 'error' || step.error"
          type="button"
          class="btn-copy"
          :class="{ copied: isAnswerCopied }"
          title="复制错误信息"
          @click="handleCopyError"
        >
          <Copy v-if="!isAnswerCopied" :size="13" />
          <Check v-else :size="13" />
          <span>{{ isAnswerCopied ? "已复制" : "复制错误" }}</span>
        </button>
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
        <strong>模型正在生成回答...</strong>
        <p>正在请求模型并等待返回，请稍候。</p>
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
      <AlertCircle :size="18" />
      <div class="placeholder-text">
        <strong>未能获取到符合要求的有效回答</strong>
        <p class="error-msg">{{ step.error || "未收到模型返回的有效文本数据" }}</p>
      </div>
      <button
        type="button"
        class="btn-retry-in-modal"
        title="重试"
        @click="emit('retry')"
      >
        <RefreshCw :size="13" />
        <span>重试</span>
      </button>
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
        font-size: 12px;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: 0.02em;
      }

      .section-hint {
        font-size: 12px;
        color: var(--text-muted);
        background: var(--overlay-weak);
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

        &.error-hint {
          color: var(--danger-text);
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.3);
        }
      }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }



    .btn-copy {
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
      font-size: 12px;
      cursor: pointer;
      transition: all var(--transition-fast);

      svg {
        display: block;
        flex-shrink: 0;
      }

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



  .answer-text-box {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-code);
    overflow: hidden;

    .answer-pre {
      margin: 0;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
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
    background: var(--bg-inset);
    font-size: 12px;

    .placeholder-text {
      display: flex;
      flex-direction: column;
      gap: 3px;

      strong {
        font-size: 13px;
      }

      p {
        margin: 0;
        color: var(--text-muted);
        font-size: 12px;
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
      color: var(--danger-text);
      border-color: rgba(239, 68, 68, 0.35);
      background: rgba(239, 68, 68, 0.06);
      user-select: text;
      -webkit-user-select: text;

      svg {
        color: var(--danger);
        flex-shrink: 0;
        margin-top: 2px;
        user-select: none;
        -webkit-user-select: none;
        pointer-events: none;
      }

      .placeholder-text {
        user-select: text;
        -webkit-user-select: text;
        cursor: text;

        strong {
          user-select: text;
          -webkit-user-select: text;
          cursor: text;
        }

        .error-msg {
          color: var(--danger-text);
          word-break: break-word;
          user-select: text;
          -webkit-user-select: text;
          cursor: text;
        }
      }

      .btn-retry-in-modal {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: var(--danger-text);
        border-radius: var(--radius-sm);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        flex-shrink: 0;
        transition: all var(--transition-fast);

        &:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.24);
          border-color: rgba(239, 68, 68, 0.55);
          color: var(--danger-text);
          transform: translateY(-1px);
        }

        &:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
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
