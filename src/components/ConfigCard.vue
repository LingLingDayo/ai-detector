<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { ActiveTestMode, ClientConfig, ConnectionTestMode } from "../types";
import AdvancedSettings from "./AdvancedSettings.vue";
import ConfigCardHeader from "./config-card/ConfigCardHeader.vue";
import ConfigCredentialFields from "./config-card/ConfigCredentialFields.vue";
import ConfigModelFields from "./config-card/ConfigModelFields.vue";
import ConfigTestModeTabs from "./config-card/ConfigTestModeTabs.vue";
import ConfigFormActions from "./config-card/ConfigFormActions.vue";
import {
  useConfigStore,
  useAppStore,
  useProbeTestStore,
  usePelicanTestStore,
  useConnectionTestStore,
} from "../stores";
import { useClipboard } from "../composables/useClipboard";
import { useToast } from "../composables/useToast";
import { formatDurationMs } from "../utils/connectionMetrics";
import { getModelRoutingStatus } from "../utils/modelRouting";

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

const modelFieldsRef = ref<InstanceType<typeof ConfigModelFields> | null>(null);

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

const isCurrentRunning = computed(() => {
  if (currentActiveMode.value === "probe") return currentProbeRunning.value;
  if (currentActiveMode.value === "pelican") return Boolean(currentPelicanRunning.value);
  return Boolean(currentConnectionRunning.value);
});

const showCancelState = computed(() => {
  if (!isCurrentRunning.value) return false;
  return (
    currentActiveMode.value !== "connection" ||
    currentConnectionMode.value === "quick"
  );
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
    const responseTime = formatDurationMs(lastMessage.durationMs);
    if (
      getModelRoutingStatus(
        lastMessage.requestedModel,
        lastMessage.responseModel
      ) === "mismatch"
    ) {
      showToast({
        type: "warning",
        title: "测试成功，但模型不一致",
        message: `请求模型：${lastMessage.requestedModel || "—"}\n实际响应：${lastMessage.responseModel}\n响应时间：${responseTime}\n上游可能配置了模型映射。`,
        duration: 6000,
      });
      return;
    }
    showToast({
      type: "success",
      title: `测试成功 ${responseTime}`,
      duration: 3000,
    });
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

function handleCancelTest(): void {
  emit("cancel");
  appStore.handleCancelTest();
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

function handleFetchModels(): void {
  modelFieldsRef.value?.triggerAutoFetch(true);
}

async function handleReset(): Promise<void> {
  emit("reset");
  const confirmed = await configStore.resetConfig();
  if (confirmed) {
    modelFieldsRef.value?.resetModelList();
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
    modelFieldsRef.value?.resetModelList();
  },
});
</script>

<template>
  <section class="card config-card">
    <ConfigCardHeader
      :active-config-name="activeConfigNameDisplay"
      :is-current-config-saved="currentConfigSaved"
      :is-config-modified="currentConfigModified"
      :is-just-updated="isJustUpdated"
      :is-running="isCurrentRunning"
      @save="handleSaveButtonClick"
      @open-config-list="handleOpenConfigList"
      @open-history="handleOpenHistory"
    />

    <form id="test-form" class="config-form" @submit.prevent="handleFormSubmit">
      <ConfigCredentialFields
        v-model:base-url="activeConfig.baseUrl"
        v-model:api-key="activeConfig.apiKey"
        :password-visible="currentPasswordVisible"
        :disabled="isCurrentRunning"
        :key-copied="isKeyCopied"
        @copy-key="handleCopyKey"
        @toggle-password="handleTogglePassword"
        @fetch-models="handleFetchModels"
      />

      <ConfigModelFields
        ref="modelFieldsRef"
        v-model:model-name="activeConfig.modelName"
        v-model:api-format="activeConfig.apiFormat"
        v-model:reasoning-effort="activeConfig.reasoningEffort"
        :base-url="activeConfig.baseUrl"
        :api-key="activeConfig.apiKey"
        :disabled="isCurrentRunning"
      />

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
      <ConfigTestModeTabs
        :active-mode="currentActiveMode"
        :probe-running="Boolean(currentProbeRunning)"
        :pelican-running="Boolean(currentPelicanRunning)"
        :connection-running="Boolean(currentConnectionRunning)"
        @change="handleUpdateMode"
      />

      <!-- 操作按钮：三种测试模式彼此独立并发，当前模式不受另一模式阻塞 -->
      <ConfigFormActions
        :active-mode="currentActiveMode"
        :connection-mode="currentConnectionMode"
        :connection-running="Boolean(currentConnectionRunning)"
        :show-cancel-state="showCancelState"
        :has-result="currentHasResult"
        :reset-disabled="Boolean(currentProbeRunning || currentPelicanRunning || currentConnectionRunning)"
        @cancel="handleCancelTest"
        @update:connection-mode="handleConnectionModeChange"
        @reset="handleReset"
      />
    </form>
  </section>
</template>

<style lang="scss" scoped>
.config-card {
  position: relative;
  z-index: 30;
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
