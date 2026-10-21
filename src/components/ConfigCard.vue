<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import type { ActiveTestMode, ClientConfig, ConnectionTestMode } from "../types";
import { resolveValidReasoningEffort, getReasoningOptionsForModel } from "../constants";
import {
  Check,
  Save,
  List,
  History,
  Eye,
  EyeOff,
  Copy,
  MessagesSquare,
  Zap,
} from "@lucide/vue";
import ModelCombobox from "./ModelCombobox.vue";
import AdvancedSettings from "./AdvancedSettings.vue";
import { CustomSelect, type SelectOption } from "./common";
import {
  useConfigStore,
  useAppStore,
  useProbeTestStore,
  usePelicanTestStore,
  useConnectionTestStore,
} from "../stores";
import { useClipboard } from "../composables/useClipboard";
import { useToast } from "../composables/useToast";

const configStore = useConfigStore();
const appStore = useAppStore();
const probeStore = useProbeTestStore();
const pelicanStore = usePelicanTestStore();
const connectionStore = useConnectionTestStore();
const { showToast } = useToast();

const props = withDefaults(
  defineProps<{
    config?: ClientConfig;
    activeConfigName?: string;
    isRunning?: boolean;
    isPelicanRunning?: boolean;
    isConnectionRunning?: boolean;
    activeMode?: ActiveTestMode;
    hasResult?: boolean;
    isPasswordVisible?: boolean;
    isAdvancedOpen?: boolean;
    settingsSummary?: string;
    isConfigModified?: boolean;
    isCurrentConfigSaved?: boolean;
    historyCount?: number;
  }>(),
  {
    config: undefined,
    activeConfigName: undefined,
    isRunning: undefined,
    isPelicanRunning: undefined,
    isConnectionRunning: undefined,
    activeMode: undefined,
    hasResult: undefined,
    isPasswordVisible: undefined,
    isAdvancedOpen: undefined,
    settingsSummary: undefined,
    isConfigModified: undefined,
    isCurrentConfigSaved: undefined,
    historyCount: undefined,
  }
);

const emit = defineEmits<{
  (e: "toggle-password"): void;
  (e: "update:isAdvancedOpen", value: boolean): void;
  (e: "update:activeMode", value: ActiveTestMode): void;
  (e: "submit"): void;
  (e: "cancel"): void;
  (e: "reset"): void;
  (e: "update-config"): void;
  (e: "open-save-config"): void;
  (e: "open-config-list"): void;
  (e: "open-history"): void;
}>();

const comboboxRef = ref<InstanceType<typeof ModelCombobox> | null>(null);

// 统一数据接入层：外部传参优先，未传时自动使用 Store 单一事实来源
const activeConfig = computed(() => props.config ?? configStore.config);
const activeConfigNameDisplay = computed(() => props.activeConfigName ?? configStore.activeConfigName);
const currentProbeRunning = computed(() => props.isRunning ?? probeStore.isRunning);
const currentPelicanRunning = computed(() => props.isPelicanRunning ?? pelicanStore.isPelicanRunning);
const currentConnectionRunning = computed(
  () => props.isConnectionRunning ?? connectionStore.isConnectionRunning
);
const currentActiveMode = computed(() => props.activeMode ?? appStore.activeMode);
const currentHasResult = computed(() => props.hasResult ?? appStore.hasActiveResult);
const currentPasswordVisible = computed(() => props.isPasswordVisible ?? configStore.isPasswordVisible);
const currentAdvancedOpen = computed(() => props.isAdvancedOpen ?? configStore.isAdvancedOpen);
const currentSettingsSummary = computed(() => props.settingsSummary ?? configStore.settingsSummary);
const currentConfigModified = computed(() => props.isConfigModified ?? configStore.isConfigModified);
const currentConfigSaved = computed(() => props.isCurrentConfigSaved ?? configStore.isCurrentConfigSaved);
const currentConnectionMode = computed(() => connectionStore.connectionMode);

// 监听当前选定模型变更，自动将思考强度限定或修正到合法档位
watch(
  () => activeConfig.value.modelName,
  (newModel) => {
    const validEffort = resolveValidReasoningEffort(newModel, activeConfig.value.reasoningEffort);
    if (validEffort !== activeConfig.value.reasoningEffort) {
      activeConfig.value.reasoningEffort = validEffort;
    }
  }
);

const reasoningOptions = computed<SelectOption[]>(() => {
  return getReasoningOptionsForModel(activeConfig.value.modelName).map((opt) => ({
    value: opt.value,
    label: opt.value,
    description: opt.isDefault ? `${opt.description} (默认)` : opt.description,
  }));
});

const isCurrentRunning = computed(() => {
  if (currentActiveMode.value === "probe") return currentProbeRunning.value;
  if (currentActiveMode.value === "pelican") return Boolean(currentPelicanRunning.value);
  return Boolean(currentConnectionRunning.value);
});

const isOtherRunning = computed(() => {
  if (currentActiveMode.value === "probe") {
    return Boolean(currentPelicanRunning.value) || Boolean(currentConnectionRunning.value);
  }
  if (currentActiveMode.value === "pelican") {
    return currentProbeRunning.value || Boolean(currentConnectionRunning.value);
  }
  return currentProbeRunning.value || Boolean(currentPelicanRunning.value);
});

const showCancelState = computed(() => {
  if (!isCurrentRunning.value) return false;
  return (
    currentActiveMode.value !== "connection" ||
    currentConnectionMode.value === "quick"
  );
});

const startButtonLabel = computed(() => {
  if (currentActiveMode.value === "connection") {
    if (currentConnectionMode.value === "quick") {
      return showCancelState.value ? "取消测试" : "开始测试";
    }
    return currentHasResult.value ? "继续对话" : "开始对话";
  }
  return showCancelState.value
    ? "取消测试"
    : currentHasResult.value
    ? "重新生成"
    : "开始测试";
});

const connectionQuickTestReady = computed(() => {
  const config = activeConfig.value;
  return Boolean(
    config.baseUrl?.trim() && config.apiKey?.trim() && config.modelName?.trim()
  );
});

function focusConnectionComposer(): void {
  document
    .getElementById("connection-section")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
  connectionStore.requestComposerFocus();
}

async function startConnectionQuickTest(): Promise<void> {
  if (currentConnectionRunning.value) return;
  if (!connectionQuickTestReady.value) {
    showToast({
      type: "error",
      title: "测试失败",
      message: "请先填写 Base URL、API Key 并选择测试模型",
      duration: 6000,
    });
    return;
  }

  connectionStore.clearConnectionContext();
  await connectionStore.sendConnectionMessage(
    { text: "Hi", images: [] },
    activeConfig.value,
    activeConfigNameDisplay.value
  );

  const lastMessage = connectionStore.messages[connectionStore.messages.length - 1];
  if (lastMessage?.role === "assistant" && lastMessage.error) {
    showToast({
      type: "error",
      title: "测试失败",
      message: lastMessage.error,
      duration: 6000,
    });
    return;
  }
  if (lastMessage?.role === "assistant" && lastMessage.stopped) {
    showToast({
      type: "warning",
      title: "测试已取消",
      message: "已停止本次快速测试",
      duration: 3000,
    });
    return;
  }
  if (lastMessage?.role === "assistant") {
    showToast({ type: "success", title: "测试成功", duration: 3000 });
    return;
  }
  showToast({
    type: "error",
    title: "测试失败",
    message: connectionStore.errorMsg || "请求未返回结果",
    duration: 6000,
  });
}

function handleConnectionModeChange(mode: ConnectionTestMode): void {
  if (currentConnectionRunning.value) return;
  connectionStore.setConnectionMode(mode);
}

function handleStartButtonClick(e: MouseEvent): void {
  if (showCancelState.value) {
    e.preventDefault();
    emit("cancel");
    appStore.handleCancelTest();
  }
}

function handleFormSubmit(): void {
  emit("submit");
  if (currentActiveMode.value === "connection") {
    if (currentConnectionMode.value === "quick") {
      void startConnectionQuickTest();
    } else {
      focusConnectionComposer();
    }
    return;
  }
  appStore.handleStartTest();
}

async function handleReset(): Promise<void> {
  emit("reset");
  const confirmed = await configStore.resetConfig();
  if (confirmed) {
    comboboxRef.value?.resetModelList();
  }
}

const { copied: isKeyCopied, copy: copyKey } = useClipboard();

function handleCopyKey(): void {
  const key = activeConfig.value.apiKey;
  if (!key) return;
  copyKey(key);
}

function handleTogglePassword(): void {
  emit("toggle-password");
  configStore.togglePasswordVisibility();
}

function handleUpdateAdvanced(val: boolean): void {
  emit("update:isAdvancedOpen", val);
  configStore.isAdvancedOpen = val;
}

function handleUpdateMode(mode: ActiveTestMode): void {
  emit("update:activeMode", mode);
  appStore.setActiveMode(mode);
}

function handleOpenConfigList(): void {
  emit("open-config-list");
  configStore.openConfigListModal();
}

function handleOpenHistory(): void {
  emit("open-history");
  appStore.openHistoryModal();
}

const isJustUpdated = ref(false);
let updatedTimer: number | null = null;

function handleSaveButtonClick(): void {
  if (isJustUpdated.value) return;

  if (currentConfigModified.value) {
    const success = configStore.updateCurrentConfig();
    if (success) {
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
      configStore.openSaveCurrentModal();
    }
  } else {
    emit("open-save-config");
    configStore.openSaveCurrentModal();
  }
}

watch(
  () => [
    activeConfig.value.baseUrl,
    activeConfig.value.apiKey,
    activeConfig.value.modelName,
    activeConfig.value.apiFormat,
    activeConfig.value.reasoningEffort,
    activeConfig.value.stream,
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
          v-if="activeConfigNameDisplay"
          class="active-config-tag"
          :title="`当前应用配置：${activeConfigNameDisplay}`"
        >
          <span class="active-dot"></span>
          {{ activeConfigNameDisplay }}
        </span>
      </div>

      <div class="header-actions-group">
        <button
          v-if="!currentConfigSaved || isJustUpdated"
          type="button"
          class="btn-header-action btn-save-config"
          :class="{ 'btn-updated-success': isJustUpdated }"
          id="btn-save-config"
          :title="
            isJustUpdated
              ? '配置已成功更新'
              : currentConfigModified
              ? '将修改后的参数直接更新到配置预设'
              : '将当前填写的接口参数与密钥保存为配置预设'
          "
          :disabled="isCurrentRunning || isJustUpdated"
          @click="handleSaveButtonClick"
        >
          <Check
            v-if="isJustUpdated"
            :size="13"
            :stroke-width="2.5"
          />
          <Save
            v-else
            :size="13"
          />
          <span>{{ isJustUpdated ? "已更新" : (currentConfigModified ? "更新配置" : "保存配置") }}</span>
        </button>

        <button
          type="button"
          class="btn-header-action btn-config-list"
          id="btn-config-list"
          title="管理与切换已保存的配置预设列表"
          @click="handleOpenConfigList"
        >
          <List :size="13" />
          <span>配置列表</span>
        </button>

        <button
          type="button"
          class="btn-header-action btn-history"
          id="btn-history"
          title="查看历史测试结果（模型测试、鹈鹕测试、连接测试）"
          @click="handleOpenHistory"
        >
          <History :size="13" />
          <span>历史记录</span>
        </button>
      </div>
    </div>

    <form id="test-form" class="config-form" @submit.prevent="handleFormSubmit">
      <!-- 第一行：Base URL 与 API Key -->
      <div class="form-row">
        <div class="form-group flex-1">
          <label for="base-url" title="API 根域名或网关地址，支持反代与中转地址">Base URL</label>
          <div class="input-wrapper">
            <input
              type="url"
              id="base-url"
              v-model="activeConfig.baseUrl"
              :disabled="isCurrentRunning"
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
          <div class="input-wrapper has-key-actions">
            <input
              :type="currentPasswordVisible ? 'text' : 'password'"
              id="api-key"
              v-model="activeConfig.apiKey"
              :disabled="isCurrentRunning"
              placeholder="sk-..."
              required
              autocomplete="off"
              spellcheck="false"
              title="API Key 访问凭据，仅存储在本地 localStorage"
              @blur="comboboxRef?.triggerAutoFetch(true)"
              @keydown.enter="comboboxRef?.triggerAutoFetch(true)"
            />
            <div class="key-actions">
              <button
                type="button"
                class="btn-icon"
                id="copy-key"
                :title="isKeyCopied ? '已复制 Key' : '复制 API Key'"
                :disabled="!activeConfig.apiKey"
                @click="handleCopyKey"
              >
                <Check
                  v-if="isKeyCopied"
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
                @click="handleTogglePassword"
              >
                <Eye
                  class="eye-open"
                  :class="{ hidden: currentPasswordVisible }"
                  :size="16"
                />
                <EyeOff
                  class="eye-closed"
                  :class="{ hidden: !currentPasswordVisible }"
                  :size="16"
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 第二行：模型选择与思考强度下拉组件 -->
      <div class="form-row">
        <div class="form-group flex-1 model-select-group">
          <label for="model-name" title="指定要测试的模型 ID，支持手动输入或从下方下拉获取列表中选择">
            测试模型
          </label>
          <ModelCombobox
            ref="comboboxRef"
            v-model:model-value="activeConfig.modelName"
            v-model:api-format="activeConfig.apiFormat"
            v-model:reasoning-effort="activeConfig.reasoningEffort"
            :base-url="activeConfig.baseUrl"
            :api-key="activeConfig.apiKey"
            :disabled="isCurrentRunning"
            :required="true"
          />
        </div>

        <div class="form-group reasoning-select-group">
          <label for="reasoning-effort" title="配置模型的深度思考与推理强度">
            思考强度
          </label>
          <CustomSelect
            id="reasoning-effort"
            v-model="activeConfig.reasoningEffort"
            :options="reasoningOptions"
            :disabled="isCurrentRunning"
          />
        </div>
      </div>

      <!-- 更多设置折叠区 -->
      <AdvancedSettings
        :is-open="currentAdvancedOpen"
        :summary="currentSettingsSummary"
        :api-format="activeConfig.apiFormat"
        :stream="activeConfig.stream"
        :disabled="isCurrentRunning"
        @update:is-open="handleUpdateAdvanced"
        @update:api-format="(v) => (activeConfig.apiFormat = v)"
        @update:stream="(v) => (activeConfig.stream = v)"
      />

      <!-- 测试方式 Tab 选项：支持随时自由切换，并显示正在进行的测试指示灯 -->
      <div class="test-mode-tabs" role="tablist">
        <button
          type="button"
          class="tab-item"
          :class="{ active: currentActiveMode === 'probe', 'is-running': currentProbeRunning }"
          role="tab"
          :aria-selected="currentActiveMode === 'probe'"
          title="三道随机题目探测，并在统一库中比对模型归因（仅匹配候选库内已收录模型，未收录模型仍会被归到最相似的现有候选）"
          @click="handleUpdateMode('probe')"
        >
          <span>模型测试</span>
          <span v-if="currentProbeRunning" class="tab-running-dot" title="模型测试进行中"></span>
        </button>

        <button
          type="button"
          class="tab-item"
          :class="{ active: currentActiveMode === 'pelican', 'is-running': currentPelicanRunning }"
          role="tab"
          :aria-selected="currentActiveMode === 'pelican'"
          title="生成自行车鹈鹕 SVG 矢量图，直观测试模型是否降智"
          @click="handleUpdateMode('pelican')"
        >
          <span>鹈鹕测试</span>
          <span v-if="currentPelicanRunning" class="tab-running-dot" title="鹈鹕测试进行中"></span>
        </button>

        <button
          type="button"
          class="tab-item"
          :class="{ active: currentActiveMode === 'connection', 'is-running': currentConnectionRunning }"
          role="tab"
          :aria-selected="currentActiveMode === 'connection'"
          title="多轮自由对话，支持图片输入，并实时核对上游实际响应模型"
          @click="handleUpdateMode('connection')"
        >
          <span>连接测试</span>
          <span v-if="currentConnectionRunning" class="tab-running-dot" title="连接测试进行中"></span>
        </button>
      </div>

      <!-- 操作按钮：三种测试模式彼此独立并发，当前模式不受另一模式阻塞 -->
      <div class="form-actions">
        <button
          :type="showCancelState ? 'button' : 'submit'"
          class="btn btn-primary"
          :class="{ 'btn-cancel': showCancelState }"
          id="btn-start"
          :title="
            currentActiveMode === 'connection'
              ? (showCancelState
                  ? '点击取消当前正在进行的测试'
                  : currentConnectionMode === 'quick'
                  ? '清空当前上下文并发送 Hi 进行快速测试'
                  : '滚动到下方对话框并聚焦输入框')
              : showCancelState
              ? '点击取消当前正在进行的测试'
              : currentHasResult
              ? (currentActiveMode === 'probe' ? '重新执行 3 轮探测并计算模型归因' : '重新发起鹈鹕测试，让 AI 重新绘制 SVG')
              : (currentActiveMode === 'probe' ? '执行 3 轮探测，并在统一库中比对归因' : '发起鹈鹕测试，让 AI 绘制骑自行车 SVG')
          "
          @click="handleStartButtonClick"
        >
          <span
            class="btn-spinner"
            :class="{ hidden: !showCancelState }"
            id="start-spinner"
          ></span>
          <span class="btn-text">{{ startButtonLabel }}</span>
        </button>

        <div
          v-if="currentActiveMode === 'connection'"
          class="connection-mode-switch"
          role="group"
          aria-label="连接测试模式"
        >
          <button
            type="button"
            class="mode-switch-item"
            :class="{ active: currentConnectionMode === 'chat' }"
            :aria-pressed="currentConnectionMode === 'chat'"
            :disabled="currentConnectionRunning"
            title="完整多轮对话，展示回复、图片与统计"
            @click="handleConnectionModeChange('chat')"
          >
            <MessagesSquare :size="12" />
            <span>对话模式</span>
          </button>
          <button
            type="button"
            class="mode-switch-item"
            :class="{ active: currentConnectionMode === 'quick' }"
            :aria-pressed="currentConnectionMode === 'quick'"
            :disabled="currentConnectionRunning"
            title="清空上下文并发送 Hi，仅通过顶部提示反馈结果"
            @click="handleConnectionModeChange('quick')"
          >
            <Zap :size="12" />
            <span>精简模式</span>
          </button>
        </div>

        <button
          type="button"
          class="btn btn-ghost"
          id="btn-reset"
          :disabled="currentProbeRunning || currentPelicanRunning || currentConnectionRunning"
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

  .model-select-group {
    min-width: 0;
  }

  .reasoning-select-group {
    flex: 0 0 210px;
    width: 210px;

    @media (max-width: 600px) {
      flex: 1 1 auto;
      width: 100%;
    }
  }
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

    .tab-running-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--accent-primary, #6366f1);
      margin-left: 6px;
      box-shadow: 0 0 8px rgba(99, 102, 241, 0.85);
      animation: pulse-dot 1.4s infinite ease-in-out;
      flex-shrink: 0;
    }
  }
}

@keyframes pulse-dot {
  0%, 100% {
    transform: scale(0.9);
    opacity: 0.7;
    box-shadow: 0 0 4px rgba(99, 102, 241, 0.6);
  }
  50% {
    transform: scale(1.35);
    opacity: 1;
    box-shadow: 0 0 10px rgba(99, 102, 241, 1);
  }
}

.form-actions {
  display: flex;
  align-items: center;
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

.connection-mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 30px;
  flex-shrink: 0;
  padding: 1px;
  border-radius: var(--radius-sm);
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid var(--border-subtle);
}

.mode-switch-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    flex-shrink: 0;
  }

  &:hover:not(:disabled) {
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.045);
  }

  &.active {
    color: #c7d2fe;
    background: rgba(99, 102, 241, 0.16);
    border-color: rgba(99, 102, 241, 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
