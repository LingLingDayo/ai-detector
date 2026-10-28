<script setup lang="ts">
import { computed } from "vue";
import type { ConfigItem } from "../../types";
import { Check, Pencil, Trash2 } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    item: ConfigItem;
    isActive: boolean;
    isDragging?: boolean;
    isDragOver?: boolean;
    dragOverPosition?: "before" | "after" | null;
  }>(),
  {
    isDragging: false,
    isDragOver: false,
    dragOverPosition: null,
  }
);

const emit = defineEmits<{
  (e: "apply", item: ConfigItem): void;
  (e: "quickApply", item: ConfigItem): void;
  (e: "openEdit", item: ConfigItem): void;
  (e: "delete", id: string): void;
  (e: "dragstart", event: DragEvent, id: string): void;
  (e: "dragover", event: DragEvent, id: string, position: "before" | "after"): void;
  (e: "dragenter", event: DragEvent, id: string, position: "before" | "after"): void;
  (e: "dragleave", event: DragEvent, id: string): void;
  (e: "drop", event: DragEvent, id: string, position: "before" | "after"): void;
  (e: "dragend"): void;
}>();

let isDragHappening = false;

const cardTooltip = computed(() => {
  if (props.isActive) {
    return "当前正在使用此配置 · 拖动可调整顺序";
  }
  return "点击可切换此配置 · 双击快速切换 · 拖动可调整顺序";
});

function calculatePosition(event: DragEvent): "before" | "after" {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return "before";
  const rect = target.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  return offsetY < rect.height / 2 ? "before" : "after";
}

function handleDragStart(event: DragEvent) {
  isDragHappening = true;
  emit("dragstart", event, props.item.id);
}

function handleDragEnd() {
  emit("dragend");
  setTimeout(() => {
    isDragHappening = false;
  }, 100);
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  if (isDragHappening || props.isDragging) return;
  const position = calculatePosition(event);
  emit("dragover", event, props.item.id, position);
}

function handleDragEnter(event: DragEvent) {
  event.preventDefault();
  if (isDragHappening || props.isDragging) return;
  const position = calculatePosition(event);
  emit("dragenter", event, props.item.id, position);
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  if (isDragHappening || props.isDragging) return;
  const position = calculatePosition(event);
  emit("drop", event, props.item.id, position);
}

function handleCardClick() {
  if (isDragHappening || props.isDragging) return;
  if (props.isActive) return;
  emit("apply", props.item);
}

function handleCardDoubleClick() {
  if (isDragHappening || props.isDragging) return;
  emit("quickApply", props.item);
}

function maskApiKey(key?: string): string {
  if (!key) return "未设置";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
</script>

<template>
  <div
    class="config-item-card"
    :class="{
      'is-active': isActive,
      'is-dragging': isDragging,
      'is-drag-over': isDragOver && !dragOverPosition,
      'is-insert-before': dragOverPosition === 'before',
      'is-insert-after': dragOverPosition === 'after'
    }"
    :title="cardTooltip"
    draggable="true"
    @click="handleCardClick"
    @dblclick="handleCardDoubleClick"
    @dragstart="handleDragStart"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="emit('dragleave', $event, item.id)"
    @drop="handleDrop"
    @dragend="handleDragEnd"
  >
    <!-- 主信息与操作栏 -->
    <div class="card-main-row">
      <div class="card-title-group">
        <span class="item-name">{{ item.name }}</span>
        <!-- 激活状态标记 -->
        <span v-if="isActive" class="status-badge badge-active">
          <Check :size="11" :stroke-width="2.5" />
          <span>已应用</span>
        </span>
        <!-- 未激活时的悬浮切换提示 -->
        <span v-else class="status-badge badge-hint">
          <span>点击切换</span>
        </span>
      </div>

      <div class="card-actions" @mousedown.stop @dblclick.stop>
        <button
          type="button"
          class="btn-action btn-edit"
          title="编辑此配置"
          draggable="false"
          @dragstart.stop.prevent
          @click.stop="emit('openEdit', item)"
        >
          <Pencil :size="12" />
          <span>编辑</span>
        </button>

        <button
          type="button"
          class="btn-action btn-delete"
          title="删除此配置"
          draggable="false"
          @dragstart.stop.prevent
          @click.stop="emit('delete', item.id)"
        >
          <Trash2 :size="12" />
          <span>删除</span>
        </button>
      </div>
    </div>

    <!-- 简洁的 URL 与 KEY 信息行 -->
    <div class="card-meta-row">
      <div class="meta-item meta-url" :title="item.baseUrl || '未设置 URL'">
        <span class="meta-label">URL</span>
        <span class="meta-value">{{ item.baseUrl || "未设置" }}</span>
      </div>
      <span class="meta-separator">•</span>
      <div class="meta-item meta-key" :title="item.apiKey ? maskApiKey(item.apiKey) : '未设置 Key'">
        <span class="meta-label">KEY</span>
        <span class="meta-value">{{ maskApiKey(item.apiKey) }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.config-item-card {
  position: relative;
  background: rgba(15, 21, 32, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-fast);

  &:hover {
    border-color: rgba(99, 102, 241, 0.45);
    background: rgba(22, 31, 48, 0.85);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25), 0 0 10px rgba(99, 102, 241, 0.1);
    transform: translateY(-1px);

    .card-main-row .card-title-group .badge-hint {
      opacity: 1;
      transform: translateX(0);
    }
  }

  &:active {
    transform: translateY(0);
  }

  /* 鼠标悬浮在编辑/删除按钮上时，柔和淡化切换提示，聚焦当前按钮操作 */
  &:has(.card-actions:hover) {
    .card-main-row .card-title-group .badge-hint {
      opacity: 0.2;
      transform: translateX(-2px);
    }
  }

  &.is-active {
    cursor: default;
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.04);
    box-shadow: inset 3px 0 0 var(--success), 0 0 12px rgba(16, 185, 129, 0.06);
    transform: none;

    &:hover {
      border-color: rgba(16, 185, 129, 0.55);
      background: rgba(16, 185, 129, 0.06);
      box-shadow: inset 3px 0 0 var(--success), 0 0 14px rgba(16, 185, 129, 0.1);
      transform: none;
    }
  }

  &.is-dragging {
    opacity: 0.35;
    border-style: dashed;
    border-color: rgba(99, 102, 241, 0.6);
    cursor: grabbing;
    transform: none;
  }

  &.is-drag-over {
    border-color: var(--accent-primary);
    background: rgba(99, 102, 241, 0.18);
    box-shadow: 0 0 14px rgba(99, 102, 241, 0.3);
    transform: none;
  }

  &.is-insert-before,
  &.is-insert-after {
    &::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, #818cf8 0%, #6366f1 50%, rgba(99, 102, 241, 0.4) 100%);
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.95), 0 0 2px #ffffff;
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
      box-shadow: 0 0 8px rgba(99, 102, 241, 0.95);
      border-radius: 50%;
      pointer-events: none;
      z-index: 11;
    }
  }

  &.is-insert-before {
    border-top-color: rgba(99, 102, 241, 0.65);

    &::before {
      top: -6px;
    }
    &::after {
      top: -9px;
    }
  }

  &.is-insert-after {
    border-bottom-color: rgba(99, 102, 241, 0.65);

    &::before {
      bottom: -6px;
    }
    &::after {
      bottom: -9px;
    }
  }

  .card-main-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;

    .card-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;

      .item-name {
        font-size: 0.88rem;
        font-weight: 600;
        color: #f1f5f9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 7px;
        font-size: 0.68rem;
        font-weight: 500;
        line-height: 1.3;
        border-radius: 9999px;
        flex-shrink: 0;
        transition: all var(--transition-fast);
        pointer-events: none;
      }

      .badge-active {
        color: var(--success);
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(16, 185, 129, 0.3);
      }

      .badge-hint {
        color: #a5b4fc;
        background: rgba(99, 102, 241, 0.14);
        border: 1px solid rgba(99, 102, 241, 0.35);
        opacity: 0;
        transform: translateX(-4px);
      }
    }

    .card-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;

      .btn-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        height: 24px;
        padding: 0 8px;
        font-size: 0.72rem;
        font-weight: 500;
        line-height: 1;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-family: inherit;
        transition: all var(--transition-fast);
        border: 1px solid transparent;

        svg {
          display: block;
          flex-shrink: 0;
        }

        span {
          display: inline-flex;
          align-items: center;
          line-height: 1;
        }

        &.btn-edit {
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          border-color: var(--border-subtle);

          &:hover {
            background: rgba(255, 255, 255, 0.08);
            color: var(--text-primary);
            border-color: rgba(255, 255, 255, 0.2);
          }
        }

        &.btn-delete {
          background: transparent;
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.18);

          &:hover {
            background: rgba(239, 68, 68, 0.12);
            border-color: rgba(239, 68, 68, 0.35);
            color: #fca5a5;
          }
        }
      }
    }
  }

  .card-meta-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.72rem;
    min-width: 0;

    .meta-separator {
      color: rgba(255, 255, 255, 0.2);
      font-size: 0.65rem;
      user-select: none;
      flex-shrink: 0;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;

      .meta-label {
        font-size: 0.64rem;
        font-weight: 700;
        color: #475569;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      }

      .meta-value {
        font-family: "SFMono-Regular", Consolas, Menlo, monospace;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &.meta-url {
        max-width: 320px;

        .meta-value {
          color: #7dd3fc;
        }
      }

      &.meta-key {
        flex-shrink: 0;

        .meta-value {
          color: #94a3b8;
        }
      }
    }
  }
}
</style>
