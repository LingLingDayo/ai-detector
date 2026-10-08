<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { ProbeStepItem } from "../types";

const props = defineProps<{
  isOpen: boolean;
  step: ProbeStepItem | null;
  stepIndex: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const isPromptCopied = ref(false);
const isAnswerCopied = ref(false);

async function copyText(text: string, type: "prompt" | "answer"): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (type === "prompt") {
      isPromptCopied.value = true;
      setTimeout(() => (isPromptCopied.value = false), 2000);
    } else {
      isAnswerCopied.value = true;
      setTimeout(() => (isAnswerCopied.value = false), 2000);
    }
  } catch (err) {
    console.warn("复制失败:", err);
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.isOpen) {
    emit("close");
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen && step"
      class="probe-modal-backdrop"
      @click.self="emit('close')"
    >
      <div
        class="probe-modal-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`modal-title-${stepIndex}`"
      >
        <!-- 弹窗顶栏 -->
        <div class="probe-modal-header">
          <div class="header-title-row">
            <span class="modal-badge-index">{{ stepIndex + 1 }}</span>
            <h3 :id="`modal-title-${stepIndex}`" class="probe-modal-title">
              挑战 {{ stepIndex + 1 }} 探针详情
            </h3>
            <span class="modal-state-pill" :class="step.state">
              {{ step.stateText }}
            </span>
          </div>
          <button
            type="button"
            class="modal-close-btn"
            title="关闭弹窗 (Esc)"
            @click="emit('close')"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- 弹窗主体内容 -->
        <div class="probe-modal-body">
          <!-- 区块 1：题目内容 (Prompt) -->
          <section class="modal-section">
            <div class="section-header">
              <div class="section-title-wrap">
                <span class="section-label">挑战探针指令 (Prompt)</span>
                <span v-if="step.expectedCount" class="section-hint">
                  目标要求：{{ step.expectedCount }} 个无语义整数
                </span>
              </div>
              <button
                v-if="step.prompt"
                type="button"
                class="btn-copy"
                :class="{ copied: isPromptCopied }"
                @click="copyText(step.prompt, 'prompt')"
                title="复制题目 Prompt 文本"
              >
                <svg v-if="!isPromptCopied" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>{{ isPromptCopied ? "已复制" : "复制题目" }}</span>
              </button>
            </div>
            <div class="prompt-text-box">
              {{ step.prompt || "暂无题目内容" }}
            </div>
          </section>

          <!-- 区块 2：模型回答 (Model Answer) -->
          <section class="modal-section">
            <div class="section-header">
              <div class="section-title-wrap">
                <span class="section-label">模型实际回答 (Model Output)</span>
                <span v-if="step.parsedNumbers" class="section-hint success-hint">
                  成功解析出 {{ step.parsedNumbers.length }} 个整数
                </span>
              </div>
              <button
                v-if="step.answer"
                type="button"
                class="btn-copy"
                :class="{ copied: isAnswerCopied }"
                @click="copyText(step.answer, 'answer')"
                title="复制模型实际回答文本"
              >
                <svg v-if="!isAnswerCopied" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>{{ isAnswerCopied ? "已复制" : "复制回答" }}</span>
              </button>
            </div>

            <!-- 已有回答 -->
            <div v-if="step.answer" class="answer-text-box">
              <pre class="answer-pre">{{ step.answer }}</pre>
            </div>

            <!-- 尚在等待响应 -->
            <div v-else-if="step.state === 'working'" class="modal-status-placeholder working">
              <div class="status-spinner"></div>
              <span>模型正在思考并生成长整数序列，请耐心等待...</span>
            </div>

            <!-- 排队等待 -->
            <div v-else-if="step.state === 'pending'" class="modal-status-placeholder pending">
              <span>等待发起请求...</span>
            </div>

            <!-- 异常无回答 -->
            <div v-else class="modal-status-placeholder error">
              <span class="error-msg">{{ step.error || "未收到模型返回的文本数据" }}</span>
            </div>
          </section>
        </div>

        <!-- 弹窗底栏 -->
        <div class="probe-modal-footer">
          <button type="button" class="btn btn-secondary modal-footer-btn" @click="emit('close')">
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.probe-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 13, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
  animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.probe-modal-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 660px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.7), 0 0 28px rgba(99, 102, 241, 0.16);
  animation: modalScaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;

  .probe-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border-subtle);
    background: rgba(17, 23, 34, 0.8);

    .header-title-row {
      display: flex;
      align-items: center;
      gap: 8px;

      .modal-badge-index {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--accent-gradient);
        color: #fff;
        font-size: 0.72rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
      }

      .probe-modal-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
      }

      .modal-state-pill {
        font-size: 0.68rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 9999px;
        background: var(--bg-input);
        color: var(--text-muted);
        border: 1px solid var(--border-subtle);

        &.working {
          background: rgba(99, 102, 241, 0.15);
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        &.done {
          background: rgba(16, 185, 129, 0.15);
          border-color: var(--success);
          color: var(--success);
        }

        &.error {
          background: rgba(239, 68, 68, 0.15);
          border-color: var(--danger);
          color: #fca5a5;
        }
      }
    }

    .modal-close-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);

      &:hover {
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.08);
      }
    }
  }

  .probe-modal-body {
    padding: 18px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;

    .modal-section {
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
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .section-hint {
            font-size: 0.72rem;
            color: var(--text-muted);
            background: rgba(255, 255, 255, 0.04);
            padding: 1px 6px;
            border-radius: var(--radius-sm);
            border: 1px solid var(--border-subtle);

            &.success-hint {
              color: var(--success);
              background: rgba(16, 185, 129, 0.08);
              border-color: rgba(16, 185, 129, 0.25);
            }
          }
        }

        .btn-copy {
          display: inline-flex;
          align-items: center;
          gap: 5px;
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
        background: rgba(10, 14, 22, 0.55);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        font-size: 0.8rem;
        line-height: 1.55;
        color: var(--text-secondary);
        max-height: 140px;
        overflow-y: auto;
        user-select: text;
      }

      .answer-text-box {
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        background: rgba(7, 10, 17, 0.75);
        overflow: hidden;

        .answer-pre {
          margin: 0;
          padding: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.8rem;
          line-height: 1.55;
          color: var(--text-primary);
          max-height: 240px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-all;
          user-select: text;
        }
      }

      .modal-status-placeholder {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 16px;
        border-radius: var(--radius-sm);
        border: 1px dashed var(--border-subtle);
        background: rgba(15, 20, 30, 0.4);
        font-size: 0.78rem;
        color: var(--text-muted);

        &.working {
          color: var(--accent-primary);
          border-color: rgba(99, 102, 241, 0.3);
          background: rgba(99, 102, 241, 0.04);
        }

        &.pending {
          color: var(--text-muted);
        }

        &.error {
          color: #fca5a5;
          border-color: rgba(239, 68, 68, 0.3);
          background: rgba(239, 68, 68, 0.05);
        }

        .error-msg {
          word-break: break-word;
          line-height: 1.45;
        }

        .status-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(99, 102, 241, 0.3);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }
      }
    }
  }

  .probe-modal-footer {
    padding: 10px 20px;
    border-top: 1px solid var(--border-subtle);
    background: rgba(17, 23, 34, 0.6);
    display: flex;
    justify-content: flex-end;

    .modal-footer-btn {
      padding: 5px 16px;
      font-size: 0.78rem;
    }
  }
}
</style>
