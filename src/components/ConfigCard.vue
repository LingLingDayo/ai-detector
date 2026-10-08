<script setup lang="ts">
import { ref } from "vue";
import type { ClientConfig } from "../types";
import ModelCombobox from "./ModelCombobox.vue";
import AdvancedSettings from "./AdvancedSettings.vue";

const props = defineProps<{
  config: ClientConfig;
  isRunning: boolean;
  isPasswordVisible: boolean;
  isAdvancedOpen: boolean;
  saveTipText: string;
  isSaveTipActive: boolean;
  settingsSummary: string;
}>();

const emit = defineEmits<{
  (e: "toggle-password"): void;
  (e: "update:isAdvancedOpen", value: boolean): void;
  (e: "submit"): void;
  (e: "reset"): void;
}>();

const comboboxRef = ref<InstanceType<typeof ModelCombobox> | null>(null);

function handleReset(): void {
  emit("reset");
  comboboxRef.value?.resetModelList();
}
</script>

<template>
  <section class="card config-card">
    <div class="card-header">
      <h2>探测参数配置</h2>
      <span
        class="auto-save-tip"
        :class="{ saved: isSaveTipActive }"
        id="save-tip"
        title="输入内容会在本地实时自动持久化"
      >
        {{ saveTipText }}
      </span>
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
          title="执行 3 轮探测测试，并在统一库中比对归因"
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

.auto-save-tip {
  font-size: 0.7rem;
  color: var(--text-muted);
  transition: color var(--transition-fast);

  &.saved {
    color: var(--success);
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
