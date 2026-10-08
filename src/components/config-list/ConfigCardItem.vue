<script setup lang="ts">
import { ref } from "vue";
import type { ConfigItem } from "../../types";

defineProps<{
  item: ConfigItem;
  isActive: boolean;
}>();

const emit = defineEmits<{
  (e: "apply", item: ConfigItem): void;
  (e: "openEdit", item: ConfigItem): void;
  (e: "delete", id: string): void;
}>();

const isKeyVisible = ref(false);
const isCopied = ref(false);

function toggleKeyVisibility(): void {
  isKeyVisible.value = !isKeyVisible.value;
}

function maskApiKey(key: string): string {
  if (!key) return "未设置 Key";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 1500);
  } catch (err) {
    console.warn("复制失败:", err);
  }
}
</script>

<template>
  <div
    class="config-item-card"
    :class="{ 'is-active': isActive }"
  >
    <div class="item-header">
      <div class="item-title-row">
        <span class="item-name">{{ item.name }}</span>
        <span
          v-if="isActive"
          class="active-tag"
          title="当前主表单正在使用此配置"
        >
          <span class="dot"></span> 当前使用中
        </span>
      </div>

      <div class="item-tags">
        <span v-if="item.modelName" class="tag tag-model" :title="`默认模型: ${item.modelName}`">
          {{ item.modelName }}
        </span>
        <span class="tag tag-format">
          {{
            item.apiFormat === "responses"
              ? "responses"
              : item.apiFormat === "anthropic"
              ? "messages"
              : "chat"
          }}
        </span>
      </div>
    </div>

    <div class="item-details">
      <div class="detail-row">
        <span class="detail-label">URL</span>
        <span class="detail-value url-value" :title="item.baseUrl">{{ item.baseUrl || "未设置" }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">KEY</span>
        <span class="detail-value key-value">
          {{ isKeyVisible ? (item.apiKey || "空") : maskApiKey(item.apiKey) }}
        </span>
        <button
          type="button"
          class="btn-mini-icon"
          :title="isKeyVisible ? '隐藏 Key' : '显示 Key'"
          @click="toggleKeyVisibility"
        >
          <svg
            v-if="!isKeyVisible"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </button>
        <button
          v-if="item.apiKey"
          type="button"
          class="btn-mini-icon"
          :title="isCopied ? '已复制！' : '复制 API Key'"
          @click="copyToClipboard(item.apiKey)"
        >
          <svg
            v-if="!isCopied"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span v-else class="copied-text">✓</span>
        </button>
      </div>
    </div>

    <!-- 卡片操作按钮 -->
    <div class="item-actions">
      <button
        type="button"
        class="btn-action btn-apply"
        :class="{ 'is-applied': isActive }"
        :disabled="isActive"
        @click="emit('apply', item)"
        title="载入此配置到主表单"
      >
        <svg
          v-if="isActive"
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>{{ isActive ? "已应用" : "使用配置" }}</span>
      </button>

      <div class="actions-right">
        <button
          type="button"
          class="btn-action btn-edit"
          @click="emit('openEdit', item)"
          title="编辑此配置的名称与参数"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>编辑</span>
        </button>
        <button
          type="button"
          class="btn-action btn-delete"
          @click="emit('delete', item.id)"
          title="删除此配置"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span>删除</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.config-item-card {
  background: rgba(15, 21, 32, 0.75);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all var(--transition-fast);

  &:hover {
    border-color: rgba(99, 102, 241, 0.4);
    background: rgba(20, 28, 43, 0.85);
  }

  &.is-active {
    border-color: rgba(16, 185, 129, 0.45);
    background: rgba(16, 185, 129, 0.05);
    box-shadow: 0 0 14px rgba(16, 185, 129, 0.08);
  }

  .item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    .item-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;

      .item-name {
        font-size: 0.9rem;
        font-weight: 600;
        color: #f1f5f9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .active-tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font-size: 0.68rem;
        font-weight: 500;
        height: 18px;
        padding: 0 6px;
        line-height: 1;
        border-radius: 9999px;
        background: var(--success-bg);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: var(--success);
        flex-shrink: 0;

        .dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--success);
          box-shadow: 0 0 5px var(--success);
          flex-shrink: 0;
        }
      }
    }

    .item-tags {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;

      .tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 18px;
        font-size: 0.68rem;
        padding: 0 6px;
        line-height: 1;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-subtle);
        background: rgba(30, 41, 59, 0.5);
        color: var(--text-secondary);

        &.tag-model {
          color: #a5b4fc;
          border-color: rgba(99, 102, 241, 0.3);
          background: rgba(99, 102, 241, 0.1);
        }

        &.tag-format {
          font-family: monospace;
          color: #94a3b8;
        }
      }
    }
  }

  .item-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(11, 15, 23, 0.6);
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid rgba(255, 255, 255, 0.04);

    .detail-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.74rem;

      .detail-label {
        color: var(--text-muted);
        font-weight: 600;
        font-size: 0.68rem;
        width: 28px;
        flex-shrink: 0;
      }

      .detail-value {
        font-family: "SFMono-Regular", Consolas, Menlo, monospace;
        color: #cbd5e1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;

        &.url-value {
          color: #93c5fd;
        }

        &.key-value {
          color: #94a3b8;
        }
      }

      .btn-mini-icon {
        background: transparent;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 2px;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color var(--transition-fast);
        flex-shrink: 0;

        &:hover {
          color: var(--text-primary);
        }

        .copied-text {
          font-size: 0.68rem;
          color: var(--success);
          font-weight: bold;
        }
      }
    }
  }

  .item-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2px;

    .btn-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 24px;
      padding: 0 8px;
      font-size: 0.74rem;
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

      &.btn-apply {
        background: rgba(99, 102, 241, 0.15);
        color: #a5b4fc;
        border-color: rgba(99, 102, 241, 0.35);
        font-weight: 600;

        &:hover:not(:disabled) {
          background: rgba(99, 102, 241, 0.3);
          border-color: rgba(99, 102, 241, 0.6);
          color: #fff;
        }

        &.is-applied {
          background: rgba(16, 185, 129, 0.12);
          color: var(--success);
          border-color: rgba(16, 185, 129, 0.3);
          cursor: default;
        }
      }

      &.btn-edit {
        background: transparent;
        color: var(--text-secondary);
        border-color: var(--border-subtle);

        &:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-primary);
          border-color: var(--text-secondary);
        }
      }

      &.btn-delete {
        background: transparent;
        color: #f87171;
        border-color: rgba(239, 68, 68, 0.2);

        &:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.4);
          color: #fca5a5;
        }
      }
    }

    .actions-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }
}
</style>
