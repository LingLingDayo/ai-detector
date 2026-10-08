<script setup lang="ts">
import { ref } from "vue";
import type { ClientConfig } from "../types";
import ModelCombobox from "./ModelCombobox.vue";
import AdvancedSettings from "./AdvancedSettings.vue";

const props = defineProps<{
  config: ClientConfig;
  activeConfigName?: string;
  configListCount?: number;
  isRunning: boolean;
  isPasswordVisible: boolean;
  isAdvancedOpen: boolean;
  settingsSummary: string;
}>();

const emit = defineEmits<{
  (e: "toggle-password"): void;
  (e: "update:isAdvancedOpen", value: boolean): void;
  (e: "submit"): void;
  (e: "reset"): void;
  (e: "open-save-config"): void;
  (e: "open-config-list"): void;
}>();

const comboboxRef = ref<InstanceType<typeof ModelCombobox> | null>(null);

function handleReset(): void {
  emit("reset");
}

defineExpose({
  resetModelList: () => {
    comboboxRef.value?.resetModelList();
  },
});
</script>

<template>
  <section class="card config-card">
    <div class="card-header">
      <div class="header-title-group">
        <h2>探测参数配置</h2>
        <span
          v-if="activeConfigName"
          class="active-config-tag"
          :title="`当前应用配置：${activeConfigName}`"
        >
          <span class="active-dot"></span>
          {{ activeConfigName }}
        </span>
      </div>

      <div class="header-actions-group">
        <button
          type="button"
          class="btn-header-action btn-save-config"
          id="btn-save-config"
          title="将当前填写的接口参数与密钥保存为配置预设"
          @click="emit('open-save-config')"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <span>保存配置</span>
        </button>

        <button
          type="button"
          class="btn-header-action btn-config-list"
          id="btn-config-list"
          title="管理与切换已保存的配置预设列表"
          @click="emit('open-config-list')"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
          <span>配置列表</span>
          <span v-if="configListCount !== undefined && configListCount > 0" class="config-count-badge">
            {{ configListCount }}
          </span>
        </button>
      </div>
    </div>

    <form id="test-form" class="config-form" @submit.prevent="emit('submit')">
      <!-- 第一行：Base URL 与 API Key -->
      <div class="form-row">
        <div class="form-group flex-1">
          <label for="base-url" title="API 根域名或网关地址，支持反代与中转地址">Base URL</label>
          <div class="input-wrapper">
            <input
              type="url"
              id="base-url"
              v-model="config.baseUrl"
              placeholder="https://api.openai.com"
              required
              autocomplete="off"
              spellcheck="false"
              title="API 接口根路径，例如 https://api.openai.com 或中转域名"
              @blur="comboboxRef?.triggerAutoFetch(true)"
              @keydown.enter="comboboxRef?.triggerAutoFetch(true)"
            />
          </div>
        </div>

        <div class="form-group flex-1">
          <label for="api-key" title="用于鉴权的 API 密钥，仅保存在本电脑本地">API Key</label>
          <div class="input-wrapper">
            <input
              :type="isPasswordVisible ? 'text' : 'password'"
              id="api-key"
              v-model="config.apiKey"
              placeholder="sk-..."
              required
              autocomplete="off"
              spellcheck="false"
              title="API Key 访问凭据，仅存储在本地 localStorage"
              @blur="comboboxRef?.triggerAutoFetch(true)"
              @keydown.enter="comboboxRef?.triggerAutoFetch(true)"
            />
            <button
              type="button"
              class="btn-icon"
              id="toggle-key-visibility"
              title="切换显示/隐藏 Key"
              @click="emit('toggle-password')"
            >
              <svg
                class="eye-open"
                :class="{ hidden: isPasswordVisible }"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg
                class="eye-closed"
                :class="{ hidden: !isPasswordVisible }"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 第二行：模型选择下拉组件 -->
      <div class="form-row">
        <div class="form-group flex-1 model-select-group">
          <label for="model-name" title="指定要测试的模型 ID，支持手动输入或从下方下拉获取列表中选择">
            测试模型 (Model)
          </label>
          <ModelCombobox
            ref="comboboxRef"
            v-model:model-value="config.modelName"
            v-model:api-format="config.apiFormat"
            :base-url="config.baseUrl"
            :api-key="config.apiKey"
            :required="true"
          />
        </div>
      </div>

      <!-- 更多设置折叠区 -->
      <AdvancedSettings
        :is-open="isAdvancedOpen"
        :summary="settingsSummary"
        :api-format="config.apiFormat"
        :reasoning-effort="config.reasoningEffort"
        @update:is-open="(v) => emit('update:isAdvancedOpen', v)"
        @update:api-format="(v) => (config.apiFormat = v)"
        @update:reasoning-effort="(v) => (config.reasoningEffort = v)"
      />

      <!-- 操作按钮 -->
      <div class="form-actions">
        <button
          type="submit"
          class="btn btn-primary"
          id="btn-start"
          :disabled="isRunning"
          title="执行 3 轮探测，并在统一库中比对归因"
        >
          <span class="btn-spinner" :class="{ hidden: !isRunning }" id="start-spinner"></span>
          <span class="btn-text">开始测试 (共 3 题)</span>
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          id="btn-reset"
          title="清空已保存的 Base URL 与 Key 等本地配置"
          @click="handleReset"
        >
          重置
        </button>
      </div>
    </form>
  </section>
</template>

<style lang="scss" scoped>
.config-card {
  position: relative;
  z-index: 30;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 8px;

  h2 {
    font-size: 0.94rem;
    font-weight: 600;
    color: #fff;
  }

  .active-config-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
    padding: 1px 7px;
    border-radius: 9999px;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.3);
    color: #a5b4fc;
    font-weight: 500;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    .active-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #818cf8;
      box-shadow: 0 0 4px #818cf8;
      flex-shrink: 0;
    }
  }
}

.header-actions-group {
  display: flex;
  align-items: center;
  gap: 6px;

  .btn-header-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    font-size: 0.74rem;
    font-weight: 500;
    line-height: 1;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
    transition: all var(--transition-fast);
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);

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
      background: rgba(30, 41, 59, 0.9);
      border-color: rgba(99, 102, 241, 0.4);
      color: var(--text-primary);
    }

    &.btn-save-config {
      color: #93c5fd;
      background: rgba(59, 130, 246, 0.08);
      border-color: rgba(59, 130, 246, 0.22);

      &:hover {
        background: rgba(59, 130, 246, 0.18);
        border-color: rgba(59, 130, 246, 0.45);
        color: #bfdbfe;
      }
    }

    &.btn-config-list {
      color: #c7d2fe;
      background: rgba(99, 102, 241, 0.1);
      border-color: rgba(99, 102, 241, 0.25);

      &:hover {
        background: rgba(99, 102, 241, 0.2);
        border-color: rgba(99, 102, 241, 0.5);
        color: #e0e7ff;
      }

      .config-count-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.65rem;
        padding: 0 4px;
        min-width: 14px;
        height: 14px;
        line-height: 1;
        border-radius: 9999px;
        background: rgba(99, 102, 241, 0.35);
        color: #fff;
        font-weight: 600;
        margin-left: 1px;
      }
    }
  }
}


.config-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
</style>
