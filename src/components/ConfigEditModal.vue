<script setup lang="ts">
import { ref, reactive, watch, nextTick } from "vue";
import type { ConfigItem } from "../types";
import { REASONING_EFFORT_OPTIONS } from "../constants";

const props = defineProps<{
  isOpen: boolean;
  mode: "create" | "edit" | "save-current";
  initialData?: Partial<ConfigItem> | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (
    e: "save",
    data: Omit<ConfigItem, "id" | "createdAt" | "updatedAt">,
    id?: string,
    applyImmediately?: boolean
  ): void;
}>();

const nameInputRef = ref<HTMLInputElement | null>(null);
const isKeyVisible = ref(false);
const isAdvancedExpanded = ref(false);

const formData = reactive({
  name: "",
  baseUrl: "",
  apiKey: "",
  apiFormat: "chat_completions",
  modelName: "",
  reasoningEffort: "high",
});

function initForm(): void {
  isKeyVisible.value = false;
  if (props.initialData) {
    formData.name = props.initialData.name || "";
    formData.baseUrl = props.initialData.baseUrl || "";
    formData.apiKey = props.initialData.apiKey || "";
    formData.apiFormat = props.initialData.apiFormat || "chat_completions";
    formData.modelName = props.initialData.modelName || "";
    formData.reasoningEffort = props.initialData.reasoningEffort || "high";
    // 如果有设置过模型或非默认格式，自动展开高级设置
    if (formData.modelName || formData.apiFormat !== "chat_completions") {
      isAdvancedExpanded.value = true;
    } else {
      isAdvancedExpanded.value = false;
    }
  } else {
    formData.name = "";
    formData.baseUrl = "https://api.openai.com";
    formData.apiKey = "";
    formData.apiFormat = "chat_completions";
    formData.modelName = "";
    formData.reasoningEffort = "high";
    isAdvancedExpanded.value = false;
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      initForm();
      nextTick(() => {
        nameInputRef.value?.focus();
        nameInputRef.value?.select();
      });
    }
  },
  { immediate: true }
);

function handleSubmit(applyImmediately: boolean = false): void {
  const trimmedName = formData.name.trim();
  const trimmedBaseUrl = formData.baseUrl.trim();
  const trimmedApiKey = formData.apiKey.trim();

  if (!trimmedName) {
    alert("请输入配置名称！");
    nameInputRef.value?.focus();
    return;
  }

  emit(
    "save",
    {
      name: trimmedName,
      baseUrl: trimmedBaseUrl,
      apiKey: trimmedApiKey,
      apiFormat: formData.apiFormat,
      modelName: formData.modelName.trim(),
      reasoningEffort: formData.reasoningEffort,
    },
    props.mode === "edit" ? props.initialData?.id : undefined,
    applyImmediately
  );
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
      <div class="config-modal-dialog edit-dialog" role="dialog" aria-modal="true">
        <!-- 弹窗头部 -->
        <div class="modal-header">
          <div class="header-title-group">
            <div class="title-icon">
              <svg
                v-if="mode === 'edit'"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            </div>
            <div>
              <h3>
                {{
                  mode === "edit"
                    ? "编辑配置预设"
                    : mode === "save-current"
                    ? "保存当前配置"
                    : "添加新配置"
                }}
              </h3>
              <p class="header-subtitle">
                {{
                  mode === "save-current"
                    ? "为当前填写的接口参数指定一个名称，方便日后一键切换"
                    : mode === "edit"
                    ? "修改配置预设的名称与连接参数"
                    : "录入新的大模型 API 接口连接信息"
                }}
              </p>
            </div>
          </div>
          <button
            type="button"
            class="btn-close"
            title="关闭弹窗 (Esc)"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <!-- 弹窗表单 -->
        <form class="modal-body form-content" @submit.prevent="handleSubmit(false)">
          <!-- 配置名称 -->
          <div class="form-group">
            <label for="cfg-name">
              配置名称 <span class="required">*</span>
            </label>
            <div class="input-wrapper">
              <input
                ref="nameInputRef"
                type="text"
                id="cfg-name"
                v-model="formData.name"
                placeholder="例如：OpenAI 官方、DeepSeek、硅基流动、个人中转"
                required
                autocomplete="off"
                spellcheck="false"
              />
            </div>
          </div>

          <!-- Base URL 与 API Key -->
          <div class="form-row">
            <div class="form-group flex-1">
              <label for="cfg-base-url">
                Base URL <span class="required">*</span>
              </label>
              <div class="input-wrapper">
                <input
                  type="url"
                  id="cfg-base-url"
                  v-model="formData.baseUrl"
                  placeholder="https://api.openai.com"
                  required
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label for="cfg-api-key">
                API Key <span class="required">*</span>
              </label>
              <div class="input-wrapper">
                <input
                  :type="isKeyVisible ? 'text' : 'password'"
                  id="cfg-api-key"
                  v-model="formData.apiKey"
                  placeholder="sk-..."
                  required
                  autocomplete="off"
                  spellcheck="false"
                />
                <button
                  type="button"
                  class="btn-icon"
                  title="切换显示/隐藏 Key"
                  @click="isKeyVisible = !isKeyVisible"
                >
                  <svg
                    v-if="!isKeyVisible"
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
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
                    width="15"
                    height="15"
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

          <!-- 高级选项折叠切换 -->
          <div class="advanced-toggle-wrapper">
            <button
              type="button"
              class="btn-toggle-advanced"
              @click="isAdvancedExpanded = !isAdvancedExpanded"
            >
              <svg
                class="arrow-icon"
                :class="{ rotated: isAdvancedExpanded }"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>可选默认参数（测试模型 / 格式 / 思考强度）</span>
            </button>
          </div>

          <!-- 高级选项内容 -->
          <div v-if="isAdvancedExpanded" class="advanced-fields-box">
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="cfg-model-name">默认测试模型 (可选)</label>
                <input
                  type="text"
                  id="cfg-model-name"
                  v-model="formData.modelName"
                  placeholder="例如：gpt-4o, deepseek-chat..."
                  autocomplete="off"
                />
              </div>

              <div class="form-group flex-1">
                <label for="cfg-api-format">接口格式</label>
                <select id="cfg-api-format" v-model="formData.apiFormat" class="custom-select">
                  <option value="chat_completions">/v1/chat/completions (标准)</option>
                  <option value="responses">/v1/responses (OpenAI 原生)</option>
                  <option value="anthropic">/v1/messages (Claude 原生)</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label for="cfg-reasoning-effort">默认思考强度</label>
                <select id="cfg-reasoning-effort" v-model="formData.reasoningEffort" class="custom-select">
                  <option
                    v-for="opt in REASONING_EFFORT_OPTIONS"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.value }} - {{ opt.description }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- 弹窗底部操作栏 -->
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" @click="emit('close')">
              取消
            </button>
            <div class="footer-action-right">
              <button type="submit" class="btn btn-secondary">
                保存
              </button>
              <button
                type="button"
                class="btn btn-primary"
                @click="handleSubmit(true)"
                title="保存该配置并立即载入到主界面使用"
              >
                保存并立即使用
              </button>
            </div>
          </div>
        </form>
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
  z-index: 10000;
  padding: 16px;
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.config-modal-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75), 0 0 28px rgba(99, 102, 241, 0.2);
  animation: modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(18, 24, 38, 0.95);

  .header-title-group {
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

    h3 {
      font-size: 0.98rem;
      font-weight: 600;
      color: #fff;
      margin-bottom: 2px;
    }

    .header-subtitle {
      font-size: 0.75rem;
      color: var(--text-muted);
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

.modal-body {
  padding: 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.required {
  color: var(--danger);
}

.advanced-toggle-wrapper {
  margin-top: 2px;

  .btn-toggle-advanced {
    background: transparent;
    border: none;
    color: #818cf8;
    font-size: 0.76rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 0;
    transition: color var(--transition-fast);

    &:hover {
      color: #a5b4fc;
    }

    .arrow-icon {
      transition: transform var(--transition-fast);

      &.rotated {
        transform: rotate(180deg);
      }
    }
  }
}

.advanced-fields-box {
  background: rgba(11, 15, 23, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.custom-select {
  width: 100%;
  padding: 6px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.82rem;
  outline: none;
  font-family: inherit;
  transition: all var(--transition-fast);

  &:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--border-glow);
  }

  option {
    background: #111723;
    color: #f8fafc;
  }
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);

  .footer-action-right {
    display: flex;
    gap: 8px;
  }
}
</style>
