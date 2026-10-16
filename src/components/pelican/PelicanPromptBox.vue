<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from "vue";
import { Terminal, RotateCcw, Check, SquarePen, Copy, Sparkles, ChevronDown } from "@lucide/vue";
import { useClipboard } from "../../composables/useClipboard";
import { DEFAULT_PELICAN_PROMPT } from "../../composables/usePelicanTest";
import { PELICAN_PRESETS, type PelicanPreset } from "../../data/pelicanPresets";

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

const presetWrapperRef = ref<HTMLDivElement | null>(null);
const isPresetDropdownOpen = ref(false);

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

function togglePresetDropdown(): void {
  if (props.isRunning) return;
  isPresetDropdownOpen.value = !isPresetDropdownOpen.value;
}

function closePresetDropdown(): void {
  isPresetDropdownOpen.value = false;
}

function handleSelectPreset(preset: PelicanPreset): void {
  if (props.isRunning) return;
  if (isEditingPrompt.value) {
    editingPrompt.value = preset.prompt;
  }
  emit("update:prompt", preset.prompt);
  closePresetDropdown();
}

function handleDocumentClick(e: MouseEvent): void {
  if (!isPresetDropdownOpen.value) return;
  if (presetWrapperRef.value && !presetWrapperRef.value.contains(e.target as Node)) {
    closePresetDropdown();
  }
}

function handleDocumentKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && isPresetDropdownOpen.value) {
    closePresetDropdown();
  }
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("keydown", handleDocumentKeydown);
});

watch(
  () => props.isRunning,
  (running) => {
    if (running) {
      if (isEditingPrompt.value) {
        isEditingPrompt.value = false;
      }
      if (isPresetDropdownOpen.value) {
        isPresetDropdownOpen.value = false;
      }
    }
  }
);
</script>

<template>
  <div class="prompt-box" :class="{ 'is-editing': isEditingPrompt }">
    <div class="prompt-header">
      <span class="prompt-label">
        <Terminal :size="13" />
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
            <RotateCcw :size="12" />
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
            <Check :size="12" :stroke-width="2.5" />
            <span>保存</span>
          </button>
        </template>

        <template v-else>
          <!-- 预设选择下拉按钮 -->
          <div ref="presetWrapperRef" class="preset-wrapper">
            <button
              type="button"
              class="btn-prompt-action preset"
              :class="{ active: isPresetDropdownOpen }"
              :disabled="isRunning"
              title="选择测试提示词预设"
              @click.stop="togglePresetDropdown"
            >
              <Sparkles :size="12" />
              <span>预设</span>
              <ChevronDown
                :size="10"
                class="preset-chevron"
                :class="{ 'is-open': isPresetDropdownOpen }"
              />
            </button>

            <!-- 预设下拉浮层 -->
            <Transition name="preset-dropdown-fade">
              <div
                v-if="isPresetDropdownOpen"
                class="preset-dropdown-menu"
                role="menu"
                @click.stop
              >
                <button
                  v-for="preset in PELICAN_PRESETS"
                  :key="preset.id"
                  type="button"
                  class="preset-dropdown-item"
                  :class="{ 'is-selected': preset.prompt === currentPrompt }"
                  :title="preset.prompt"
                  role="menuitem"
                  @click="handleSelectPreset(preset)"
                >
                  <span class="preset-name">{{ preset.name }}</span>
                  <Check
                    v-if="preset.prompt === currentPrompt"
                    :size="12"
                    class="preset-check-icon"
                    :stroke-width="2.5"
                  />
                </button>
              </div>
            </Transition>
          </div>

          <button
            type="button"
            class="btn-prompt-action copy"
            title="复制测试提示词到剪贴板"
            @click="handleCopyPrompt"
          >
            <Copy v-if="!promptCopied" :size="12" />
            <Check
              v-else
              :size="12"
              stroke="#10b981"
              :stroke-width="2.5"
            />
            <span>{{ promptCopied ? "已复制" : "复制" }}</span>
          </button>
          <button
            type="button"
            class="btn-prompt-action edit"
            :disabled="isRunning"
            title="编辑测试提示词"
            @click="startEditing"
          >
            <SquarePen :size="12" />
            <span>编辑</span>
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
    gap: 6px;
  }

  .preset-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .preset-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 120px;
    width: max-content;
    background: #0f172a;
    border: 1px solid rgba(51, 65, 85, 0.8);
    border-radius: var(--radius-sm, 6px);
    box-shadow: 0 8px 24px -2px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: 100;
    padding: 3px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    box-sizing: border-box;
  }

  .preset-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    height: 25px;
    padding: 0 7px;
    background: transparent;
    border: none;
    border-radius: var(--radius-xs, 4px);
    color: var(--text-secondary);
    font-size: 0.7rem;
    line-height: 1;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
    transition: all var(--transition-fast);
    font-family: inherit;

    .preset-name {
      line-height: 1;
    }

    .preset-check-icon {
      color: #10b981;
      flex-shrink: 0;
    }

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
    }

    &.is-selected {
      background: rgba(99, 102, 241, 0.16);
      color: #a5b4fc;
      font-weight: 500;

      &:hover {
        background: rgba(99, 102, 241, 0.22);
        color: #c7d2fe;
      }
    }
  }

  .preset-dropdown-fade-enter-active,
  .preset-dropdown-fade-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .preset-dropdown-fade-enter-from,
  .preset-dropdown-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }

  .btn-prompt-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 22px;
    padding: 0 7px;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.7rem;
    line-height: 1;
    cursor: pointer;
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
      transform: translateY(-0.5px);
    }

    .preset-chevron {
      color: var(--text-muted);
      transition: transform var(--transition-fast), color var(--transition-fast);
      flex-shrink: 0;

      &.is-open {
        transform: rotate(180deg);
        color: #fff;
      }
    }

    &:hover:not(:disabled) {
      background: rgba(30, 41, 59, 0.9);
      color: #fff;
      border-color: rgba(99, 102, 241, 0.4);

      .preset-chevron {
        color: #fff;
      }
    }

    &.active {
      background: rgba(99, 102, 241, 0.25);
      border-color: #6366f1;
      color: #fff;

      .preset-chevron {
        color: #fff;
      }
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.save {
      background: rgba(99, 102, 241, 0.25);
      border-color: #6366f1;
      color: #fff;

      &:hover:not(:disabled) {
        background: rgba(99, 102, 241, 0.45);
        color: #fff;
        border-color: #818cf8;
      }
    }

    &.reset {
      &:hover:not(:disabled) {
        color: #fbbf24;
        border-color: rgba(245, 158, 11, 0.4);
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
