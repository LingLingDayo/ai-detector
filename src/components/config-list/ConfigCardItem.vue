<script setup lang="ts">
import type { ConfigItem } from "../../types";

const props = withDefaults(
  defineProps<{
    item: ConfigItem;
    isActive: boolean;
    isDragging?: boolean;
    isDragOver?: boolean;
  }>(),
  {
    isDragging: false,
    isDragOver: false,
  }
);

const emit = defineEmits<{
  (e: "apply", item: ConfigItem): void;
  (e: "openEdit", item: ConfigItem): void;
  (e: "delete", id: string): void;
  (e: "dragstart", event: DragEvent, id: string): void;
  (e: "dragover", event: DragEvent, id: string): void;
  (e: "dragenter", event: DragEvent, id: string): void;
  (e: "dragleave", event: DragEvent, id: string): void;
  (e: "drop", event: DragEvent, id: string): void;
  (e: "dragend"): void;
}>();

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
      'is-drag-over': isDragOver
    }"
    draggable="true"
    @dragstart="emit('dragstart', $event, item.id)"
    @dragover.prevent="emit('dragover', $event, item.id)"
    @dragenter.prevent="emit('dragenter', $event, item.id)"
    @dragleave="emit('dragleave', $event, item.id)"
    @drop.prevent="emit('drop', $event, item.id)"
    @dragend="emit('dragend')"
  >
    <!-- 主信息与操作栏 -->
    <div class="card-main-row">
      <div class="card-title-group">
        <span class="item-name" :title="item.name">{{ item.name }}</span>
      </div>

      <div class="card-actions" @mousedown.stop>
        <button
          type="button"
          class="btn-action btn-apply"
          :class="{ 'is-applied': isActive }"
          :disabled="isActive"
          :title="isActive ? '当前正在使用此配置' : '应用此配置到主界面'"
          draggable="false"
          @dragstart.stop.prevent
          @click.stop="emit('apply', item)"
        >
          <svg
            v-if="isActive"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{{ isActive ? "已应用" : "应用" }}</span>
        </button>

        <button
          type="button"
          class="btn-action btn-edit"
          title="编辑此配置"
          draggable="false"
          @dragstart.stop.prevent
          @click.stop="emit('openEdit', item)"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
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
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
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
  background: rgba(15, 21, 32, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: default;
  user-select: none;
  transition: all var(--transition-fast);

  &:hover {
    border-color: rgba(99, 102, 241, 0.35);
    background: rgba(20, 28, 43, 0.75);
  }

  &.is-active {
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.04);
    box-shadow: inset 3px 0 0 var(--success), 0 0 12px rgba(16, 185, 129, 0.06);
  }

  &.is-dragging {
    opacity: 0.35;
    border-style: dashed;
    border-color: rgba(99, 102, 241, 0.6);
  }

  &.is-drag-over {
    border-color: var(--accent-primary);
    background: rgba(99, 102, 241, 0.18);
    box-shadow: 0 0 14px rgba(99, 102, 241, 0.3);
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
          transform: translateY(1px);
        }

        &.btn-apply {
          background: rgba(99, 102, 241, 0.12);
          color: #a5b4fc;
          border-color: rgba(99, 102, 241, 0.3);
          font-weight: 600;

          &:hover:not(:disabled) {
            background: rgba(99, 102, 241, 0.25);
            border-color: rgba(99, 102, 241, 0.5);
            color: #fff;
          }

          &.is-applied {
            background: rgba(16, 185, 129, 0.1);
            color: var(--success);
            border-color: rgba(16, 185, 129, 0.25);
            cursor: default;
          }
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
