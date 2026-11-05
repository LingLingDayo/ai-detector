<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
    label?: string;
  }>(),
  {
    disabled: false,
    label: undefined,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "change", value: boolean): void;
}>();

function handleToggle(): void {
  if (props.disabled) return;
  const next = !props.modelValue;
  emit("update:modelValue", next);
  emit("change", next);
}
</script>

<template>
  <button
    type="button"
    class="toggle-switch"
    :class="{ 'is-on': modelValue }"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="handleToggle"
  >
    <span class="toggle-thumb"></span>
  </button>
</template>

<style lang="scss" scoped>
.toggle-switch {
  position: relative;
  width: 38px;
  height: 22px;
  flex-shrink: 0;
  padding: 2px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--bg-segmented);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);

  .toggle-thumb {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: transform var(--transition-fast), background var(--transition-fast);
  }

  &.is-on {
    background: rgba(var(--accent-rgb), 0.35);
    border-color: rgba(var(--accent-rgb), 0.55);

    .toggle-thumb {
      transform: translateX(16px);
      background: var(--accent-primary, #6366f1);
    }
  }

  &:hover:not(:disabled) {
    border-color: rgba(var(--accent-rgb), 0.5);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
