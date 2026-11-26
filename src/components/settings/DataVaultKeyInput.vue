<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { Check, Copy, Eye, EyeOff, KeyRound } from "@lucide/vue";
import { useClipboard } from "../../composables/useClipboard";
import { generateRandomVaultKey } from "../../utils/dataVault";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    autocomplete?: string;
    allowGenerate?: boolean;
    allowCopy?: boolean;
  }>(),
  {
    placeholder: "",
    autocomplete: "off",
    allowGenerate: false,
    allowCopy: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "enter"): void;
}>();

const { copy } = useClipboard();

const isVisible = ref(false);
const copied = ref(false);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const actionCount = computed(
  () => 1 + (props.allowGenerate ? 1 : 0) + (props.allowCopy ? 1 : 0)
);

const inputPaddingRight = computed(() => `${10 + actionCount.value * 22 + Math.max(0, actionCount.value - 1) * 2}px`);

function handleInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}

function handleGenerate(): void {
  emit("update:modelValue", generateRandomVaultKey(20));
  isVisible.value = true;
}

async function handleCopy(): Promise<void> {
  const key = props.modelValue.trim();
  if (!key) return;
  const ok = await copy(key);
  if (!ok) return;

  copied.value = true;
  if (copyResetTimer) clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    copied.value = false;
    copyResetTimer = null;
  }, 1800);
}

onUnmounted(() => {
  if (copyResetTimer) {
    clearTimeout(copyResetTimer);
    copyResetTimer = null;
  }
});
</script>

<template>
  <div class="key-input-wrap">
    <input
      :value="modelValue"
      :type="isVisible ? 'text' : 'password'"
      class="key-input"
      :style="{ paddingRight: inputPaddingRight }"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      spellcheck="false"
      @input="handleInput"
      @keydown.enter="emit('enter')"
    />
    <div class="key-input-actions">
      <button
        type="button"
        class="icon-action-btn"
        :title="isVisible ? '隐藏密钥' : '显示密钥'"
        @click="isVisible = !isVisible"
      >
        <EyeOff v-if="isVisible" :size="13" />
        <Eye v-else :size="13" />
      </button>
      <button
        v-if="allowGenerate"
        type="button"
        class="icon-action-btn"
        title="随机生成高强度密钥"
        @click="handleGenerate"
      >
        <KeyRound :size="13" />
      </button>
      <button
        v-if="allowCopy"
        type="button"
        class="icon-action-btn"
        :disabled="!modelValue.trim()"
        title="复制密钥"
        @click="handleCopy"
      >
        <Check v-if="copied" :size="13" class="icon-success" />
        <Copy v-else :size="13" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.key-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.key-input {
  width: 100%;
  height: 30px;
  padding: 0 34px 0 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

  &:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--border-glow);
  }

  &::placeholder {
    color: var(--text-placeholder);
    font-family: inherit;
  }
}

.key-input-actions {
  position: absolute;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 2px;
}

.icon-action-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  line-height: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);

  :deep(svg) {
    display: block;
    flex-shrink: 0;
  }

  &:hover:not(:disabled) {
    background: var(--overlay-medium);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .icon-success {
    color: var(--success-text);
  }
}
</style>
