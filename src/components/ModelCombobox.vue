<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import { fetchRemoteModels } from "../services/api";

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
}>();

const comboboxRef = ref<HTMLDivElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

const isOpen = ref(false);
const placement = ref<"bottom" | "top">("bottom");
const searchQuery = ref("");
const availableModels = ref<string[]>([]);
const isFetchedFromApi = ref(false);
const isFetching = ref(false);
const statusBarText = ref("未获取模型，可点击右侧 ↻ 按钮自动拉取");
const statusColor = ref<string>("");

const draggedModel = ref<string | null>(null);
const dragOverModel = ref<string | null>(null);
let isDragHappening = false;

// 记录是否已完成过首次自动选择
const hasAutoSelected = ref(false);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function getModelStorageKey(url: string): string {
  const clean = (url || "").trim().toLowerCase().replace(/\/+$/, "");
  return clean ? `modeltrace_models_${encodeURIComponent(clean)}` : "modeltrace_models_default";
}

function saveModelsToStorage(models: string[]): void {
  try {
    const key = getModelStorageKey(props.baseUrl);
    localStorage.setItem(key, JSON.stringify(models));
  } catch (err) {
    console.warn("保存模型列表失败:", err);
  }
}

function loadSavedModels(url: string): string[] | null {
  try {
    const key = getModelStorageKey(url);
    const data = localStorage.getItem(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    return null;
  }
  return null;
}

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
  searchQuery.value = "";
  if (!isFetchedFromApi.value) {
    const saved = loadSavedModels(props.baseUrl);
    if (saved && saved.length > 0) {
      availableModels.value = saved;
      isFetchedFromApi.value = true;
      statusBarText.value = `已加载本地保存的 ${saved.length} 个模型（拖动可交换排序）`;
      statusColor.value = "";
    } else {
      statusBarText.value = "未获取模型，可点击右侧 ↻ 按钮自动拉取";
      statusColor.value = "";
    }
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
    if (!isFetchedFromApi.value && isValidBaseUrl(props.baseUrl) && isValidApiKey(props.apiKey)) {
      void fetchModels({ autoSelectFirst: false });
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
      // 保留用户已排好的顺序，过滤远端已移除的，新模型追加到末尾
      const saved = loadSavedModels(url);
      let mergedList: string[];
      if (saved && saved.length > 0) {
        const remoteSet = new Set(list);
        const savedSet = new Set(saved);
        const retained = saved.filter((m) => remoteSet.has(m));
        const newlyAdded = list.filter((m) => !savedSet.has(m));
        mergedList = [...retained, ...newlyAdded];
      } else {
        mergedList = list;
      }

      availableModels.value = mergedList;
      saveModelsToStorage(mergedList);
      isFetchedFromApi.value = true;
      statusBarText.value = `已成功获取 ${mergedList.length} 个模型（拖动可交换排序）`;
      statusColor.value = "var(--success)";

      if (options.autoSelectFirst) {
        hasAutoSelected.value = true;
        const firstModel = mergedList[0];
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
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const url = props.baseUrl;
  const key = props.apiKey;

  if (isValidBaseUrl(url) && isValidApiKey(key)) {
    const shouldSelectFirst = props.autoSelectFirst && !hasAutoSelected.value && !props.modelValue.trim();
    if (immediate) {
      void fetchModels({ autoSelectFirst: shouldSelectFirst });
    } else {
      debounceTimer = setTimeout(() => {
        if (isValidBaseUrl(props.baseUrl) && isValidApiKey(props.apiKey)) {
          const selectFirst = props.autoSelectFirst && !hasAutoSelected.value && !props.modelValue.trim();
          void fetchModels({ autoSelectFirst: selectFirst });
        }
      }, 800);
    }
  }
}

function onDragStart(event: DragEvent, model: string): void {
  draggedModel.value = model;
  isDragHappening = true;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", model);
  }
}

function onDragOver(event: DragEvent, model: string): void {
  if (!draggedModel.value || draggedModel.value === model) return;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  dragOverModel.value = model;
}

function onDragEnter(model: string): void {
  if (!draggedModel.value || draggedModel.value === model) return;
  dragOverModel.value = model;
}

function onDragLeave(model: string): void {
  if (dragOverModel.value === model) {
    dragOverModel.value = null;
  }
}

function onDrop(targetModel: string): void {
  const sourceModel = draggedModel.value;
  if (!sourceModel || sourceModel === targetModel) {
    cleanupDrag();
    return;
  }

  const sourceIdx = availableModels.value.indexOf(sourceModel);
  const targetIdx = availableModels.value.indexOf(targetModel);

  if (sourceIdx !== -1 && targetIdx !== -1) {
    const nextList = [...availableModels.value];
    const temp = nextList[sourceIdx];
    nextList[sourceIdx] = nextList[targetIdx];
    nextList[targetIdx] = temp;
    availableModels.value = nextList;
    saveModelsToStorage(nextList);

    statusBarText.value = `已交换「${sourceModel}」与「${targetModel}」顺序并保存`;
    statusColor.value = "var(--success)";
  }

  cleanupDrag();
}

function cleanupDrag(): void {
  draggedModel.value = null;
  dragOverModel.value = null;
  setTimeout(() => {
    isDragHappening = false;
  }, 120);
}

function onDragEnd(): void {
  cleanupDrag();
}

watch(
  [() => props.baseUrl, () => props.apiKey],
  ([newUrl, newKey], [oldUrl, oldKey]) => {
    if (newUrl !== oldUrl || newKey !== oldKey) {
      hasAutoSelected.value = false;
      const saved = loadSavedModels(newUrl || "");
      if (saved && saved.length > 0) {
        availableModels.value = saved;
        isFetchedFromApi.value = true;
        statusBarText.value = `已加载本地保存的 ${saved.length} 个模型（拖动可交换排序）`;
        statusColor.value = "";
      } else {
        isFetchedFromApi.value = false;
        availableModels.value = [];
        statusBarText.value = "未获取模型，可点击右侧 ↻ 按钮自动拉取";
        statusColor.value = "";
      }
    }
    checkAndTriggerAutoFetch(false);
  }
);

function selectItem(model: string): void {
  if (isDragHappening) return;
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
  const saved = loadSavedModels(props.baseUrl);
  if (saved && saved.length > 0) {
    availableModels.value = saved;
    isFetchedFromApi.value = true;
    statusBarText.value = `已加载本地保存的 ${saved.length} 个模型（拖动可交换排序）`;
    statusColor.value = "";
  }
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
    const saved = loadSavedModels(props.baseUrl);
    if (saved && saved.length > 0) {
      availableModels.value = saved;
      isFetchedFromApi.value = true;
      statusBarText.value = `已加载本地保存的 ${saved.length} 个模型（拖动可交换排序）`;
      statusColor.value = "";
    } else {
      availableModels.value = [];
      isFetchedFromApi.value = false;
      statusBarText.value = "未获取模型，可点击右侧 ↻ 按钮自动拉取";
      statusColor.value = "";
    }
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
        class="btn-icon"
        :id="id ? `${id}-btn-fetch` : 'btn-fetch-models'"
        title="点击调用 /v1/models 接口自动获取当前 Key 允许的模型列表"
        @click.stop="() => { if (!isOpen) openDropdown(); void fetchModels({ autoSelectFirst: false }); }"
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
        :id="id ? `${id}-btn-toggle` : 'btn-toggle-dropdown'"
        title="展开/收起模型选择列表"
        @click.stop="toggleDropdown"
      >
        <svg class="dropdown-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    </div>

    <!-- 下拉菜单 -->
    <div
      class="model-dropdown-menu"
      :class="{ hidden: !isOpen, 'is-top': placement === 'top', 'is-bottom': placement === 'bottom' }"
      :id="id ? `${id}-dropdown` : 'model-dropdown'"
    >
      <div class="dropdown-search-wrap">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          :id="id ? `${id}-dropdown-search` : 'dropdown-search'"
          placeholder="搜索模型过滤..."
          autocomplete="off"
          spellcheck="false"
          title="输入关键词实时过滤模型"
          @click.stop
        />
      </div>
      <div class="dropdown-status-bar" :id="id ? `${id}-dropdown-status-bar` : 'dropdown-status-bar'">
        <span :style="{ color: statusColor }">{{ statusBarText }}</span>
      </div>
      <ul class="dropdown-list" :id="id ? `${id}-dropdown-list` : 'dropdown-list'">
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
            :class="{
              selected: m === modelValue,
              'is-dragging': draggedModel === m,
              'is-drag-over': dragOverModel === m && draggedModel !== m
            }"
            draggable="true"
            @dragstart="onDragStart($event, m)"
            @dragover.prevent="onDragOver($event, m)"
            @dragenter.prevent="onDragEnter(m)"
            @dragleave="onDragLeave(m)"
            @drop.prevent="onDrop(m)"
            @dragend="onDragEnd"
            @click="selectItem(m)"
          >
            <div class="item-left-group">
              <span class="drag-grip" title="按住拖拽交换模型位置">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <circle cx="8" cy="6" r="1.5" />
                  <circle cx="16" cy="6" r="1.5" />
                  <circle cx="8" cy="12" r="1.5" />
                  <circle cx="16" cy="12" r="1.5" />
                  <circle cx="8" cy="18" r="1.5" />
                  <circle cx="16" cy="18" r="1.5" />
                </svg>
              </span>
              <span class="model-name-text">{{ m }}</span>
            </div>
            <span v-if="m === modelValue" class="selected-check">✓</span>
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
  width: 100%;

  &.combobox-open {
    z-index: 100;

    .dropdown-chevron {
      transform: rotate(180deg);
    }
  }

  input {
    width: 100%;
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

    &.is-bottom {
      top: calc(100% + 4px);
      bottom: auto;
    }

    &.is-top {
      bottom: calc(100% + 4px);
      top: auto;
    }

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
        transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast), transform var(--transition-fast);
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        margin: 1px 4px;
        user-select: none;

        .item-left-group {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 1;

          .drag-grip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            cursor: grab;
            opacity: 0.35;
            transition: opacity var(--transition-fast), color var(--transition-fast);
            flex-shrink: 0;

            &:hover {
              opacity: 1;
              color: var(--accent-primary);
            }
          }

          .model-name-text {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }

        .selected-check {
          font-size: 0.75rem;
          color: var(--accent-primary);
          flex-shrink: 0;
          margin-left: 6px;
        }

        &:hover,
        &.active {
          background: rgba(99, 102, 241, 0.15);
          color: #fff;

          .drag-grip {
            opacity: 0.85;
          }
        }

        &:active .drag-grip {
          cursor: grabbing;
        }

        &.selected {
          color: var(--accent-primary);
          font-weight: 600;
        }

        &.is-dragging {
          opacity: 0.35;
          background: rgba(99, 102, 241, 0.15);
          border: 1px dashed rgba(99, 102, 241, 0.6);
        }

        &.is-drag-over {
          background: rgba(99, 102, 241, 0.28);
          border: 1px solid var(--accent-primary);
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.35);
          transform: translateY(-1px);
          color: #fff;
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
