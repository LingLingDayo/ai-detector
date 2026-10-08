<script setup lang="ts">
import { REASONING_EFFORT_OPTIONS } from "../constants";

const props = defineProps<{
  isOpen: boolean;
  summary: string;
  apiFormat: string;
  reasoningEffort: string;
}>();

const emit = defineEmits<{
  (e: "update:isOpen", value: boolean): void;
  (e: "update:apiFormat", value: string): void;
  (e: "update:reasoningEffort", value: string): void;
}>();
</script>

<template>
  <div class="accordion-item" id="advanced-settings-accordion">
    <button
      type="button"
      class="accordion-trigger"
      :class="{ open: isOpen }"
      id="toggle-advanced"
      title="展开或收起高级端点与请求参数设置"
      @click="emit('update:isOpen', !isOpen)"
    >
      <div class="trigger-content">
        <svg class="gear-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>更多设置</span>
        <span class="settings-summary" id="settings-summary">{{ summary }}</span>
      </div>
      <svg class="chevron-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>

    <div class="accordion-panel" :class="{ hidden: !isOpen }" id="advanced-panel">
      <div class="advanced-grid">
        <!-- 端点协议选择 -->
        <div class="advanced-row">
          <label title="选择调用的 API 规范与端点路径格式">接口协议端点</label>
          <div class="segmented-control">
            <label class="segment" title="OpenAI Responses 规范路由 (/v1/responses)">
              <input
                type="radio"
                name="endpoint-format"
                value="responses"
                :checked="apiFormat === 'responses'"
                @change="emit('update:apiFormat', 'responses')"
              />
              <span class="segment-label">/v1/responses 端点</span>
            </label>
            <label class="segment" title="OpenAI Chat Completions 规范路由 (/v1/chat/completions)">
              <input
                type="radio"
                name="endpoint-format"
                value="chat_completions"
                :checked="apiFormat === 'chat_completions'"
                @change="emit('update:apiFormat', 'chat_completions')"
              />
              <span class="segment-label">/v1/chat/completions 端点</span>
            </label>
            <label class="segment" title="Anthropic Claude Messages 规范路由与 x-api-key 认证 (/v1/messages)">
              <input
                type="radio"
                name="endpoint-format"
                value="anthropic"
                :checked="apiFormat === 'anthropic'"
                @change="emit('update:apiFormat', 'anthropic')"
              />
              <span class="segment-label">/v1/messages 端点</span>
            </label>
          </div>
        </div>

        <!-- 思考强度选择 (Reasoning Effort) -->
        <div class="advanced-row">
          <div class="advanced-row-header">
            <label title="配置模型的深度思考与推理强度">思考强度</label>
            <span class="field-hint">默认 high · 超时锁定 150s</span>
          </div>
          <div class="segmented-control reasoning-control">
            <label
              v-for="opt in REASONING_EFFORT_OPTIONS"
              :key="opt.value"
              class="segment"
              :title="opt.value === 'high' ? `${opt.description} (默认)` : opt.description"
            >
              <input
                type="radio"
                name="reasoning-effort"
                :value="opt.value"
                :checked="reasoningEffort === opt.value"
                @change="emit('update:reasoningEffort', opt.value)"
              />
              <span class="segment-label">{{ opt.label }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.accordion-item {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: rgba(17, 23, 34, 0.5);
  overflow: hidden;

  .accordion-trigger {
    width: 100%;
    padding: 6px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.78rem;
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);

    &:hover {
      background: rgba(30, 41, 59, 0.3);
      color: var(--text-primary);
    }

    &.open .chevron-icon {
      transform: rotate(180deg);
    }

    .trigger-content {
      display: flex;
      align-items: center;
      gap: 6px;

      .gear-icon {
        color: var(--accent-primary);
      }

      .settings-summary {
        font-size: 0.72rem;
        color: var(--text-muted);
      }
    }

    .chevron-icon {
      transition: transform var(--transition-normal);
    }
  }

  .accordion-panel {
    padding: 10px 12px;
    border-top: 1px solid var(--border-subtle);
    background: rgba(12, 16, 24, 0.5);

    .advanced-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .advanced-row {
        display: flex;
        flex-direction: column;
        gap: 4px;

        .advanced-row-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .field-hint {
          font-size: 0.7rem;
          color: var(--text-muted);
        }

        .segmented-control {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
          background: var(--bg-input);
          padding: 3px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);

          &.reasoning-control {
            grid-template-columns: repeat(8, 1fr);
          }

          @media (max-width: 640px) {
            grid-template-columns: 1fr;

            &.reasoning-control {
              grid-template-columns: repeat(4, 1fr);
            }
          }

          .segment {
            cursor: pointer;
            position: relative;

            input {
              position: absolute;
              opacity: 0;
              width: 0;
              height: 0;

              &:checked + .segment-label {
                background: rgba(99, 102, 241, 0.2);
                color: #fff;
                border: 1px solid rgba(99, 102, 241, 0.4);
              }
            }

            .segment-label {
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 5px 8px;
              border-radius: var(--radius-sm);
              font-size: 0.76rem;
              font-weight: 500;
              color: var(--text-secondary);
              transition: all var(--transition-fast);
            }
          }
        }
      }

      .advanced-columns {
        display: flex;
        gap: 10px;
      }
    }
  }
}
</style>
