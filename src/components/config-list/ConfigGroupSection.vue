<script setup lang="ts">
import { ref, nextTick, computed } from "vue";
import type { ConfigGroup } from "../../types";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  Check,
  X,
} from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    group: ConfigGroup;
    itemCount: number;
    totalCount: number;
    collapsed: boolean;
    hasActiveConfig?: boolean;
    isDropTarget?: boolean;
    isFiltering?: boolean;
    isDraggingConfig?: boolean;
    isDragging?: boolean;
    isDraggingGroup?: boolean;
    dragOverPosition?: "before" | "after" | null;
  }>(),
  {
    hasActiveConfig: false,
    isDropTarget: false,
    isFiltering: false,
    isDraggingConfig: false,
    isDragging: false,
    isDraggingGroup: false,
    dragOverPosition: null,
  }
);

const emit = defineEmits<{
  (e: "toggle"): void;
  (e: "rename", groupId: string, newName: string): void;
  (e: "delete", groupId: string): void;
  (e: "dragstartGroup", event: DragEvent, groupId: string): void;
  (e: "dragendGroup"): void;
  (e: "dragoverGroup", event: DragEvent, groupId: string, position: "before" | "after"): void;
  (e: "dragenterGroup", event: DragEvent, groupId: string, position: "before" | "after"): void;
  (e: "dragleaveGroup", event: DragEvent, groupId: string): void;
  (e: "dropGroup", event: DragEvent, groupId: string, position: "before" | "after"): void;
}>();

let isDragHappening = false;

const isRenaming = ref(false);
const renameInputValue = ref("");
const renameInputRef = ref<HTMLInputElement | null>(null);

const countBadgeText = computed(() => {
  if (props.isFiltering && props.itemCount !== props.totalCount) {
    return `${props.itemCount}/${props.totalCount}`;
  }
  return `${props.totalCount}`;
});

function startRename(): void {
  renameInputValue.value = props.group.name;
  isRenaming.value = true;
  nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
}

function confirmRename(): void {
  const trimmed = renameInputValue.value.trim();
  if (!trimmed) {
    renameInputRef.value?.focus();
    return;
  }
  if (trimmed !== props.group.name) {
    emit("rename", props.group.id, trimmed);
  }
  isRenaming.value = false;
}

function cancelRename(): void {
  isRenaming.value = false;
  renameInputValue.value = "";
}

function handleRenameBlur(): void {
  if (!isRenaming.value) return;
  const trimmed = renameInputValue.value.trim();
  if (!trimmed) {
    cancelRename();
    return;
  }
  confirmRename();
}

function handleHeaderClick(): void {
  if (isRenaming.value || isDragHappening || props.isDragging) return;
  emit("toggle");
}

function calculatePosition(event: DragEvent): "before" | "after" {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return "before";
  const rect = target.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  return offsetY < rect.height / 2 ? "before" : "after";
}

function handleGroupDragStart(event: DragEvent): void {
  if (isRenaming.value) {
    event.preventDefault();
    return;
  }
  isDragHappening = true;
  emit("dragstartGroup", event, props.group.id);
}

function handleGroupDragEnd(): void {
  emit("dragendGroup");
  setTimeout(() => {
    isDragHappening = false;
  }, 100);
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  const position = calculatePosition(event);
  emit("dragoverGroup", event, props.group.id, position);
}

function handleDragEnter(event: DragEvent): void {
  event.preventDefault();
  const position = calculatePosition(event);
  emit("dragenterGroup", event, props.group.id, position);
}

function handleDragLeave(event: DragEvent): void {
  emit("dragleaveGroup", event, props.group.id);
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  const position = calculatePosition(event);
  emit("dropGroup", event, props.group.id, position);
}
</script>

<template>
  <section
    class="config-group-section"
    :data-group-id="group.id"
    :class="{
      'is-collapsed': collapsed,
      'is-active': collapsed && hasActiveConfig,
      'is-drop-target': isDropTarget,
      'is-dragging-hint': isDraggingConfig && !isDropTarget,
      'is-dragging': isDragging,
      'is-dragging-group': isDraggingGroup,
      'is-insert-before': dragOverPosition === 'before',
      'is-insert-after': dragOverPosition === 'after',
    }"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div
      class="group-header"
      :draggable="!isRenaming"
      :title="
        isRenaming
          ? undefined
          : collapsed
            ? '点击展开分组 · 拖动可调整顺序'
            : '点击折叠分组 · 拖动可调整顺序'
      "
      @click="handleHeaderClick"
      @dragstart="handleGroupDragStart"
      @dragend="handleGroupDragEnd"
    >
      <div class="group-header-left">
        <ChevronRight
          class="chevron-icon"
          :class="{ 'is-expanded': !collapsed }"
          :size="15"
        />
        <FolderOpen v-if="!collapsed" class="folder-icon" :size="15" />
        <Folder v-else class="folder-icon" :size="15" />

        <div
          v-if="isRenaming"
          class="rename-input-box"
          draggable="false"
          @click.stop
          @dragstart.stop.prevent
        >
          <input
            ref="renameInputRef"
            v-model="renameInputValue"
            type="text"
            class="rename-input"
            placeholder="输入分组名称..."
            maxlength="40"
            @blur="handleRenameBlur"
            @keydown.enter.prevent="confirmRename"
            @keydown.esc.stop.prevent="cancelRename"
          />
        </div>
        <span v-else class="group-name" :title="group.name">{{ group.name }}</span>

        <span v-if="totalCount > 0" class="group-count-badge">{{ countBadgeText }}</span>
      </div>

      <div class="group-header-right" @click.stop @mousedown.stop>
        <span v-if="isDropTarget" class="drop-into-pill">释放以放入分组</span>

        <template v-else-if="isRenaming">
          <button
            type="button"
            class="btn-group-action btn-confirm"
            title="保存分组名称 (Enter)"
            draggable="false"
            @dragstart.stop.prevent
            @mousedown.prevent
            @click="confirmRename"
          >
            <Check :size="14" />
          </button>
          <button
            type="button"
            class="btn-group-action btn-cancel"
            title="取消重命名 (Esc)"
            draggable="false"
            @dragstart.stop.prevent
            @mousedown.prevent
            @click="cancelRename"
          >
            <X :size="14" />
          </button>
        </template>

        <template v-else>
          <button
            type="button"
            class="btn-group-action btn-rename"
            title="重命名分组"
            draggable="false"
            @dragstart.stop.prevent
            @click="startRename"
          >
            <Pencil :size="14" />
          </button>
          <button
            type="button"
            class="btn-group-action btn-delete"
            title="删除分组（会同时删除组内所有配置）"
            draggable="false"
            @dragstart.stop.prevent
            @click="emit('delete', group.id)"
          >
            <Trash2 :size="14" />
          </button>
        </template>
      </div>
    </div>

    <div v-show="!collapsed" class="group-body">
      <slot />
      <div v-if="itemCount === 0" class="group-empty-dropzone">
        <span>暂无配置，拖动配置卡片到此处即可归入分组</span>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.config-group-section {
  position: relative;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast),
    background var(--transition-fast);
  overflow: visible;

  &:not(.is-collapsed):not(.is-drop-target):not(.is-dragging-hint):not(.is-dragging):not(.is-insert-before):not(.is-insert-after) {
    transition: none;
  }

  &.is-active {
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.04);
    box-shadow: inset 3px 0 0 var(--success), 0 0 12px rgba(16, 185, 129, 0.06);
  }

  &.is-dragging-hint {
    border-color: rgba(var(--accent-rgb), 0.25);
  }

  &.is-dragging {
    opacity: 0.35;
    border-style: dashed;
    border-color: rgba(var(--accent-rgb), 0.6);
    cursor: grabbing;
  }

  &.is-dragging-group .group-body {
    pointer-events: none;
  }

  &.is-drop-target {
    border-color: var(--accent-primary);
    background: rgba(var(--accent-rgb), 0.08);
    box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.3),
      0 6px 18px rgba(var(--accent-rgb), 0.14);
  }

  &.is-insert-before,
  &.is-insert-after {
    &::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--accent-icon) 0%, var(--accent-primary) 50%, rgba(var(--accent-rgb), 0.4) 100%);
      box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.95), 0 0 2px #ffffff;
      border-radius: 9999px;
      pointer-events: none;
      z-index: 10;
    }

    &::after {
      content: "";
      position: absolute;
      left: -4px;
      width: 8px;
      height: 8px;
      background: #ffffff;
      border: 2px solid var(--accent-primary, #6366f1);
      box-shadow: 0 0 8px rgba(var(--accent-rgb), 0.95);
      border-radius: 50%;
      pointer-events: none;
      z-index: 11;
    }
  }

  &.is-insert-before {
    border-top-color: rgba(var(--accent-rgb), 0.65);

    &::before {
      top: -7px;
    }
    &::after {
      top: -10px;
    }
  }

  &.is-insert-after {
    border-bottom-color: rgba(var(--accent-rgb), 0.65);

    &::before {
      bottom: -7px;
    }
    &::after {
      bottom: -10px;
    }
  }
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  cursor: pointer;
  user-select: none;
  border-radius: var(--radius-md);

  &:hover,
  &:focus-within {
    .group-header-left .group-count-badge {
      opacity: 1;
    }

    .group-header-right .btn-group-action {
      opacity: 1;
      pointer-events: auto;
    }
  }

  .group-header-left {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    flex: 1;

    .chevron-icon {
      color: var(--text-muted);
      flex-shrink: 0;
      transition: transform var(--transition-fast), color var(--transition-fast);

      &.is-expanded {
        transform: rotate(90deg);
        color: var(--text-secondary);
      }
    }

    .folder-icon {
      color: var(--accent-icon);
      flex-shrink: 0;
    }

    .group-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-strong);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .rename-input-box {
      flex: 1;
      min-width: 120px;
      max-width: 260px;

      .rename-input {
        width: 100%;
        height: 26px;
        padding: 0 8px;
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
        background: var(--bg-input);
        border: 1px solid var(--accent-primary);
        border-radius: var(--radius-sm);
        outline: none;
        box-shadow: 0 0 0 2px var(--border-glow);
      }
    }

    .group-count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 18px;
      padding: 0 6px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--bg-control);
      border: 1px solid var(--border-subtle);
      flex-shrink: 0;
      opacity: 0;
      transition: opacity var(--transition-fast);
    }
  }

  .group-header-right {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;

    .drop-into-pill {
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      color: var(--accent-text);
      background: rgba(var(--accent-rgb), 0.16);
      border: 1px solid rgba(var(--accent-rgb), 0.45);
      white-space: nowrap;
    }

    .btn-group-action {
      width: 24px;
      height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: all var(--transition-fast);

      svg {
        display: block;
        flex-shrink: 0;
      }

      &.btn-rename:hover {
        color: var(--text-primary);
        background: var(--bg-control-hover);
        border-color: var(--border-subtle);
      }

      &.btn-delete:hover {
        color: var(--danger-text);
        background: var(--danger-bg);
        border-color: rgba(239, 68, 68, 0.35);
      }

      &.btn-confirm {
        opacity: 1;
        pointer-events: auto;
        color: var(--success-text);
        background: var(--success-bg);
        border-color: var(--success-border);

        &:hover {
          background: rgba(16, 185, 129, 0.22);
        }
      }

      &.btn-cancel {
        opacity: 1;
        pointer-events: auto;
        color: var(--text-secondary);
        background: var(--bg-control);
        border-color: var(--border-subtle);

        &:hover {
          color: var(--text-strong);
          background: var(--bg-control-hover);
        }
      }
    }
  }
}

.group-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 10px 10px;
}

.group-empty-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 12px;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-inset);
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
  transition: all var(--transition-fast);

  .config-group-section.is-drop-target & {
    border-color: var(--accent-primary);
    color: var(--accent-text);
    background: rgba(var(--accent-rgb), 0.08);
  }
}
</style>
