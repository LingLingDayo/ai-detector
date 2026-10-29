<script setup lang="ts">
import type { Component } from "vue";

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: Component;
  title?: string;
  disabled?: boolean;
  indicator?: boolean;
  indicatorTitle?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: SegmentedOption[];
    disabled?: boolean;
    showDividers?: boolean;
    size?: "sm" | "md";
    inline?: boolean;
    stackOnMobile?: boolean;
    role?: "group" | "tablist";
  }>(),
  {
    disabled: false,
    showDividers: false,
    size: "md",
    inline: false,
    stackOnMobile: false,
    role: "group",
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "change", value: string): void;
}>();

function handleSelect(option: SegmentedOption): void {
  if (props.disabled || option.disabled || option.value === props.modelValue) return;
  emit("update:modelValue", option.value);
  emit("change", option.value);
}
</script>

<template>
  <div
    class="segmented-control"
    :class="[
      `size-${size}`,
      {
        'is-inline': inline,
        'show-dividers': showDividers,
        'stack-on-mobile': stackOnMobile,
      },
    ]"
    :role="role"
  >
    <template
      v-for="(option, index) in options"
      :key="option.value"
    >
      <span
        v-if="showDividers && index > 0"
        class="segment-divider"
        aria-hidden="true"
      ></span>
      <button
        type="button"
        class="segment"
        :class="{ active: option.value === modelValue }"
        :disabled="disabled || option.disabled"
        :role="role === 'tablist' ? 'tab' : undefined"
        :aria-selected="role === 'tablist' ? option.value === modelValue : undefined"
        :aria-pressed="role === 'group' ? option.value === modelValue : undefined"
        :title="option.title"
        @click="handleSelect(option)"
      >
        <component
          :is="option.icon"
          v-if="option.icon"
          class="segment-icon"
          :size="size === 'sm' ? 12 : 13"
        />
        <span class="segment-label">{{ option.label }}</span>
        <span
          v-if="option.indicator"
          class="segment-indicator"
          :title="option.indicatorTitle"
        ></span>
      </button>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.segmented-control {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 2px;
  padding: 2px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);

  &.is-inline {
    width: auto;
    flex-shrink: 0;
  }

  .segment {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 3.5px 8px;
    border: 1px solid transparent;
    border-radius: calc(var(--radius-sm) - 2px);
    background: transparent;
    color: var(--text-secondary);
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.25;
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--transition-fast);

    .segment-icon {
      display: block;
      flex-shrink: 0;
    }

    .segment-label {
      display: inline-flex;
      align-items: center;
      line-height: 1;
    }

    .segment-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--accent-primary, #6366f1);
      box-shadow: 0 0 8px rgba(99, 102, 241, 0.85);
      animation: segment-pulse 1.4s infinite ease-in-out;
      flex-shrink: 0;
    }

    &:hover:not(:disabled):not(.active) {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.04);
    }

    &.active {
      background: rgba(99, 102, 241, 0.2);
      border-color: rgba(99, 102, 241, 0.5);
      color: #ffffff;
      font-weight: 600;
      box-shadow: 0 1px 6px rgba(99, 102, 241, 0.2);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .segment-divider {
    flex: 0 0 1px;
    width: 1px;
    height: 12px;
    align-self: center;
    border-radius: 1px;
    background: rgba(148, 163, 184, 0.22);
    pointer-events: none;
  }

  &.size-sm .segment {
    height: 26px;
    padding: 0 8px;
    gap: 4px;
    font-size: 0.7rem;
    line-height: 1;
  }

  &.stack-on-mobile {
    @media (max-width: 640px) {
      flex-direction: column;
      align-items: stretch;

      .segment {
        flex: 0 0 auto;
        width: 100%;
      }

      .segment-divider {
        display: none;
      }
    }
  }
}

@keyframes segment-pulse {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 0.7;
    box-shadow: 0 0 4px rgba(99, 102, 241, 0.6);
  }
  50% {
    transform: scale(1.35);
    opacity: 1;
    box-shadow: 0 0 10px rgba(99, 102, 241, 1);
  }
}
</style>
