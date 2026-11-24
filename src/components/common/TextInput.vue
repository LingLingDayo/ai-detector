<script setup lang="ts">
import { ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    maxLength?: number;
    monospace?: boolean;
  }>(),
  {
    placeholder: undefined,
    disabled: false,
    maxLength: undefined,
    monospace: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "change", value: string): void;
}>();

const text = ref(props.modelValue);
const isTyping = ref(false);

watch(
  () => props.modelValue,
  (value) => {
    if (isTyping.value) return;
    if (text.value !== value) {
      text.value = value;
    }
  }
);

function commit(value: string): void {
  if (value !== props.modelValue) {
    emit("update:modelValue", value);
    emit("change", value);
  }
}

function handleFocus(): void {
  isTyping.value = true;
}

function handleInput(event: Event): void {
  const next = (event.target as HTMLInputElement).value;
  text.value = next;
  commit(next);
}

function handleBlur(): void {
  isTyping.value = false;
  const trimmed = text.value.trim();
  text.value = trimmed;
  commit(trimmed);
}
</script>

<template>
  <div
    class="text-input"
    :class="{ 'is-disabled': disabled }"
  >
    <input
      class="text-field"
      :class="{ 'is-monospace': monospace }"
      type="text"
      :value="text"
      :placeholder="placeholder"
      :maxlength="maxLength"
      :disabled="disabled"
      spellcheck="false"
      autocomplete="off"
      @focus="handleFocus"
      @input="handleInput"
      @blur="handleBlur"
    />
  </div>
</template>

<style lang="scss" scoped>
.text-input {
  display: flex;
  align-items: center;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);

  &:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--border-glow);
  }

  &.is-disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

.text-field {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  outline: none !important;
  box-shadow: none !important;

  &.is-monospace {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 12px;
  }

  &:focus,
  &:focus-visible {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  &::placeholder {
    color: var(--text-placeholder);
  }
}
</style>
