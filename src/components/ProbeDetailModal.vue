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
