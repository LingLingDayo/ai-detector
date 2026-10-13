<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import ModelDropdownMenu from "./model-combobox/ModelDropdownMenu.vue";
import { useModelFetch } from "./model-combobox/useModelFetch";
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
  }>(),
  {
    apiFormat: "chat_completions",
    id: "model-name",
    placeholder: "请输入或选择测试模型 ID",
    title: "测试模型 ID。可点击右侧下拉按钮或刷新按钮自动获取当前 Key 允许的模型列表",
    required: false,
    autoSelectFirst: true,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:apiFormat", value: string): void;
  (e: "update:reasoningEffort", value: string): void;
}>();

const comboboxRef = ref<HTMLDivElement | null>(null);
const isOpen = ref(false);
const placement = ref<"bottom" | "top">("bottom");

const {
  availableModels,
  isFetchedFromApi,
  isFetching,
  statusBarText,
  statusColor,
  fetchModels,
  checkAndTriggerAutoFetch,
  selectModel,
  resetModelList,
} = useModelFetch({
  getProps: () => props,
  emit,
});

function calculatePlacement(): void {
  if (!comboboxRef.value) return;
  const rect = comboboxRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  if (spaceBelow < 280 && spaceAbove > spaceBelow) {
    placement.value = "top";
  } else {
    placement.value = "bottom";
  }
}

function openDropdown(): void {
  calculatePlacement();
  isOpen.value = true;
}

function closeDropdown(): void {
  isOpen.value = false;
}

function toggleDropdown(): void {
  if (isOpen.value) {
    closeDropdown();
  } else {
    openDropdown();
    if (!isFetchedFromApi.value && isValidBaseUrl(props.baseUrl) && isValidApiKey(props.apiKey)) {
      void fetchModels({ autoSelectFirst: false });
    }
  }
}

function handleSelect(model: string): void {
  selectModel(model);
  closeDropdown();
}

function handleInput(e: Event): void {
  const target = e.target as HTMLInputElement;
  emit("update:modelValue", target.value);
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
    :class="{ 'combobox-open': isOpen }"
  >
    <input
      type="text"
      :id="id"
      :value="modelValue"
      :required="required"
      autocomplete="off"
      spellcheck="false"
      :placeholder="placeholder"
      :title="title"
      @input="handleInput"
    />
    <div class="combobox-actions">
      <button
        type="button"
        class="btn-icon btn-action-fetch"
        :id="id ? `${id}-btn-fetch` : 'btn-fetch-models'"
        title="点击调用 /v1/models 接口自动获取当前 Key 允许的模型列表"
        @click.stop="() => { if (!isOpen) openDropdown(); void fetchModels({ autoSelectFirst: false }); }"
      >
        <svg
          class="refresh-icon"
          :class="{ spinning: isFetching }"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
      </button>
      <button
        type="button"
        class="btn-icon btn-action-toggle"
        :id="id ? `${id}-btn-toggle` : 'btn-toggle-dropdown'"
        title="展开/收起模型选择列表"
        @click.stop="toggleDropdown"
      >
        <svg
          class="dropdown-chevron"
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
      </button>
    </div>

    <!-- 下拉菜单 -->
    <ModelDropdownMenu
      :is-open="isOpen"
      :placement="placement"
      :id="id"
      :model-value="modelValue"
      :available-models="availableModels"
      :is-fetched-from-api="isFetchedFromApi"
      :status-bar-text="statusBarText"
      :status-color="statusColor"
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

      &.btn-action-fetch {
        width: 18px;
        height: 18px;
        padding: 0;
        border-radius: var(--radius-sm);

        &:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.08);
        }
      }

      &.btn-action-toggle {
        width: 14px;
        height: 14px;
        padding: 0;

        &:hover {
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
