<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import type { ClientConfig } from "../types";
import { resolveValidReasoningEffort } from "../constants";
import ModelCombobox from "./ModelCombobox.vue";
import AdvancedSettings from "./AdvancedSettings.vue";

const props = withDefaults(
  defineProps<{
    config: ClientConfig;
    activeConfigName?: string;
    isRunning: boolean;
    isPelicanRunning?: boolean;
    activeMode?: "probe" | "pelican";
    hasResult?: boolean;
    isPasswordVisible: boolean;
    isAdvancedOpen: boolean;
    settingsSummary: string;
    isConfigModified?: boolean;
    isCurrentConfigSaved?: boolean;
    historyCount?: number;
  }>(),
  {
    isPelicanRunning: false,
    activeMode: "probe",
    hasResult: false,
    isConfigModified: false,
    isCurrentConfigSaved: false,
    historyCount: 0,
  }
);

const emit = defineEmits<{
  (e: "toggle-password"): void;
  (e: "update:isAdvancedOpen", value: boolean): void;
  (e: "update:activeMode", value: "probe" | "pelican"): void;
  (e: "submit"): void;
  (e: "cancel"): void;
  (e: "reset"): void;
  (e: "update-config"): void;
  (e: "open-save-config"): void;
  (e: "open-config-list"): void;
  (e: "open-history"): void;
}>();

const comboboxRef = ref<InstanceType<typeof ModelCombobox> | null>(null);

// 监听当前选定模型变更，自动将思考强度限定或修正到合法档位
watch(
  () => props.config.modelName,
  (newModel) => {
    const validEffort = resolveValidReasoningEffort(newModel, props.config.reasoningEffort);
    if (validEffort !== props.config.reasoningEffort) {
      props.config.reasoningEffort = validEffort;
    }
  }
);

const isCurrentRunning = computed(() => {
  return props.activeMode === "probe" ? props.isRunning : Boolean(props.isPelicanRunning);
});

const isOtherRunning = computed(() => {
  return props.activeMode === "probe" ? Boolean(props.isPelicanRunning) : props.isRunning;
});

function handleStartButtonClick(e: MouseEvent): void {
  if (isCurrentRunning.value) {
    e.preventDefault();
    emit("cancel");
  }
}

function handleReset(): void {
  emit("reset");
}

const isJustUpdated = ref(false);
let updatedTimer: number | null = null;

function handleSaveButtonClick(): void {
  if (isJustUpdated.value) return;

  if (props.isConfigModified) {
    emit("update-config");
    isJustUpdated.value = true;
    if (updatedTimer) {
      clearTimeout(updatedTimer);
    }
    updatedTimer = window.setTimeout(() => {
      isJustUpdated.value = false;
      updatedTimer = null;
    }, 1200);
  } else {
    emit("open-save-config");
  }
}

watch(
  () => [
    props.config.baseUrl,
    props.config.apiKey,
    props.config.modelName,
    props.config.apiFormat,
    props.config.reasoningEffort,
    props.config.stream,
  ],
  () => {
    if (isJustUpdated.value) {
      isJustUpdated.value = false;
      if (updatedTimer) {
        clearTimeout(updatedTimer);
        updatedTimer = null;
      }
    }
  }
);

onUnmounted(() => {
  if (updatedTimer) {
    clearTimeout(updatedTimer);
  }
});

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
          v-if="!isCurrentConfigSaved || isJustUpdated"
          type="button"
          class="btn-header-action btn-save-config"
          :class="{ 'btn-updated-success': isJustUpdated }"
          id="btn-save-config"
          :title="
            isJustUpdated
              ? '配置已成功更新'
              : isConfigModified
              ? '将修改后的参数直接更新到配置预设'
              : '将当前填写的接口参数与密钥保存为配置预设'
          "
          :disabled="isJustUpdated"
          @click="handleSaveButtonClick"
        >
          <svg
            v-if="isJustUpdated"
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg
            v-else
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
          <span>{{ isJustUpdated ? "已更新" : (isConfigModified ? "更新配置" : "保存配置") }}</span>
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
        </button>

        <button
          type="button"
          class="btn-header-action btn-history"
          id="btn-history"
          title="查看历史测试结果（鹈鹕测试、模型测试）"
          @click="emit('open-history')"
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
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>历史记录</span>
          <span v-if="historyCount && historyCount > 0" class="btn-count-dot">
            {{ historyCount }}
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
            测试模型
          </label>
          <ModelCombobox
            ref="comboboxRef"
            v-model:model-value="config.modelName"
            v-model:api-format="config.apiFormat"
            v-model:reasoning-effort="config.reasoningEffort"
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
        :model-name="config.modelName"
        :stream="config.stream"
        @update:is-open="(v) => emit('update:isAdvancedOpen', v)"
        @update:api-format="(v) => (config.apiFormat = v)"
        @update:reasoning-effort="(v) => (config.reasoningEffort = v)"
        @update:stream="(v) => (config.stream = v)"
      />

      <!-- 测试方式 Tab 选项 -->
      <div class="test-mode-tabs" role="tablist">
        <button
          type="button"
          class="tab-item"
          :class="{ active: activeMode === 'probe' }"
          :disabled="isRunning || isPelicanRunning"
          role="tab"
          :aria-selected="activeMode === 'probe'"
          title="三道随机题目探测，并在统一库中比对模型归因"
          @click="emit('update:activeMode', 'probe')"
        >
          <span>模型测试</span>
        </button>

        <button
          type="button"
          class="tab-item"
          :class="{ active: activeMode === 'pelican' }"
          :disabled="isRunning || isPelicanRunning"
          role="tab"
          :aria-selected="activeMode === 'pelican'"
          title="生成自行车鹈鹕 SVG 矢量图，直观测试模型是否降智"
          @click="emit('update:activeMode', 'pelican')"
        >
          <span>鹈鹕测试</span>
        </button>
      </div>

      <!-- 操作按钮 -->
      <div class="form-actions">
        <button
          :type="isCurrentRunning ? 'button' : 'submit'"
          class="btn btn-primary"
          :class="{ 'btn-cancel': isCurrentRunning }"
          id="btn-start"
          :disabled="isOtherRunning"
          :title="
            isCurrentRunning
              ? '点击取消当前正在进行的测试'
              : hasResult
              ? (activeMode === 'probe' ? '重新执行 3 轮探测并计算模型归因' : '重新发起鹈鹕测试，让 AI 重新绘制 SVG')
              : (activeMode === 'probe' ? '执行 3 轮探测，并在统一库中比对归因' : '发起鹈鹕测试，让 AI 绘制骑自行车 SVG')
          "
          @click="handleStartButtonClick"
        >
          <span
            class="btn-spinner"
            :class="{ hidden: !isCurrentRunning }"
            id="start-spinner"
          ></span>
          <span class="btn-text">
            {{
              isCurrentRunning
                ? '取消测试'
                : hasResult
                ? '重新生成'
                : (activeMode === 'probe' ? '开始测试 (共 3 题)' : '开始测试')
            }}
          </span>
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          id="btn-reset"
          :disabled="isRunning || isPelicanRunning"
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

      &:hover:not(:disabled) {
        background: rgba(59, 130, 246, 0.18);
        border-color: rgba(59, 130, 246, 0.45);
        color: #bfdbfe;
      }

      &.btn-updated-success {
        color: #34d399;
        background: rgba(16, 185, 129, 0.15);
        border-color: rgba(16, 185, 129, 0.35);
        cursor: default;
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
    }

    &.btn-history {
      color: #cbd5e1;
      background: rgba(148, 163, 184, 0.08);
      border-color: rgba(148, 163, 184, 0.2);

      &:hover {
        background: rgba(99, 102, 241, 0.18);
        border-color: rgba(99, 102, 241, 0.45);
        color: #e0e7ff;
      }

      .btn-count-dot {
        font-size: 0.65rem;
        padding: 0 4px;
        height: 14px;
        line-height: 14px;
        border-radius: 9999px;
        background: rgba(99, 102, 241, 0.35);
        color: #c7d2fe;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
    }
  }
}


.config-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.test-mode-tabs {
  display: flex;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 2px;
  gap: 3px;
  margin-top: 1px;

  .tab-item {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3.5px 8px;
    border-radius: calc(var(--radius-sm) - 2px);
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-secondary);
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.25;
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: inherit;

    &:hover:not(:disabled):not(.active) {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.04);
    }

    &.active {
      background: rgba(99, 102, 241, 0.2);
      border-color: rgba(99, 102, 241, 0.5);
      color: #ffffff;
      font-weight: 600;
      box-shadow: 0 1px 6px rgba(99, 102, 241, 0.2);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;

  .btn-cancel {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: #fff;
    box-shadow: 0 3px 12px rgba(239, 68, 68, 0.35);

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
      box-shadow: 0 5px 16px rgba(239, 68, 68, 0.5);
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }
  }
}
</style>
