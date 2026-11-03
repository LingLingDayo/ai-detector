<script setup lang="ts">
import { ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    min: undefined,
    max: undefined,
    step: 1,
    unit: undefined,
    placeholder: undefined,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: number): void;
  (e: "change", value: number): void;
}>();

const text = ref(String(props.modelValue));

watch(
  () => props.modelValue,
  (value) => {
    if (Number(text.value) !== value) {
      text.value = String(value);
    }
  }
);

function clamp(value: number): number {
  let next = value;
  if (props.min !== undefined) next = Math.max(props.min, next);
  if (props.max !== undefined) next = Math.min(props.max, next);
  return next;
}

function commit(value: number): void {
  const next = clamp(value);
  if (next !== props.modelValue) {
    emit("update:modelValue", next);
    emit("change", next);
  }
  text.value = String(next);
}

function handleInput(event: Event): void {
  text.value = (event.target as HTMLInputElement).value;
  const parsed = Number(text.value);
  if (text.value.trim() !== "" && Number.isFinite(parsed)) {
    commit(parsed);
  }
}

function handleBlur(): void {
  const parsed = Number(text.value);
  commit(text.value.trim() === "" || !Number.isFinite(parsed) ? props.modelValue : parsed);
}

function handleStep(direction: 1 | -1): void {
  if (props.disabled) return;
  const parsed = Number(text.value);
  const base = Number.isFinite(parsed) ? parsed : props.modelValue;
  commit(base + direction * props.step);
}
</script>

<template>
  <div
    class="number-input"
    :class="{ 'is-disabled': disabled }"
  >
    <input
      class="number-field"
      type="number"
      inputmode="numeric"
      :value="text"
      :min="min"
      :max="max"
      :step="step"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="handleInput"
      @blur="handleBlur"
      @keydown.up.prevent="handleStep(1)"
      @keydown.down.prevent="handleStep(-1)"
    />
    <span
      v-if="unit"
      class="number-unit"
    >{{ unit }}</span>
  </div>
</template>

<style lang="scss" scoped>
.number-input {
  display: flex;
  align-items: center;
  gap: 6px;
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

.number-field {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: var(--text-placeholder);
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    margin: 0;
    appearance: none;
  }

  &[type="number"] {
    appearance: textfield;
  }
}

.number-unit {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
