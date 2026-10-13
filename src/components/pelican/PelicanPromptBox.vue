<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";
import { useClipboard } from "../../composables/useClipboard";
import { DEFAULT_PELICAN_PROMPT } from "../../composables/usePelicanTest";

const props = withDefaults(
  defineProps<{
    prompt?: string;
    isRunning?: boolean;
  }>(),
  {
    prompt: DEFAULT_PELICAN_PROMPT,
    isRunning: false,
  }
);

const emit = defineEmits<{
  (e: "update:prompt", value: string): void;
}>();

const { copied: promptCopied, copy: copyPrompt } = useClipboard();

const isEditingPrompt = ref(false);
const editingPrompt = ref("");
const promptTextareaRef = ref<HTMLTextAreaElement | null>(null);

const currentPrompt = computed(() => props.prompt || DEFAULT_PELICAN_PROMPT);
const isCustomPrompt = computed(() => currentPrompt.value !== DEFAULT_PELICAN_PROMPT);

function handleCopyPrompt(): void {
  copyPrompt(currentPrompt.value);
}

function startEditing(): void {
  if (props.isRunning) return;
  editingPrompt.value = currentPrompt.value;
  isEditingPrompt.value = true;
  nextTick(() => {
    promptTextareaRef.value?.focus();
    promptTextareaRef.value?.select();
  });
}

function cancelEditing(): void {
  isEditingPrompt.value = false;
}

function savePrompt(): void {
  const trimmed = editingPrompt.value.trim();
  const nextVal = trimmed || DEFAULT_PELICAN_PROMPT;
  emit("update:prompt", nextVal);
  isEditingPrompt.value = false;
}

function handleResetToDefault(): void {
  editingPrompt.value = DEFAULT_PELICAN_PROMPT;
}

watch(
  () => props.isRunning,
  (running) => {
    if (running && isEditingPrompt.value) {
      isEditingPrompt.value = false;
    }
  }
);
</script>

<template>
  <div class="prompt-box" :class="{ 'is-editing': isEditingPrompt }">
    <div class="prompt-header">
      <span class="prompt-label">
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <span>测试提示词</span>
        <span v-if="isCustomPrompt" class="custom-badge" title="当前使用自定义提示词">自定义</span>
      </span>

      <div class="prompt-actions">
        <template v-if="isEditingPrompt">
          <button
            v-if="editingPrompt !== DEFAULT_PELICAN_PROMPT"
            type="button"
            class="btn-prompt-action reset"
            title="恢复为默认提示词"
            @click="handleResetToDefault"
          >
            <svg
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>恢复默认</span>
          </button>
          <button
            type="button"
            class="btn-prompt-action cancel"
            title="取消编辑"
            @click="cancelEditing"
          >
            <span>取消</span>
          </button>
          <button
            type="button"
            class="btn-prompt-action save"
            title="保存提示词"
            @click="savePrompt"
          >
            <svg
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>保存</span>
          </button>
        </template>

        <template v-else>
          <button
            type="button"
            class="btn-prompt-action edit"
            :disabled="isRunning"
            title="编辑测试提示词"
            @click="startEditing"
          >
            <svg
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span>编辑</span>
          </button>
          <button
            type="button"
            class="btn-prompt-action copy"
            title="复制测试提示词到剪贴板"
            @click="handleCopyPrompt"
          >
            <svg
              v-if="!promptCopied"
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="#10b981"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{{ promptCopied ? "已复制" : "复制" }}</span>
          </button>
        </template>
      </div>
    </div>

    <div v-if="!isEditingPrompt" class="prompt-content">
      <code>{{ currentPrompt }}</code>
    </div>
    <div v-else class="prompt-edit-container">
      <textarea
        ref="promptTextareaRef"
        v-model="editingPrompt"
        class="prompt-textarea"
        rows="3"
        placeholder="输入自定义测试提示词..."
      />
      <div class="prompt-edit-footer">
        <span class="prompt-char-count">{{ editingPrompt.length }} 字符</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.prompt-box {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(51, 65, 85, 0.5);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);

  &.is-editing {
    border-color: rgba(99, 102, 241, 0.45);
    background: rgba(15, 23, 42, 0.75);
  }
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .prompt-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #94a3b8;
    letter-spacing: 0.5px;

    .custom-badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 5px;
      border-radius: 9999px;
      font-size: 0.65rem;
      font-weight: 500;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #a5b4fc;
      margin-left: 2px;
    }
  }

  .prompt-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .btn-prompt-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 20px;
    padding: 0 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    font-size: 0.72rem;
    line-height: 1;
    cursor: pointer;
    border-radius: 3px;
    transition: all var(--transition-fast);
    font-family: inherit;

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
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.08);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.edit {
      border: 1px solid var(--border-subtle);
      background: rgba(30, 41, 59, 0.4);

      &:hover:not(:disabled) {
        border-color: rgba(99, 102, 241, 0.4);
        background: rgba(99, 102, 241, 0.15);
        color: #e0e7ff;
      }
    }

    &.save {
      background: rgba(99, 102, 241, 0.25);
      border: 1px solid #6366f1;
      color: #c7d2fe;

      &:hover {
        background: rgba(99, 102, 241, 0.45);
        color: #ffffff;
      }
    }

    &.cancel {
      border: 1px solid var(--border-subtle);
      background: rgba(30, 41, 59, 0.4);

      &:hover {
        color: #cbd5e1;
        background: rgba(255, 255, 255, 0.08);
      }
    }

    &.reset {
      color: #94a3b8;

      &:hover {
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.1);
      }
    }
  }
}

.prompt-content {
  code {
    display: block;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.78rem;
    color: #38bdf8;
    line-height: 1.45;
    word-break: break-all;
    user-select: text;
  }
}

.prompt-edit-container {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 2px;
}

.prompt-textarea {
  width: 100%;
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: var(--radius-xs, 4px);
  padding: 6px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  color: #e2e8f0;
  line-height: 1.45;
  resize: vertical;
  min-height: 56px;
  max-height: 160px;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

  &:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
  }
}

.prompt-edit-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  font-size: 0.68rem;
  color: #64748b;
  padding: 0 2px;

  .prompt-char-count {
    color: #64748b;
    font-feature-settings: "tnum";
  }
}
</style>
