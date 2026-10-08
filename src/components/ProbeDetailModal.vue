<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { ProbeStepItem } from "../types";

const props = defineProps<{
  isOpen: boolean;
  steps: ProbeStepItem[];
  initialIndex: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const activeIndex = ref(props.initialIndex);
const isPromptCopied = ref(false);
const isAnswerCopied = ref(false);
const isParsedCopied = ref(false);
const showNumbersPreview = ref(false);

watch(
  () => props.initialIndex,
  (newIdx) => {
    activeIndex.value = newIdx;
  }
);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      activeIndex.value = props.initialIndex;
      isPromptCopied.value = false;
      isAnswerCopied.value = false;
      isParsedCopied.value = false;
      showNumbersPreview.value = false;
    }
  }
);

const currentStep = computed<ProbeStepItem | null>(() => {
  return props.steps[activeIndex.value] ?? null;
});

function selectStep(idx: number): void {
  activeIndex.value = idx;
  isPromptCopied.value = false;
  isAnswerCopied.value = false;
  isParsedCopied.value = false;
}

async function copyText(text: string, type: "prompt" | "answer" | "parsed"): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (type === "prompt") {
      isPromptCopied.value = true;
      setTimeout(() => (isPromptCopied.value = false), 2000);
    } else if (type === "answer") {
      isAnswerCopied.value = true;
      setTimeout(() => (isAnswerCopied.value = false), 2000);
    } else {
      isParsedCopied.value = true;
      setTimeout(() => (isParsedCopied.value = false), 2000);
    }
  } catch (err) {
    console.warn("复制失败:", err);
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (!props.isOpen) return;

  if (e.key === "Escape") {
    emit("close");
  } else if (e.key === "ArrowLeft") {
    if (activeIndex.value > 0) {
      selectStep(activeIndex.value - 1);
    }
  } else if (e.key === "ArrowRight") {
    if (activeIndex.value < props.steps.length - 1) {
      selectStep(activeIndex.value + 1);
    }
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
      v-if="isOpen && currentStep"
      class="probe-modal-backdrop"
      @click.self="emit('close')"
    >
      <div
        class="probe-modal-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`modal-title-${activeIndex}`"
      >
        <!-- 弹窗顶栏 -->
        <div class="probe-modal-header">
          <div class="header-left">
            <h3 :id="`modal-title-${activeIndex}`" class="probe-modal-title">
              探针题目与模型回答详情
            </h3>
            <div class="step-nav-tabs">
              <button
                v-for="(stepItem, idx) in steps"
                :key="stepItem.id"
                type="button"
                class="step-tab-btn"
                :class="{
                  active: idx === activeIndex,
                  working: stepItem.state === 'working',
                  done: stepItem.state === 'done',
                  error: stepItem.state === 'error',
                }"
                @click="selectStep(idx)"
              >
                <span class="tab-index">{{ idx + 1 }}</span>
                <span class="tab-label">挑战 {{ idx + 1 }}</span>
                <span class="tab-dot"></span>
              </button>
            </div>
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
          <!-- 区块 1：当前抽到的实际题目内容 (Prompt) -->
          <section class="modal-section">
            <div class="section-header">
              <div class="section-title-wrap">
                <span class="section-label">当前实际抽到的题目 (Prompt)</span>
                <span v-if="currentStep.expectedCount" class="section-hint">
                  抽取目标：{{ currentStep.expectedCount }} 个无语义整数 (1~355)
                </span>
              </div>
              <button
                v-if="currentStep.prompt"
                type="button"
                class="btn-copy"
                :class="{ copied: isPromptCopied }"
                @click="copyText(currentStep.prompt, 'prompt')"
                title="复制题目 Prompt 文本"
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
              {{ currentStep.prompt || "暂无题目内容（测试尚未开始）" }}
            </div>
          </section>

          <!-- 区块 2：模型给出的实际回答 (Model Output) -->
          <section class="modal-section">
            <div class="section-header">
              <div class="section-title-wrap">
                <span class="section-label">模型实际回答 (Model Output)</span>
                <span
                  v-if="currentStep.parsedNumbers && currentStep.parsedNumbers.length > 0"
                  class="section-hint success-hint"
                >
                  已提取有效整数：{{ currentStep.parsedNumbers.length }} 个
                </span>
                <span
                  v-else-if="currentStep.state === 'working'"
                  class="section-hint working-hint"
                >
                  正在生成中...
                </span>
              </div>
              <div class="header-actions">
                <button
                  v-if="currentStep.parsedNumbers && currentStep.parsedNumbers.length > 0"
                  type="button"
                  class="btn-toggle-numbers"
                  :class="{ active: showNumbersPreview }"
                  @click="showNumbersPreview = !showNumbersPreview"
                  title="展开/收起解析出的整数列表"
                >
                  <span>{{ showNumbersPreview ? "收起数字列表" : "查看解析数字" }}</span>
                </button>
                <button
                  v-if="currentStep.answer"
                  type="button"
                  class="btn-copy"
                  :class="{ copied: isAnswerCopied }"
                  @click="copyText(currentStep.answer, 'answer')"
                  title="复制模型实际回答文本"
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
              v-if="showNumbersPreview && currentStep.parsedNumbers && currentStep.parsedNumbers.length > 0"
              class="numbers-preview-box"
            >
              <div class="numbers-preview-header">
                <span>有效整数序列预览（共 {{ currentStep.parsedNumbers.length }} 个）：</span>
                <button
                  type="button"
                  class="btn-copy-mini"
                  @click="copyText(currentStep.parsedNumbers.join(', '), 'parsed')"
                >
                  {{ isParsedCopied ? "已复制" : "复制数字列表" }}
                </button>
              </div>
              <div class="numbers-chip-grid">
                <span
                  v-for="(num, nIdx) in currentStep.parsedNumbers"
                  :key="nIdx"
                  class="number-chip"
                >
                  {{ num }}
                </span>
              </div>
            </div>

            <!-- 已有完整回答 -->
            <div v-if="currentStep.answer" class="answer-text-box">
              <pre class="answer-pre">{{ currentStep.answer }}</pre>
            </div>

            <!-- 正在思考与生成回答中 -->
            <div v-else-if="currentStep.state === 'working'" class="modal-status-placeholder working">
              <div class="status-spinner"></div>
              <div class="placeholder-text">
                <strong>模型正在生成长整数序列...</strong>
                <p>正在执行 API 探测请求并实时等待完整返回，请稍候。</p>
              </div>
            </div>

            <!-- 等待发起 -->
            <div v-else-if="currentStep.state === 'pending'" class="modal-status-placeholder pending">
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
                <p class="error-msg">{{ currentStep.error || "未收到模型返回的有效文本数据" }}</p>
              </div>
            </div>
          </section>
        </div>

        <!-- 弹窗底栏 -->
        <div class="probe-modal-footer">
          <div class="footer-shortcuts-hint">
            <span>支持使用键盘 <strong>← / →</strong> 键快速切换题目，<strong>Esc</strong> 键关闭</span>
          </div>
          <div class="footer-actions">
            <button
              type="button"
              class="btn btn-secondary modal-footer-btn"
              :disabled="activeIndex === 0"
              @click="selectStep(activeIndex - 1)"
            >
              上一题
            </button>
            <button
              type="button"
              class="btn btn-secondary modal-footer-btn"
              :disabled="activeIndex === steps.length - 1"
              @click="selectStep(activeIndex + 1)"
            >
              下一题
            </button>
            <button
              type="button"
              class="btn btn-primary modal-footer-btn"
              @click="emit('close')"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.probe-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 13, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.probe-modal-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 720px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75), 0 0 28px rgba(99, 102, 241, 0.2);
  animation: modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;

  .probe-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid var(--border-subtle);
    background: rgba(17, 23, 34, 0.85);

    .header-left {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;

      .probe-modal-title {
        font-size: 0.92rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
      }

      .step-nav-tabs {
        display: flex;
        gap: 4px;
        background: rgba(10, 14, 22, 0.6);
        padding: 2px 3px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-subtle);

        .step-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: calc(var(--radius-sm) - 2px);
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.72rem;
          cursor: pointer;
          transition: all var(--transition-fast);

          .tab-index {
            font-weight: 700;
          }

          .tab-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--text-muted);
            opacity: 0.4;
          }

          &:hover {
            color: var(--text-primary);
            background: rgba(255, 255, 255, 0.05);
          }

          &.active {
            background: var(--bg-card);
            border-color: var(--accent-primary);
            color: #fff;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);

            .tab-dot {
              background: var(--accent-primary);
              opacity: 1;
              box-shadow: 0 0 6px var(--accent-primary);
            }
          }

          &.done .tab-dot {
            background: var(--success);
            opacity: 1;
          }

          &.working .tab-dot {
            background: var(--accent-primary);
            opacity: 1;
            animation: pulse 1.2s infinite;
          }

          &.error .tab-dot {
            background: var(--danger);
            opacity: 1;
          }
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
    padding: 16px 20px;
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
  }

  .probe-modal-footer {
    padding: 10px 18px;
    border-top: 1px solid var(--border-subtle);
    background: rgba(17, 23, 34, 0.75);
    display: flex;
    justify-content: space-between;
    align-items: center;

    .footer-shortcuts-hint {
      font-size: 0.7rem;
      color: var(--text-muted);

      strong {
        color: var(--text-secondary);
      }
    }

    .footer-actions {
      display: flex;
      align-items: center;
      gap: 8px;

      .modal-footer-btn {
        padding: 5px 14px;
        font-size: 0.76rem;
      }
    }
  }
}
</style>
