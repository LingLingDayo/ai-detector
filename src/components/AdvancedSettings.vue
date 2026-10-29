<script setup lang="ts">
import { computed } from "vue";
import { Settings, ChevronDown } from "@lucide/vue";
import { SegmentedControl, type SegmentedOption } from "./common";

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    summary: string;
    apiFormat: string;
    stream?: boolean;
    disabled?: boolean;
  }>(),
  {
    stream: true,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "update:isOpen", value: boolean): void;
  (e: "update:apiFormat", value: string): void;
  (e: "update:stream", value: boolean): void;
}>();

const streamModeOptions: SegmentedOption[] = [
  {
    value: "stream",
    label: "流式请求",
    title: "流式请求（默认模式，首次响应限时 90 秒，完整生成后返回结果）",
  },
  {
    value: "sync",
    label: "同步请求",
    title: "同步请求（全量响应，超时锁定 240 秒）",
  },
];

const apiFormatOptions: SegmentedOption[] = [
  { value: "responses", label: "/v1/responses 端点", title: "OpenAI Responses 格式" },
  { value: "chat_completions", label: "/v1/chat/completions 端点", title: "OpenAI Chat Completions 格式" },
  { value: "anthropic", label: "/v1/messages 端点", title: "Anthropic Messages 格式" },
];

const streamMode = computed(() => (props.stream !== false ? "stream" : "sync"));

function handleStreamModeChange(value: string): void {
  emit("update:stream", value === "stream");
}

function handleApiFormatChange(value: string): void {
  emit("update:apiFormat", value);
}
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
        <Settings :size="15" class="gear-icon" />
        <span>更多设置</span>
        <span class="settings-summary" id="settings-summary">{{ summary }}</span>
      </div>
      <ChevronDown :size="14" class="chevron-icon" />
    </button>

    <div class="accordion-panel" :class="{ hidden: !isOpen }" id="advanced-panel">
      <div class="advanced-grid">
        <!-- 请求传输模式 (流式 / 同步) -->
        <div class="advanced-row">
          <div class="advanced-row-header">
            <label title="配置请求方式：流式传输或全量同步传输">请求模式</label>
            <span class="field-hint">{{ stream !== false ? '首包超时 90s' : '全量超时 240s' }}</span>
          </div>
          <SegmentedControl
            :model-value="streamMode"
            :options="streamModeOptions"
            :disabled="disabled"
            @change="handleStreamModeChange"
          />
        </div>

        <!-- 端点协议选择 -->
        <div class="advanced-row">
          <label title="选择调用的 API 规范与端点路径格式">请求接口</label>
          <SegmentedControl
            :model-value="apiFormat"
            :options="apiFormatOptions"
            :disabled="disabled"
            stack-on-mobile
            @change="handleApiFormatChange"
          />
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
    height: 32px;
    padding: 0 10px;
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
        display: block;
        line-height: 1rem;
      }

      .settings-summary {
        font-size: 0.72rem;
        color: var(--text-muted);
      }
    }

    .chevron-icon {
      display: block;
      flex-shrink: 0;
      color: var(--text-muted);
      transition: transform var(--transition-normal), color var(--transition-fast);
    }

    &:hover .chevron-icon {
      color: var(--text-primary);
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
      }

      .advanced-columns {
        display: flex;
        gap: 10px;
      }
    }
  }
}
</style>
