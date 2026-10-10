<script setup lang="ts">
import { ref, computed } from "vue";
import { useClipboard } from "../composables/useClipboard";
import { DEFAULT_PELICAN_PROMPT, type PelicanContentType } from "../composables/usePelicanTest";
import PelicanHeader from "./pelican/PelicanHeader.vue";
import PelicanPromptBox from "./pelican/PelicanPromptBox.vue";
import PelicanStatusBar from "./pelican/PelicanStatusBar.vue";
import PelicanDisplayStage from "./pelican/PelicanDisplayStage.vue";
import PelicanCodeViewer from "./pelican/PelicanCodeViewer.vue";
import PelicanRawResponse from "./pelican/PelicanRawResponse.vue";

const props = withDefaults(
  defineProps<{
    isRunning: boolean;
    svg?: string;
    content?: string;
    contentType?: PelicanContentType;
    rawText: string;
    durationMs: number;
    modelName: string;
    errorMessage: string | null;
    hasTested: boolean;
    prompt?: string;
  }>(),
  {
    svg: "",
    content: "",
    contentType: "svg",
    prompt: DEFAULT_PELICAN_PROMPT,
  }
);

const emit = defineEmits<{
  (e: "update:prompt", value: string): void;
  (e: "reset-prompt"): void;
}>();

const { copied: svgCopied, copy: copySvg } = useClipboard();

const showCode = ref(false);
const bgTheme = ref<"dark" | "checker">("dark");

const displayContent = computed(() => props.content || props.svg || "");

function handleCopyContent(): void {
  if (displayContent.value) {
    copySvg(displayContent.value);
  }
}

function handleDownloadContent(): void {
  if (!displayContent.value) return;
  const isHtml = props.contentType === "html";
  const mimeType = isHtml ? "text/html;charset=utf-8" : "image/svg+xml;charset=utf-8";
  const ext = isHtml ? "html" : "svg";
  const blob = new Blob([displayContent.value], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const cleanModel = (props.modelName || "model").replace(/[^a-zA-Z0-9_-]/g, "_");
  a.href = url;
  a.download = `pelican-${cleanModel}-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="card pelican-card" id="pelican-section">
    <!-- 卡片顶部标头 -->
    <PelicanHeader />

    <!-- 提示词展示与编辑模块 -->
    <PelicanPromptBox
      :prompt="prompt"
      :is-running="isRunning"
      @update:prompt="emit('update:prompt', $event)"
    />

    <!-- 状态指示条（如果有测试信息或正在测试） -->
    <PelicanStatusBar
      v-if="hasTested || isRunning"
      :is-running="isRunning"
      :error-message="errorMessage"
      :svg="displayContent"
      :content="displayContent"
      :content-type="contentType"
      :model-name="modelName"
      :duration-ms="durationMs"
      :bg-theme="bgTheme"
      :show-code="showCode"
      :svg-copied="svgCopied"
      @update:bg-theme="bgTheme = $event"
      @update:show-code="showCode = $event"
      @copy-svg="handleCopyContent"
      @download-svg="handleDownloadContent"
    />

    <!-- 错误警告提示 -->
    <div v-if="errorMessage && !isRunning" class="alert-box error">
      <div class="alert-icon">!</div>
      <div class="alert-content">
        <span class="alert-title">测试失败：</span>
        <span class="alert-msg">{{ errorMessage }}</span>
      </div>
    </div>

    <!-- 主展示区（测试开始后展示） -->
    <PelicanDisplayStage
      v-if="hasTested || isRunning"
      :is-running="isRunning"
      :svg="displayContent"
      :content="displayContent"
      :content-type="contentType"
      :raw-text="rawText"
      :bg-theme="bgTheme"
    />

    <!-- 可折叠的源码展示区 -->
    <PelicanCodeViewer
      v-if="showCode && displayContent && !isRunning"
      :svg="displayContent"
      :content="displayContent"
      :content-type="contentType"
      :svg-copied="svgCopied"
      @copy-svg="handleCopyContent"
    />

    <!-- 可折叠的完整模型原始文本展示区 -->
    <PelicanRawResponse
      v-if="displayContent && rawText && rawText !== displayContent && !isRunning"
      :raw-text="rawText"
    />
  </section>
</template>

<style lang="scss" scoped>
.pelican-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: fadeIn 0.25s ease-out;
}

/* 错误警告条 */
.alert-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.76rem;

  &.error {
    background: var(--danger-bg);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .alert-icon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ef4444;
    color: #fff;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    flex-shrink: 0;
  }

  .alert-title {
    font-weight: 600;
  }
}
</style>
