<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    placement: "bottom" | "top";
    id?: string;
    modelValue: string;
    availableModels: string[];
    isFetchedFromApi: boolean;
    statusBarText: string;
    statusColor?: string;
  }>(),
  {
    statusColor: "",
  }
);

const emit = defineEmits<{
  (e: "select", model: string): void;
  (e: "swap", sourceModel: string, targetModel: string): void;
}>();

const searchInputRef = ref<HTMLInputElement | null>(null);
const searchQuery = ref("");

const draggedModel = ref<string | null>(null);
const dragOverModel = ref<string | null>(null);
let isDragHappening = false;

const filteredModels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.availableModels;
  return props.availableModels.filter((m) => m.toLowerCase().includes(q));
});

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchQuery.value = "";
      nextTick(() => {
        searchInputRef.value?.focus();
      });
    }
  }
);

function handleSelect(model: string): void {
  if (isDragHappening) return;
  emit("select", model);
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

function cleanupDrag(): void {
  draggedModel.value = null;
  dragOverModel.value = null;
  setTimeout(() => {
    isDragHappening = false;
  }, 120);
}

function onDrop(targetModel: string): void {
  const sourceModel = draggedModel.value;
  if (!sourceModel || sourceModel === targetModel) {
    cleanupDrag();
    return;
  }

  emit("swap", sourceModel, targetModel);
  cleanupDrag();
}

function onDragEnd(): void {
  cleanupDrag();
}

defineExpose({
  focusSearch: () => {
    searchInputRef.value?.focus();
  },
});
</script>

<template>
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
          @click="handleSelect(m)"
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
</template>

<style lang="scss" scoped>
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
</style>
