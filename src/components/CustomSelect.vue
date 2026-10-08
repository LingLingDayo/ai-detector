<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  icon?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    id?: string;
    name?: string;
  }>(),
  {
    placeholder: "请选择...",
    disabled: false,
    id: undefined,
    name: undefined,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "change", value: string): void;
}>();

const selectWrapperRef = ref<HTMLDivElement | null>(null);
const dropdownListRef = ref<HTMLUListElement | null>(null);
const isOpen = ref(false);
const placement = ref<"bottom" | "top">("bottom");
const highlightedIndex = ref(-1);

const selectedOption = computed(() => {
  return props.options.find((opt) => opt.value === props.modelValue);
});

function calculatePlacement(): void {
  if (!selectWrapperRef.value) return;
  const rect = selectWrapperRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  // 如果下方空间不足 230px 且上方空间更大，则向上弹出
  if (spaceBelow < 230 && spaceAbove > spaceBelow) {
    placement.value = "top";
  } else {
    placement.value = "bottom";
  }
}

function toggleDropdown(): void {
  if (props.disabled) return;
  if (isOpen.value) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function openDropdown(): void {
  if (props.disabled) return;
  calculatePlacement();
  isOpen.value = true;
  const currentIdx = props.options.findIndex((opt) => opt.value === props.modelValue);
  highlightedIndex.value = currentIdx >= 0 ? currentIdx : 0;
  nextTick(() => {
    scrollToHighlighted();
  });
}

function closeDropdown(): void {
  isOpen.value = false;
  highlightedIndex.value = -1;
}

function selectOption(option: SelectOption): void {
  emit("update:modelValue", option.value);
  emit("change", option.value);
  closeDropdown();
}

function scrollToHighlighted(): void {
  if (!dropdownListRef.value) return;
  const items = dropdownListRef.value.querySelectorAll<HTMLElement>(".custom-select-option");
  if (items[highlightedIndex.value]) {
    items[highlightedIndex.value].scrollIntoView({ block: "nearest" });
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (props.disabled) return;

  if (!isOpen.value) {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openDropdown();
    }
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    closeDropdown();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (highlightedIndex.value < props.options.length - 1) {
      highlightedIndex.value++;
      scrollToHighlighted();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (highlightedIndex.value > 0) {
      highlightedIndex.value--;
      scrollToHighlighted();
    }
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (highlightedIndex.value >= 0 && highlightedIndex.value < props.options.length) {
      selectOption(props.options[highlightedIndex.value]);
    }
  } else if (e.key === "Tab") {
    closeDropdown();
  }
}

function handleDocumentClick(e: MouseEvent): void {
  if (selectWrapperRef.value && !selectWrapperRef.value.contains(e.target as Node)) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener("click", handleDocumentClick);
});
</script>

<template>
  <div
    ref="selectWrapperRef"
    class="custom-select-wrapper"
    :class="{
      'is-open': isOpen,
      'is-disabled': disabled,
      'placement-top': placement === 'top',
      'placement-bottom': placement === 'bottom',
    }"
    :id="id"
    tabindex="0"
    role="combobox"
    :aria-expanded="isOpen"
    aria-haspopup="listbox"
    @keydown="handleKeydown"
  >
    <!-- 下拉选择触发区域 -->
    <div
      class="custom-select-trigger"
      :class="{ 'has-value': !!selectedOption }"
      @click="toggleDropdown"
    >
      <div class="trigger-content">
        <template v-if="selectedOption">
          <span class="option-label">{{ selectedOption.label }}</span>
          <span v-if="selectedOption.description" class="option-desc">
            - {{ selectedOption.description }}
          </span>
          <span v-if="selectedOption.badge" class="option-badge">
            {{ selectedOption.badge }}
          </span>
        </template>
        <span v-else class="placeholder-text">{{ placeholder }}</span>
      </div>

      <svg
        class="chevron-arrow"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>

    <!-- 下拉选项菜单 -->
    <Transition name="dropdown-fade">
      <div
        v-if="isOpen"
        class="custom-select-dropdown"
        :class="`is-${placement}`"
      >
        <ul
          ref="dropdownListRef"
          class="custom-select-options-list"
          role="listbox"
        >
          <li
            v-for="(option, index) in options"
            :key="option.value"
            class="custom-select-option"
            :class="{
              'is-selected': option.value === modelValue,
              'is-highlighted': index === highlightedIndex,
            }"
            role="option"
            :aria-selected="option.value === modelValue"
            @click.stop="selectOption(option)"
            @mouseenter="highlightedIndex = index"
          >
            <div class="option-main-group">
              <span class="option-text-label">{{ option.label }}</span>
              <span v-if="option.description" class="option-text-desc">
                - {{ option.description }}
              </span>
              <span v-if="option.badge" class="option-badge-tag">
                {{ option.badge }}
              </span>
            </div>

            <!-- 选中对勾标记 -->
            <svg
              v-if="option.value === modelValue"
              class="check-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.custom-select-wrapper {
  position: relative;
  width: 100%;
  user-select: none;
  outline: none;

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
}

.custom-select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.82rem;
  font-family: inherit;
  cursor: pointer;
  transition: all var(--transition-fast);
  min-height: 31px;

  &:hover {
    border-color: rgba(99, 102, 241, 0.4);
    background: rgba(17, 23, 35, 0.95);
  }

  .is-open &,
  .custom-select-wrapper:focus & {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--border-glow);
    background: rgba(17, 23, 35, 1);
  }
}

.trigger-content {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;

  .option-label {
    font-weight: 500;
    color: var(--text-primary);
  }

  .option-desc {
    font-size: 0.76rem;
    color: var(--text-secondary);
    font-weight: 400;
  }

  .option-badge {
    display: inline-flex;
    align-items: center;
    padding: 0 6px;
    height: 16px;
    font-size: 0.66rem;
    font-weight: 500;
    border-radius: 4px;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.25);
    margin-left: 2px;
  }

  .placeholder-text {
    color: #475569;
  }
}

.chevron-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform var(--transition-fast), color var(--transition-fast);

  .is-open & {
    transform: rotate(180deg);
    color: var(--accent-primary);
  }
}

/* 浮动下拉菜单面板 */
.custom-select-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  background: #0f1624;
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: var(--radius-sm);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(99, 102, 241, 0.15);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1050;
  overflow: hidden;

  &.is-bottom {
    top: calc(100% + 4px);
  }

  &.is-top {
    bottom: calc(100% + 4px);
  }
}

.custom-select-options-list {
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.16);
    border-radius: 4px;
  }
}

.custom-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 9px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);

  &.is-highlighted {
    background: rgba(99, 102, 241, 0.12);
    color: var(--text-primary);
  }

  &.is-selected {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    font-weight: 500;

    .option-text-label {
      color: #fff;
    }
  }

  .option-main-group {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .option-text-label {
    font-weight: 500;
    color: var(--text-primary);
  }

  .option-text-desc {
    font-size: 0.74rem;
    color: var(--text-muted);
  }

  .option-badge-tag {
    display: inline-flex;
    align-items: center;
    padding: 0 5px;
    height: 15px;
    font-size: 0.65rem;
    font-weight: 500;
    border-radius: 3px;
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.2);
  }

  .check-icon {
    color: #818cf8;
    flex-shrink: 0;
  }
}

/* 动效 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
