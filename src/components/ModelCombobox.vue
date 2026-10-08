<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue";
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

// 记录是否已完成过首次自动选择
const hasAutoSelected = ref(false);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function isValidBaseUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return false;
    if (parsed.hostname.endsWith(".")) return false;
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname);
    const hasDot = parsed.hostname.includes(".");
    if (!isLocalhost && !isIp && !hasDot) return false;
    if (!isLocalhost && !isIp) {
      const parts = parsed.hostname.split(".");
      const tld = parts[parts.length - 1];
      if (tld.length < 2) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isValidApiKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  // 长度至少 8 位，且不包含空白字符与中文字符
  if (trimmed.length < 8) return false;
  if (/[\u4e00-\u9fa5\s]/.test(trimmed)) return false;
  return true;
}

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

async function fetchModels(options: { autoSelectFirst?: boolean } = {}): Promise<void> {
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

      if (options.autoSelectFirst) {
        hasAutoSelected.value = true;
        const firstModel = list[0];
        emit("update:modelValue", firstModel);
        if (firstModel.toLowerCase().includes("claude")) {
          emit("update:apiFormat", "anthropic");
        }
      }
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

function checkAndTriggerAutoFetch(immediate = false): void {
  // 若已完成首次自动选择，或当前输入框已有模型值，则不再自动覆盖
  if (hasAutoSelected.value || props.modelValue.trim()) {
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const url = props.baseUrl;
  const key = props.apiKey;

  if (isValidBaseUrl(url) && isValidApiKey(key)) {
    if (immediate) {
      void fetchModels({ autoSelectFirst: true });
    } else {
      debounceTimer = setTimeout(() => {
        if (!hasAutoSelected.value && !props.modelValue.trim() && isValidBaseUrl(props.baseUrl) && isValidApiKey(props.apiKey)) {
          void fetchModels({ autoSelectFirst: true });
        }
      }, 800);
    }
  }
}

watch(
  [() => props.baseUrl, () => props.apiKey],
  () => {
    checkAndTriggerAutoFetch(false);
  }
);

function selectItem(model: string): void {
  emit("update:modelValue", model);
  if (model.toLowerCase().includes("claude")) {
    emit("update:apiFormat", "anthropic");
  } else if (props.apiFormat !== "responses") {
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
  setTimeout(() => {
    checkAndTriggerAutoFetch(false);
  }, 100);
});

onUnmounted(() => {
  document.removeEventListener("click", handleDocumentClick);
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
});

defineExpose({
  resetModelList: () => {
    availableModels.value = [];
    isFetchedFromApi.value = false;
    isFetching.value = false;
    searchQuery.value = "";
    hasAutoSelected.value = false;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
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
      id="model-name"
      :value="modelValue"
      required
      autocomplete="off"
      spellcheck="false"
      placeholder="请输入或选择测试模型 ID"
      title="测试模型 ID。可点击右侧下拉按钮或刷新按钮自动获取当前 Key 允许的模型列表"
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
            上游未返回可用模型，可直接在上方手动输入测试模型 ID
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

<style lang="scss" scoped>
.model-combobox-wrapper {
  position: relative;
  display: flex;
  align-items: center;

  &.combobox-open {
    z-index: 100;

    .dropdown-chevron {
      transform: rotate(180deg);
    }
  }

  input {
    padding-right: 62px;
  }

  .combobox-actions {
    position: absolute;
    right: 5px;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .refresh-icon.spinning {
    animation: spin 0.8s linear infinite;
    color: var(--accent-primary);
  }

  .dropdown-chevron {
    transition: transform var(--transition-fast);
  }

  .model-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 1000;
    background: #131924;
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: var(--radius-md);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(99, 102, 241, 0.2);
    max-height: 280px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: fadeIn 0.15s ease-out;

    .dropdown-search-wrap {
      padding: 6px 8px;
      border-bottom: 1px solid var(--border-subtle);
      background: #0f141d;

      input {
        padding: 5px 8px;
        font-size: 0.78rem;
      }
    }

    .dropdown-status-bar {
      padding: 4px 10px;
      font-size: 0.7rem;
      color: var(--text-muted);
      background: rgba(18, 24, 36, 0.4);
      border-bottom: 1px solid rgba(35, 45, 63, 0.4);
    }

    .dropdown-list {
      list-style: none;
      overflow-y: auto;
      max-height: 190px;
      padding: 3px 0;
      scrollbar-width: thin;
      scrollbar-color: rgba(99, 102, 241, 0.28) transparent;

      &::-webkit-scrollbar {
        width: 4px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background: rgba(99, 102, 241, 0.28);
        border-radius: 10px;

        &:hover {
          background: rgba(99, 102, 241, 0.55);
        }
      }

      .dropdown-item {
        padding: 6px 10px;
        font-size: 0.8rem;
        color: var(--text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: background var(--transition-fast), color var(--transition-fast);

        &:hover,
        &.active {
          background: rgba(99, 102, 241, 0.15);
          color: #fff;
        }

        &.selected {
          color: var(--accent-primary);
          font-weight: 600;
        }
      }

      .dropdown-empty {
        padding: 12px;
        text-align: center;
        font-size: 0.76rem;
        color: var(--text-muted);
      }
    }
  }
}
</style>
