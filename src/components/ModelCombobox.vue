<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { fetchRemoteModels } from "../services/api";

const props = defineProps<{
  modelValue: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:apiFormat", value: string): void;
}>();

const comboboxRef = ref<HTMLDivElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

const isOpen = ref(false);
const searchQuery = ref("");
const availableModels = ref<string[]>([]);
const isFetchedFromApi = ref(false);
const isFetching = ref(false);
const statusBarText = ref("未获取模型，可点击右侧 ↻ 按钮自动拉取");
const statusColor = ref<string>("");

const filteredModels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return availableModels.value;
  return availableModels.value.filter((m) => m.toLowerCase().includes(q));
});

function openDropdown(): void {
  isOpen.value = true;
  searchQuery.value = "";
  if (!isFetchedFromApi.value) {
    statusBarText.value = "未获取模型，可点击右侧 ↻ 按钮自动拉取";
    statusColor.value = "";
  }
  nextTick(() => {
    searchInputRef.value?.focus();
  });
}

function closeDropdown(): void {
  isOpen.value = false;
}

function toggleDropdown(): void {
  if (isOpen.value) {
    closeDropdown();
  } else {
    openDropdown();
    if (!isFetchedFromApi.value && props.baseUrl.trim() && props.apiKey.trim()) {
      void fetchModels();
    }
  }
}

async function fetchModels(): Promise<void> {
  const url = props.baseUrl.trim();
  const key = props.apiKey.trim();

  if (!url || !key) {
    statusBarText.value = "请先填写 Base URL 和 API Key 以获取模型";
    statusColor.value = "var(--warning)";
    return;
  }

  if (isFetching.value) return;
  isFetching.value = true;
  statusBarText.value = "正在从 /v1/models 拉取可用模型列表...";
  statusColor.value = "";

  try {
    const list = await fetchRemoteModels(url, key, props.apiFormat);
    if (list && list.length > 0) {
      availableModels.value = list;
      isFetchedFromApi.value = true;
      statusBarText.value = `已成功获取 ${list.length} 个模型`;
      statusColor.value = "var(--success)";
    } else {
      statusBarText.value = "上游未返回可用模型列表，仍可手动输入";
      statusColor.value = "";
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("获取模型列表异常:", err);
    statusBarText.value = `获取失败(${errMsg || "请求受限"})，可手动输入`;
    statusColor.value = "var(--danger)";
  } finally {
    isFetching.value = false;
  }
}

function selectItem(model: string): void {
  emit("update:modelValue", model);
  if (model.toLowerCase().includes("claude")) {
    emit("update:apiFormat", "anthropic");
  } else {
    emit("update:apiFormat", "chat_completions");
  }
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
    availableModels.value = [];
    isFetchedFromApi.value = false;
    isFetching.value = false;
    searchQuery.value = "";
    closeDropdown();
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
      id="model-name"
      :value="modelValue"
      required
      autocomplete="off"
      spellcheck="false"
      placeholder="请输入或选择待测模型 ID (例如 gpt-4o)"
      title="待测模型 ID。可点击右侧下拉按钮或刷新按钮自动获取当前 Key 允许的模型列表"
      @input="handleInput"
    />
    <div class="combobox-actions">
      <button
        type="button"
        class="btn-icon"
        id="btn-fetch-models"
        title="点击调用 /v1/models 接口自动获取当前 Key 允许的模型列表"
        @click.stop="() => { if (!isOpen) openDropdown(); void fetchModels(); }"
      >
        <svg
          class="refresh-icon"
          :class="{ spinning: isFetching }"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
      </button>
      <button
        type="button"
        class="btn-icon"
        id="btn-toggle-dropdown"
        title="展开/收起模型选择列表"
        @click.stop="toggleDropdown"
      >
        <svg class="dropdown-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    </div>

    <!-- 下拉菜单 -->
    <div class="model-dropdown-menu" :class="{ hidden: !isOpen }" id="model-dropdown">
      <div class="dropdown-search-wrap">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          id="dropdown-search"
          placeholder="搜索模型过滤..."
          autocomplete="off"
          spellcheck="false"
          title="输入关键词实时过滤模型"
          @click.stop
        />
      </div>
      <div class="dropdown-status-bar" id="dropdown-status-bar">
        <span :style="{ color: statusColor }">{{ statusBarText }}</span>
      </div>
      <ul class="dropdown-list" id="dropdown-list">
        <template v-if="availableModels.length === 0">
          <li v-if="isFetchedFromApi" class="dropdown-empty">
            上游未返回可用模型，可直接在上方手动输入待测模型 ID
          </li>
          <li v-else class="dropdown-empty">
            <div style="font-weight: 500; margin-bottom: 4px; color: var(--text-secondary)">尚未拉取模型列表</div>
            <div style="font-size: 0.74rem; color: var(--text-muted); line-height: 1.4;">
              请先配置 Base URL 与 API Key 后点击右侧 ↻ 按钮在线拉取，亦可直接手动输入。
            </div>
          </li>
        </template>
        <template v-else-if="filteredModels.length === 0">
          <li class="dropdown-empty">
            未匹配到“{{ searchQuery }}”，支持直接在上方输入
          </li>
        </template>
        <template v-else>
          <li
            v-for="m in filteredModels"
            :key="m"
            class="dropdown-item"
            :class="{ selected: m === modelValue }"
            @click="selectItem(m)"
          >
            <span>{{ m }}</span>
            <span v-if="m === modelValue" style="font-size: 0.75rem">✓</span>
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>
