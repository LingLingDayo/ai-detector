<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from "vue";
import type { ConfigItem } from "../types";
import {
  findModelReasoningRule,
  getReasoningOptionsForModel,
  resolveValidReasoningEffort,
} from "../constants";
import { Pencil, Save, X, Eye, EyeOff, ChevronDown } from "@lucide/vue";
import CustomSelect, { type SelectOption } from "./common/CustomSelect.vue";
import ModelCombobox from "./ModelCombobox.vue";

const API_FORMAT_OPTIONS: SelectOption[] = [
  { value: "chat_completions", label: "/v1/chat/completions", description: "OpenAI" },
  { value: "responses", label: "/v1/responses", description: "OpenAI" },
  { value: "anthropic", label: "/v1/messages", description: "Anthropic" },
];

const STREAM_OPTIONS: SelectOption[] = [
  { value: "stream", label: "流式请求", description: "首包超时 90s" },
  { value: "sync", label: "同步请求", description: "全量超时 240s" },
];

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

const formRef = ref<HTMLFormElement | null>(null);
const nameInputRef = ref<HTMLInputElement | null>(null);
const modalComboboxRef = ref<InstanceType<typeof ModelCombobox> | null>(null);
const isKeyVisible = ref(false);
const isAdvancedExpanded = ref(false);

const formData = reactive({
  name: "",
  baseUrl: "",
  apiKey: "",
  apiFormat: "chat_completions",
  modelName: "",
  reasoningEffort: "high",
  stream: true,
});

const matchedRule = computed(() => findModelReasoningRule(formData.modelName));

const reasoningOptions = computed<SelectOption[]>(() => {
  return getReasoningOptionsForModel(formData.modelName).map((opt) => ({
    value: opt.value,
    label: opt.value,
    description: opt.isDefault ? `${opt.description} (默认)` : opt.description,
  }));
});

// 监听模型变动并限定思考强度
watch(
  () => formData.modelName,
  (newModel) => {
    const validEffort = resolveValidReasoningEffort(newModel, formData.reasoningEffort);
    if (validEffort !== formData.reasoningEffort) {
      formData.reasoningEffort = validEffort;
    }
  }
);

function initForm(): void {
  isKeyVisible.value = false;
  modalComboboxRef.value?.resetModelList();
  if (props.initialData) {
    formData.name = props.initialData.name || "";
    formData.baseUrl = props.initialData.baseUrl || "";
    formData.apiKey = props.initialData.apiKey || "";
    formData.apiFormat = props.initialData.apiFormat || "chat_completions";
    formData.modelName = props.initialData.modelName || "";
    formData.reasoningEffort = resolveValidReasoningEffort(
      props.initialData.modelName,
      props.initialData.reasoningEffort || "high"
    );
    formData.stream = props.initialData.stream !== false;
    // 如果有设置过模型、非默认格式或非默认传输方式，自动展开更多设置
    if (formData.modelName || formData.apiFormat !== "chat_completions" || !formData.stream) {
      isAdvancedExpanded.value = true;
    } else {
      isAdvancedExpanded.value = false;
    }
  } else {
    formData.name = "";
    formData.baseUrl = "";
    formData.apiKey = "";
    formData.apiFormat = "chat_completions";
    formData.modelName = "";
    formData.reasoningEffort = "high";
    formData.stream = true;
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
  if (formRef.value && !formRef.value.checkValidity()) {
    formRef.value.reportValidity();
    return;
  }

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
      stream: formData.stream,
    },
    props.mode === "edit" || (props.mode === "save-current" && props.initialData?.id)
      ? props.initialData?.id
      : undefined,
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
              <Pencil
                v-if="mode === 'edit'"
                :size="18"
              />
              <Save
                v-else
                :size="18"
              />
            </div>
            <div>
              <h3>
                {{
                  mode === "edit"
                    ? "编辑配置预设"
                    : mode === "save-current"
                    ? (initialData?.id ? "更新配置预设" : "保存当前配置")
                    : "添加新配置"
                }}
              </h3>
              <p class="header-subtitle">
                {{
                  mode === "save-current"
                    ? (initialData?.id ? "将当前修改后的参数更新至该配置预设" : "为当前填写的接口参数指定一个名称，方便日后一键切换")
                    : mode === "edit"
                    ? "修改配置预设的名称与连接参数"
                    : "录入新的模型 API 接口连接信息"
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
            <X :size="16" />
          </button>
        </div>

        <!-- 弹窗表单容器 -->
        <form
          ref="formRef"
          class="modal-form-wrapper"
          @submit.prevent="handleSubmit(false)"
        >
          <!-- 弹窗主体（可滚动区域） -->
          <div class="modal-body form-content">
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
                  @blur="modalComboboxRef?.triggerAutoFetch(true)"
                  @keydown.enter="modalComboboxRef?.triggerAutoFetch(true)"
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
                  @blur="modalComboboxRef?.triggerAutoFetch(true)"
                  @keydown.enter="modalComboboxRef?.triggerAutoFetch(true)"
                />
                <button
                  type="button"
                  class="btn-icon"
                  title="切换显示/隐藏 Key"
                  @click="isKeyVisible = !isKeyVisible"
                >
                  <Eye
                    v-if="!isKeyVisible"
                    :size="15"
                  />
                  <EyeOff
                    v-else
                    :size="15"
                  />
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
              <ChevronDown
                class="arrow-icon"
                :class="{ rotated: isAdvancedExpanded }"
                :size="14"
              />
              <span>更多设置</span>
            </button>
          </div>

          <!-- 高级选项内容 -->
          <div v-show="isAdvancedExpanded" class="advanced-fields-box">
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="cfg-model-name">默认模型</label>
                <ModelCombobox
                  id="cfg-model-name"
                  ref="modalComboboxRef"
                  v-model:model-value="formData.modelName"
                  v-model:api-format="formData.apiFormat"
                  v-model:reasoning-effort="formData.reasoningEffort"
                  :base-url="formData.baseUrl"
                  :api-key="formData.apiKey"
                  :required="false"
                  :auto-select-first="false"
                />
              </div>

              <div class="form-group flex-1">
                <label for="cfg-stream-mode">请求模式</label>
                <CustomSelect
                  id="cfg-stream-mode"
                  :model-value="formData.stream ? 'stream' : 'sync'"
                  :options="STREAM_OPTIONS"
                  @update:model-value="(val) => (formData.stream = val === 'stream')"
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label for="cfg-api-format">请求接口</label>
                <CustomSelect
                  id="cfg-api-format"
                  v-model="formData.apiFormat"
                  :options="API_FORMAT_OPTIONS"
                />
              </div>

              <div class="form-group flex-1">
                <div class="field-label-with-hint">
                  <label for="cfg-reasoning-effort">思考强度</label>
                  <span
                    v-if="matchedRule"
                    class="field-hint-tag"
                    :title="matchedRule.notes ? `${matchedRule.notes} (默认: ${matchedRule.defaultEffort})` : `默认: ${matchedRule.defaultEffort}`"
                  >
                    {{ matchedRule.model }} 限定 {{ reasoningOptions.length }} 档
                  </span>
                </div>
                <CustomSelect
                  id="cfg-reasoning-effort"
                  v-model="formData.reasoningEffort"
                  :options="reasoningOptions"
                />
              </div>
            </div>
          </div>

          </div>

          <!-- 弹窗底部操作栏（固定显示） -->
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
  flex-shrink: 0;

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
    cursor: pointer;
    width: 28px;
    height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);

    svg {
      display: block;
      flex-shrink: 0;
    }

    &:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
    }
  }
}

.modal-form-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.modal-body {
  padding: 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
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
    line-height: 1;
    transition: color var(--transition-fast);

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

  .field-label-with-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .field-hint-tag {
      font-size: 0.7rem;
      color: var(--text-muted);
    }
  }
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(18, 24, 38, 0.95);
  flex-shrink: 0;

  .footer-action-right {
    display: flex;
    gap: 8px;
  }
}
</style>
