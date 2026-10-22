<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ArrowUp, ImagePlus, Loader2, Square, X } from "@lucide/vue";
import type { ConnectionImageAttachment } from "../../types";
import { useImageAttachments } from "./useImageAttachments";

const props = withDefaults(
  defineProps<{
    running?: boolean;
    generating?: boolean;
    configReady?: boolean;
    disabledHint?: string;
    focusSignal?: number;
  }>(),
  {
    running: false,
    generating: false,
    configReady: true,
    disabledHint: "",
    focusSignal: 0,
  }
);

const emit = defineEmits<{
  (e: "send", payload: { text: string; images: ConnectionImageAttachment[] }): void;
  (e: "stop"): void;
}>();

const text = ref("");
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragOver = ref(false);

const {
  images,
  isProcessing,
  error: attachmentError,
  addFiles,
  removeImage,
  clearImages,
} = useImageAttachments();

const canSend = computed(
  () =>
    props.configReady &&
    !props.running &&
    !isProcessing.value &&
    (text.value.trim().length > 0 || images.value.length > 0)
);

const placeholder = computed(() => {
  if (!props.configReady) {
    return props.disabledHint || "请先在上方完成接口配置";
  }
  if (props.running) {
    return "可继续输入下一条消息，回复结束后发送…";
  }
  return "输入消息，Enter 发送，Shift + Enter 换行…";
});

function resizeTextarea(): void {
  const element = textareaRef.value;
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 152)}px`;
}

function focus(): void {
  nextTick(() => {
    textareaRef.value?.focus();
    resizeTextarea();
  });
}

function fillText(value: string): void {
  text.value = value;
  focus();
}

function handleSend(): void {
  if (!canSend.value) return;
  const payload = {
    text: text.value.trim(),
    images: [...images.value],
  };
  text.value = "";
  clearImages();
  emit("send", payload);
  nextTick(() => {
    resizeTextarea();
    textareaRef.value?.focus();
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!props.running) {
    handleSend();
  }
}

function openFilePicker(): void {
  fileInputRef.value?.click();
}

async function handleFileInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) {
    await addFiles(input.files);
  }
  input.value = "";
}

function handlePaste(event: ClipboardEvent): void {
  const items = event.clipboardData?.items;
  if (!items) return;
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length > 0) {
    event.preventDefault();
    void addFiles(files);
  }
}

function handleDragOver(event: DragEvent): void {
  if (event.dataTransfer?.types.includes("Files")) {
    isDragOver.value = true;
  }
}

function handleDragLeave(event: DragEvent): void {
  const target = event.currentTarget as HTMLElement | null;
  if (target && event.relatedTarget && target.contains(event.relatedTarget as Node)) {
    return;
  }
  isDragOver.value = false;
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  const files = event.dataTransfer?.files;
  if (files?.length) {
    void addFiles(files);
  }
}

function handleSendButton(): void {
  if (props.running) {
    emit("stop");
    return;
  }
  handleSend();
}

watch(
  () => props.focusSignal,
  () => focus()
);

watch(
  () => text.value,
  () => nextTick(resizeTextarea)
);

defineExpose({ focus, fillText });
</script>

<template>
  <div
    class="composer-wrap"
    @dragenter.prevent="handleDragOver"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div class="composer-shell" :class="{ 'is-running': running }">
      <div v-if="images.length > 0 || isProcessing" class="attachment-strip">
        <div
          v-for="image in images"
          :key="image.id"
          class="attachment-thumb"
          :title="image.name"
        >
          <img :src="image.previewUrl" :alt="image.name" />
          <button
            type="button"
            class="remove-attachment"
            title="移除图片"
            @click="removeImage(image.id)"
          >
            <X :size="11" />
          </button>
        </div>
        <div v-if="isProcessing" class="processing-thumb" title="正在处理图片">
          <Loader2 :size="16" class="spin" />
        </div>
      </div>

      <textarea
        ref="textareaRef"
        v-model="text"
        class="composer-input"
        rows="1"
        :placeholder="placeholder"
        spellcheck="false"
        @keydown="handleKeydown"
        @paste="handlePaste"
      ></textarea>

      <div class="composer-toolbar">
        <div class="toolbar-left">
          <button
            type="button"
            class="attach-btn"
            title="添加图片，支持粘贴 / 拖入，最多 4 张"
            :disabled="running || images.length >= 4"
            @click="openFilePicker"
          >
            <ImagePlus :size="15" />
          </button>
        </div>

        <div class="toolbar-right">
          <span v-if="running" class="generating-hint">
            <span class="generating-dot"></span>
            {{ generating ? "生成中" : "连接中" }}
          </span>
          <button
            type="button"
            class="send-btn"
            :class="{ 'is-stop': running, 'is-ready': canSend }"
            :disabled="!running && !canSend"
            :title="running ? '停止生成' : '发送消息'"
            @click="handleSendButton"
          >
            <Square v-if="running" :size="12" fill="currentColor" />
            <ArrowUp v-else :size="16" :stroke-width="2.4" />
          </button>
        </div>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        multiple
        aria-label="选择图片"
        tabindex="-1"
        class="hidden-file-input"
        @change="handleFileInput"
      />

      <Transition name="drop-fade">
        <div v-if="isDragOver" class="drop-overlay">
          <ImagePlus :size="24" />
          <span>松开以添加图片</span>
        </div>
      </Transition>
    </div>

    <p v-if="attachmentError" class="composer-error">{{ attachmentError }}</p>
    <p v-else-if="!configReady && disabledHint" class="composer-disabled-hint">
      {{ disabledHint }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.composer-wrap {
  position: relative;
}

.composer-shell {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.085);
  border-radius: 11px;
  background: rgba(9, 14, 24, 0.86);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

  &:focus-within {
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1), 0 8px 24px rgba(0, 0, 0, 0.22);
  }

  &.is-running {
    border-color: rgba(99, 102, 241, 0.32);
  }
}

.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 9px 11px 0;
}

.attachment-thumb {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 7px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #0b111d;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .remove-attachment {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: rgba(2, 6, 14, 0.74);
    color: #cbd5e1;
    cursor: pointer;
    transition: all var(--transition-fast);

    &:hover {
      background: rgba(239, 68, 68, 0.82);
      color: #fff;
    }
  }
}

.processing-thumb {
  width: 54px;
  height: 54px;
  border-radius: 7px;
  border: 1px dashed rgba(99, 102, 241, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818cf8;
  background: rgba(99, 102, 241, 0.05);

  .spin {
    animation: composer-spin 0.9s linear infinite;
  }
}

.composer-input {
  display: block;
  width: 100%;
  min-height: 46px;
  max-height: 152px;
  padding: 11px 13px 4px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: #e2e8f0;
  font-family: inherit;
  font-size: 0.8rem;
  line-height: 1.62;
  overflow-y: auto;

  &::placeholder {
    color: #4f5e74;
  }
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 8px 9px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.attach-btn {
  width: 27px;
  height: 27px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: transparent;
  border: 1px solid transparent;
  color: #7b8ba3;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover:not(:disabled) {
    color: #c7d2fe;
    background: rgba(99, 102, 241, 0.12);
    border-color: rgba(99, 102, 241, 0.22);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.generating-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.65rem;
  color: #a5b4fc;
  white-space: nowrap;

  .generating-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #818cf8;
    box-shadow: 0 0 8px rgba(129, 140, 248, 0.9);
    animation: composer-pulse 1.15s infinite ease-in-out;
  }
}

.send-btn {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(51, 65, 85, 0.42);
  color: #64748b;
  cursor: not-allowed;
  transition: all var(--transition-fast);

  &.is-ready {
    background: linear-gradient(135deg, #6366f1, #3b82f6);
    border-color: rgba(129, 140, 248, 0.55);
    color: #fff;
    cursor: pointer;
    box-shadow: 0 3px 12px rgba(99, 102, 241, 0.38);

    &:hover {
      background: linear-gradient(135deg, #7274f4, #4f8ff8);
    }
  }

  &.is-stop {
    background: rgba(239, 68, 68, 0.16);
    border-color: rgba(239, 68, 68, 0.38);
    color: #fca5a5;
    cursor: pointer;

    &:hover {
      background: rgba(239, 68, 68, 0.26);
      color: #fee2e2;
    }
  }
}

.hidden-file-input {
  display: none;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px dashed rgba(129, 140, 248, 0.65);
  border-radius: 11px;
  background: rgba(13, 20, 35, 0.93);
  color: #a5b4fc;
  font-size: 0.74rem;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  pointer-events: none;
}

.composer-error {
  margin-top: 5px;
  padding-left: 2px;
  color: #fca5a5;
  font-size: 0.66rem;
}

.composer-disabled-hint {
  margin-top: 5px;
  padding-left: 2px;
  color: #b45309;
  font-size: 0.66rem;
}

.drop-fade-enter-active,
.drop-fade-leave-active {
  transition: opacity 0.14s ease;
}

.drop-fade-enter-from,
.drop-fade-leave-to {
  opacity: 0;
}

@keyframes composer-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes composer-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}
</style>
