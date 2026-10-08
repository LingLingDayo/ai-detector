<script setup lang="ts">
import { ref, computed } from "vue";
import type { ConfigItem } from "../types";

const props = defineProps<{
  isOpen: boolean;
  configs: ConfigItem[];
  activeConfigId: string | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "apply", item: ConfigItem): void;
  (e: "openCreate"): void;
  (e: "openEdit", item: ConfigItem): void;
  (e: "openSaveCurrent"): void;
  (e: "delete", id: string): void;
}>();

const searchQuery = ref("");
const visibleKeyIds = ref<Set<string>>(new Set());
const copiedId = ref<string | null>(null);

const filteredConfigs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return props.configs;
  return props.configs.filter((item) => {
    return (
      item.name.toLowerCase().includes(query) ||
      item.baseUrl.toLowerCase().includes(query) ||
      (item.modelName && item.modelName.toLowerCase().includes(query))
    );
  });
});

function toggleKeyVisibility(id: string): void {
  if (visibleKeyIds.value.has(id)) {
    visibleKeyIds.value.delete(id);
  } else {
    visibleKeyIds.value.add(id);
  }
}

function maskApiKey(key: string): string {
  if (!key) return "未设置 Key";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

async function copyToClipboard(text: string, id: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copiedId.value = id;
    setTimeout(() => {
      if (copiedId.value === id) {
        copiedId.value = null;
      }
    }, 1500);
  } catch (err) {
    console.warn("复制失败:", err);
  }
}

function handleApply(item: ConfigItem): void {
  emit("apply", item);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="config-modal-backdrop"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div class="config-modal-dialog list-dialog" role="dialog" aria-modal="true">
        <!-- 弹窗顶栏 -->
        <div class="modal-header">
          <div class="header-left">
            <div class="title-icon">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </div>
            <div>
              <div class="title-with-badge">
                <h3>配置列表</h3>
                <span class="count-badge">{{ configs.length }} 个</span>
              </div>
              <p class="header-subtitle">管理、切换及编辑您的所有 API 接口与密钥配置</p>
            </div>
          </div>

          <div class="header-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              @click="emit('openCreate')"
              title="添加一条新的配置"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              添加配置
            </button>
            <button
              type="button"
              class="btn-close"
              title="关闭弹窗 (Esc)"
              @click="emit('close')"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- 弹窗主体 -->
        <div class="modal-body list-body">
          <!-- 搜索与快捷操作条 -->
          <div class="list-toolbar">
            <div class="search-input-wrapper">
              <svg
                class="search-icon"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                v-model="searchQuery"
                placeholder="搜索配置名称、URL、模型..."
                class="search-input"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="btn-clear-search"
                @click="searchQuery = ''"
              >
                ✕
              </button>
            </div>

            <button
              type="button"
              class="btn-save-current"
              @click="emit('openSaveCurrent')"
              title="将主界面当前输入的参数保存为一条新配置"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              保存当前输入为新配置
            </button>
          </div>

          <!-- 配置列表内容 -->
          <div v-if="filteredConfigs.length > 0" class="config-cards-container">
            <div
              v-for="item in filteredConfigs"
              :key="item.id"
              class="config-item-card"
              :class="{ 'is-active': item.id === activeConfigId }"
            >
              <div class="item-header">
                <div class="item-title-row">
                  <span class="item-name">{{ item.name }}</span>
                  <span
                    v-if="item.id === activeConfigId"
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
                    {{ visibleKeyIds.has(item.id) ? (item.apiKey || "空") : maskApiKey(item.apiKey) }}
                  </span>
                  <button
                    type="button"
                    class="btn-mini-icon"
                    :title="visibleKeyIds.has(item.id) ? '隐藏 Key' : '显示 Key'"
                    @click="toggleKeyVisibility(item.id)"
                  >
                    <svg
                      v-if="!visibleKeyIds.has(item.id)"
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
                    :title="copiedId === item.id ? '已复制！' : '复制 API Key'"
                    @click="copyToClipboard(item.apiKey, item.id)"
                  >
                    <svg
                      v-if="copiedId !== item.id"
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
                  :class="{ 'is-applied': item.id === activeConfigId }"
                  :disabled="item.id === activeConfigId"
                  @click="handleApply(item)"
                  title="载入此配置到主表单"
                >
                  <svg
                    v-if="item.id === activeConfigId"
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{{ item.id === activeConfigId ? "已应用" : "使用配置" }}</span>
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
          </div>

          <!-- 空状态 -->
          <div v-else class="empty-state">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h4>{{ searchQuery ? "未找到匹配的配置" : "暂无已保存的配置" }}</h4>
            <p>
              {{
                searchQuery
                  ? "请尝试使用其他关键词进行搜索"
                  : "您可以将当前主表单的输入保存为新配置，或点击下方按钮添加配置"
              }}
            </p>
            <div class="empty-actions">
              <button
                v-if="!searchQuery"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="emit('openSaveCurrent')"
              >
                保存当前输入为配置
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="emit('openCreate')"
              >
                + 添加新配置
              </button>
            </div>
          </div>
        </div>

        <!-- 弹窗底栏 -->
        <div class="modal-footer list-footer">
          <span class="footer-tip">
            💡 点击「使用配置」即可一键将该预设切换至主探测面板
          </span>
          <button type="button" class="btn btn-ghost" @click="emit('close')">
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.config-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 13, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.config-modal-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 660px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75), 0 0 28px rgba(99, 102, 241, 0.2);
  animation: modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(18, 24, 38, 0.95);

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;

    .title-icon {
      width: 34px;
      height: 34px;
      border-radius: var(--radius-sm);
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #818cf8;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .title-with-badge {
      display: flex;
      align-items: center;
      gap: 8px;

      h3 {
        font-size: 0.98rem;
        font-weight: 600;
        color: #fff;
      }

      .count-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
        height: 18px;
        padding: 0 7px;
        line-height: 1;
        border-radius: 9999px;
        background: rgba(99, 102, 241, 0.18);
        border: 1px solid rgba(99, 102, 241, 0.35);
        color: #a5b4fc;
      }
    }

    .header-subtitle {
      font-size: 0.74rem;
      color: var(--text-muted);
      margin-top: 1px;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    .btn-sm {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 26px;
      padding: 0 10px;
      font-size: 0.78rem;
      line-height: 1;

      svg {
        display: block;
        flex-shrink: 0;
      }

      span {
        display: inline-flex;
        align-items: center;
        line-height: 1;
      }
    }

    .btn-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 1.05rem;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: var(--radius-sm);
      transition: all var(--transition-fast);

      &:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }
    }
  }
}

.list-body {
  padding: 14px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 280px;
}

.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;

  .search-input-wrapper {
    position: relative;
    flex: 1;
    min-width: 200px;
    display: flex;
    align-items: center;

    .search-icon {
      position: absolute;
      left: 9px;
      color: var(--text-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: 5px 28px 5px 28px;
      font-size: 0.78rem;
      background: var(--bg-input);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      outline: none;
      transition: all var(--transition-fast);

      &:focus {
        border-color: var(--accent-primary);
        box-shadow: 0 0 0 2px var(--border-glow);
      }

      &::placeholder {
        color: #475569;
      }
    }

    .btn-clear-search {
      position: absolute;
      right: 6px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 2px 4px;

      &:hover {
        color: #fff;
      }
    }
  }

  .btn-save-current {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 26px;
    padding: 0 10px;
    font-size: 0.76rem;
    font-weight: 500;
    line-height: 1;
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.28);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;

    svg {
      display: block;
      flex-shrink: 0;
    }

    span {
      display: inline-flex;
      align-items: center;
      line-height: 1;
    }

    &:hover {
      background: rgba(59, 130, 246, 0.22);
      border-color: rgba(59, 130, 246, 0.5);
      color: #bfdbfe;
    }
  }
}

.config-cards-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  text-align: center;
  color: var(--text-muted);
  gap: 8px;

  .empty-icon {
    color: #475569;
    margin-bottom: 4px;
  }

  h4 {
    font-size: 0.92rem;
    color: var(--text-secondary);
  }

  p {
    font-size: 0.76rem;
    max-width: 320px;
    line-height: 1.5;
  }

  .empty-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(18, 24, 38, 0.95);

  .footer-tip {
    font-size: 0.72rem;
    color: var(--text-muted);
  }
}
</style>
