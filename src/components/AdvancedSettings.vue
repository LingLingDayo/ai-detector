<script setup lang="ts">
import { REASONING_EFFORT_OPTIONS } from "../constants";

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    summary: string;
    apiFormat: string;
    reasoningEffort: string;
    stream?: boolean;
  }>(),
  {
    stream: true,
  }
);

const emit = defineEmits<{
  (e: "update:isOpen", value: boolean): void;
  (e: "update:apiFormat", value: string): void;
  (e: "update:reasoningEffort", value: string): void;
  (e: "update:stream", value: boolean): void;
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
        <!-- 请求传输模式 (流式 / 同步) -->
        <div class="advanced-row">
          <div class="advanced-row-header">
            <label title="配置请求方式：流式传输或全量同步传输">请求传输模式</label>
            <span class="field-hint">{{ stream !== false ? '首包超时 90s' : '全量超时 240s' }}</span>
          </div>
          <div class="segmented-control stream-control">
            <label class="segment" title="流式请求（默认模式，首次响应限时 90 秒，完整生成后返回结果）">
              <input
                type="radio"
                name="request-stream"
                :value="true"
                :checked="stream !== false"
                @change="emit('update:stream', true)"
              />
              <span class="segment-label">流式请求</span>
            </label>
            <label class="segment" title="同步请求（传统全量响应，超时锁定 240 秒）">
              <input
                type="radio"
                name="request-stream"
                :value="false"
                :checked="stream === false"
                @change="emit('update:stream', false)"
              />
              <span class="segment-label">同步请求</span>
            </label>
          </div>
        </div>

        <!-- 端点协议选择 -->
        <div class="advanced-row">
          <label title="选择调用的 API 规范与端点路径格式">接口协议端点</label>
          <div class="segmented-control">
            <label class="segment" title="OpenAI Responses 格式">
              <input
                type="radio"
                name="endpoint-format"
                value="responses"
                :checked="apiFormat === 'responses'"
                @change="emit('update:apiFormat', 'responses')"
              />
              <span class="segment-label">/v1/responses 端点</span>
            </label>
            <label class="segment" title="OpenAI Chat Completions 格式">
              <input
                type="radio"
                name="endpoint-format"
                value="chat_completions"
                :checked="apiFormat === 'chat_completions'"
                @change="emit('update:apiFormat', 'chat_completions')"
              />
              <span class="segment-label">/v1/chat/completions 端点</span>
            </label>
            <label class="segment" title="Anthropic Messages 格式">
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
      display: inline-flex;
      align-items: center;
      gap: 6px;
      line-height: 1;

      .gear-icon {
        color: var(--accent-primary);
        display: block;
        flex-shrink: 0;
      }

      span {
        display: inline-flex;
        align-items: center;
        line-height: 1;
      }

      .settings-summary {
        font-size: 0.72rem;
        color: var(--text-muted);
        display: inline-flex;
        align-items: center;
        line-height: 1;
      }
    }

    .chevron-icon {
      display: block;
      flex-shrink: 0;
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
          gap: 3px;
          background: var(--bg-input);
          padding: 2px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);

          &.reasoning-control {
            grid-template-columns: repeat(8, 1fr);
          }

          &.stream-control {
            grid-template-columns: repeat(2, 1fr);
          }

          @media (max-width: 640px) {
            grid-template-columns: 1fr;

            &.reasoning-control {
              grid-template-columns: repeat(4, 1fr);
            }

            &.stream-control {
              grid-template-columns: repeat(2, 1fr);
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
              pointer-events: none;
              outline: none;
              border: none;
              box-shadow: none;

              &:checked + .segment-label {
                background: rgba(99, 102, 241, 0.2);
                color: #ffffff;
                font-weight: 600;
                border-color: rgba(99, 102, 241, 0.5);
                box-shadow: 0 1px 6px rgba(99, 102, 241, 0.2);
              }
            }

            .segment-label {
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 3.5px 8px;
              border-radius: calc(var(--radius-sm) - 2px);
              border: 1px solid transparent;
              font-size: 0.76rem;
              font-weight: 500;
              line-height: 1.25;
              color: var(--text-secondary);
              background: transparent;
              transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
              user-select: none;
              box-sizing: border-box;

              &:hover {
                color: var(--text-primary);
                background: rgba(255, 255, 255, 0.04);
              }
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
