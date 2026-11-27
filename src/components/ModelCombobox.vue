<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { RotateCw, ChevronDown } from "@lucide/vue";
import ModelDropdownMenu from "./model-combobox/ModelDropdownMenu.vue";
import { useModelFetch, filterModelsByQuery } from "./model-combobox/useModelFetch";
import { isValidBaseUrl, isValidApiKey } from "./model-combobox/modelStorage";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    baseUrl: string;
    apiKey: string;
    apiFormat?: string;
    id?: string;
    placeholder?: string;
    title?: string;
    required?: boolean;
    autoSelectFirst?: boolean;
    isCustomModel?: boolean;
    disabled?: boolean;
  }>(),
  {
    apiFormat: "chat_completions",
    id: "model-name",
    placeholder: "请输入或选择测试模型 ID",
    title: "测试模型 ID。可点击右侧下拉按钮或刷新按钮自动获取当前 Key 允许的模型列表",
    required: false,
    autoSelectFirst: true,
    isCustomModel: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:apiFormat", value: string): void;
  (e: "update:reasoningEffort", value: string): void;
  (e: "update:isCustomModel", value: boolean): void;
}>();

const comboboxRef = ref<HTMLDivElement | null>(null);
const isOpen = ref(false);
const isFiltering = ref(false);
const filterQuery = ref("");
const placement = ref<"bottom" | "top">("bottom");

const {
  availableModels,
  isFetchedFromApi,
  isFetching,
  fetchModels,
  checkAndTriggerAutoFetch,
  selectModel,
  resetModelList,
} = useModelFetch({
  getProps: () => props,
  emit,
});

const displayedModels = computed(() => {
  return isFiltering.value
    ? filterModelsByQuery(availableModels.value, filterQuery.value)
    : availableModels.value;
});

// 输入筛选无匹配项时不显示下拉列表；手动点击下拉或刷新按钮时仍显示完整列表或空态提示
const isDropdownVisible = computed(() => {
  return isOpen.value && (!isFiltering.value || displayedModels.value.length > 0);
});

function calculatePlacement(): void {
  if (!comboboxRef.value) return;
  const rect = comboboxRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  if (spaceBelow < 230 && spaceAbove > spaceBelow) {
    placement.value = "top";
  } else {
    placement.value = "bottom";
  }
}

function openDropdown(): void {
  if (props.disabled) return;
  calculatePlacement();
  isOpen.value = true;
}

function closeDropdown(): void {
  isOpen.value = false;
  isFiltering.value = false;
  filterQuery.value = "";
}

function toggleDropdown(): void {
  if (props.disabled) return;
  if (isDropdownVisible.value) {
    closeDropdown();
  } else {
    isFiltering.value = false;
    filterQuery.value = "";
    openDropdown();
    if (!isFetchedFromApi.value && isValidBaseUrl(props.baseUrl) && isValidApiKey(props.apiKey)) {
      void fetchModels({ autoSelectFirst: false });
    }
  }
}

function handleManualFetch(): void {
  if (props.disabled) return;
  isFiltering.value = false;
  filterQuery.value = "";
  if (!isOpen.value) {
    openDropdown();
  }
  void fetchModels({ autoSelectFirst: false });
}

function handleSelect(model: string): void {
  selectModel(model);
  closeDropdown();
}

function handleInput(e: Event): void {
  const target = e.target as HTMLInputElement;
  const value = target.value;
  filterQuery.value = value;
  isFiltering.value = true;
  emit("update:modelValue", value);
  emit("update:isCustomModel", true);

  if (filterModelsByQuery(availableModels.value, value).length > 0) {
    openDropdown();
  } else {
    isOpen.value = false;
  }
}

function handleInputKeydown(e: KeyboardEvent): void {
  if (!isDropdownVisible.value) return;
  if (e.key === "Escape") {
    e.stopPropagation();
    closeDropdown();
  } else if (e.key === "Tab") {
    closeDropdown();
  }
}

function handleDocumentClick(e: MouseEvent): void {
  if (comboboxRef.value && !comboboxRef.value.contains(e.target as Node)) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener("click", handleDocumentClick);
});

defineExpose({
  resetModelList: () => {
    resetModelList();
    closeDropdown();
  },
  triggerAutoFetch: (immediate = true) => {
    checkAndTriggerAutoFetch(immediate);
  },
});
</script>

<template>
  <div
    ref="comboboxRef"
    class="model-combobox-wrapper"
    :class="{ 'combobox-open': isDropdownVisible, 'is-disabled': disabled }"
  >
    <input
      type="text"
      :id="id"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      autocomplete="off"
      spellcheck="false"
      :placeholder="placeholder"
      :title="title"
      @input="handleInput"
      @keydown="handleInputKeydown"
    />
    <div class="combobox-actions">
      <button
        type="button"
        class="btn-icon btn-action-fetch"
        :id="id ? `${id}-btn-fetch` : 'btn-fetch-models'"
        title="获取当前 key 允许的模型列表"
        :disabled="disabled || isFetching"
        @click.stop="handleManualFetch"
      >
        <RotateCw
          class="refresh-icon"
          :class="{ spinning: isFetching }"
          :size="14"
        />
      </button>
      <button
        type="button"
        class="btn-icon btn-action-toggle"
        :id="id ? `${id}-btn-toggle` : 'btn-toggle-dropdown'"
        title="展开/收起模型选择列表"
        :disabled="disabled"
        @click.stop="toggleDropdown"
      >
        <ChevronDown
          class="dropdown-chevron"
          :size="14"
        />
      </button>
    </div>

    <!-- 下拉菜单 -->
    <ModelDropdownMenu
      :is-open="isDropdownVisible"
      :placement="placement"
      :id="id"
      :model-value="modelValue"
      :models="displayedModels"
      :is-fetched-from-api="isFetchedFromApi"
      :is-fetching="isFetching"
      @select="handleSelect"
    />
  </div>
</template>

<style lang="scss" scoped>
.model-combobox-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;

  &.combobox-open {
    z-index: 100;

    .dropdown-chevron {
      transform: rotate(180deg);
    }
  }

  &.is-disabled {
    cursor: not-allowed;
  }

  input {
    width: 100%;
    padding-right: 56px;
  }

  .combobox-actions {
    position: absolute;
    right: 11px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 4px;

    .btn-icon {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color var(--transition-fast), background-color var(--transition-fast);

      svg {
        display: block;
        flex-shrink: 0;
      }

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
        pointer-events: none;
      }

      &.btn-action-fetch {
        width: 18px;
        height: 18px;
        padding: 0;
        border-radius: var(--radius-sm);

        &:hover:not(:disabled) {
          color: var(--text-primary);
          background: var(--overlay-medium);
        }
      }

      &.btn-action-toggle {
        width: 14px;
        height: 14px;
        padding: 0;

        &:hover:not(:disabled) {
          color: var(--text-primary);
        }
      }
    }
  }

  .refresh-icon.spinning {
    animation: spin 0.8s linear infinite;
    color: var(--accent-primary);
  }

  .dropdown-chevron {
    transition: transform var(--transition-fast);
  }
}
</style>
