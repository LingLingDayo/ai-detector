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
            <label class="segment" title="OpenAI 规范路由，兼容绝大多数中转网关与第三方模型服务（默认）">
              <input
                type="radio"
                name="endpoint-format"
                value="chat_completions"
                :checked="apiFormat === 'chat_completions'"
                @change="emit('update:apiFormat', 'chat_completions')"
              />
              <span class="segment-label">/v1/chat/completions 端点</span>
            </label>
            <label class="segment" title="Anthropic Claude Messages 规范路由与 x-api-key 认证">
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
            <span class="field-hint">默认 high · 超时锁定 60s</span>
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
