<script setup lang="ts">
import { Check, Copy, Eye, EyeOff } from "@lucide/vue";

defineProps<{
  baseUrl: string;
  apiKey: string;
  passwordVisible: boolean;
  disabled: boolean;
  keyCopied: boolean;
}>();

const emit = defineEmits<{
  (e: "update:baseUrl", value: string): void;
  (e: "update:apiKey", value: string): void;
  (e: "copy-key"): void;
  (e: "toggle-password"): void;
  (e: "fetch-models"): void;
}>();

function handleBaseUrlInput(event: Event): void {
  emit("update:baseUrl", (event.target as HTMLInputElement).value);
}

function handleApiKeyInput(event: Event): void {
  emit("update:apiKey", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="form-row">
    <div class="form-group flex-1">
      <label for="base-url" title="API 根域名或网关地址，支持反代与中转地址">Base URL</label>
      <div class="input-wrapper">
        <input
          type="url"
          id="base-url"
          :value="baseUrl"
          :disabled="disabled"
          placeholder="https://api.openai.com"
          required
          autocomplete="off"
          spellcheck="false"
          title="API 接口根路径，例如 https://api.openai.com 或中转域名"
          @input="handleBaseUrlInput"
          @blur="emit('fetch-models')"
          @keydown.enter="emit('fetch-models')"
        />
      </div>
    </div>

    <div class="form-group flex-1">
      <label for="api-key" title="用于鉴权的 API 密钥，仅保存在本电脑本地">API Key</label>
      <div class="input-wrapper has-key-actions">
        <input
          :type="passwordVisible ? 'text' : 'password'"
          id="api-key"
          :value="apiKey"
          :disabled="disabled"
          placeholder="sk-..."
          required
          autocomplete="off"
          spellcheck="false"
          title="API Key 访问凭据，仅存储在本地 localStorage"
          @input="handleApiKeyInput"
          @blur="emit('fetch-models')"
          @keydown.enter="emit('fetch-models')"
        />
        <div class="key-actions">
          <button
            type="button"
            class="btn-icon"
            id="copy-key"
            :title="keyCopied ? '已复制 Key' : '复制 API Key'"
            :disabled="!apiKey"
            @click="emit('copy-key')"
          >
            <Check
              v-if="keyCopied"
              class="icon-success"
              :size="15"
            />
            <Copy
              v-else
              :size="15"
            />
          </button>
          <button
            type="button"
            class="btn-icon"
            id="toggle-key-visibility"
            title="切换显示/隐藏 Key"
            @click="emit('toggle-password')"
          >
            <Eye
              class="eye-open"
              :class="{ hidden: passwordVisible }"
              :size="16"
            />
            <EyeOff
              class="eye-closed"
              :class="{ hidden: !passwordVisible }"
              :size="16"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
