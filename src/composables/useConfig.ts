import { ref, reactive, computed, watch, type Ref, type ComputedRef } from "vue";
import { resolveValidReasoningEffort } from "../constants";
import type { ClientConfig, ConfigItem } from "../types";
import { useConfirm } from "./useConfirm";
import { useConfigModal } from "./useConfigModal";
import {
  generateConfigId,
  isSameConfigIdentity,
  isConfigEqual,
  formatSettingsSummary,
} from "../utils/configHelpers";
import {
  loadStoredConfigs,
  persistConfigList,
  persistCurrentConfig,
  clearCurrentConfigStorage,
  clearActiveConfigIdStorage,
  applyPersistedConfigToTarget,
} from "../utils/configStorage";

// 重新导出纯函数，确保外部引用的向后兼容性
export { isSameConfigIdentity, isConfigEqual };

export interface UseConfigOptions {
  activeMode?: Ref<"probe" | "pelican">;
  isRunning?: Ref<boolean>;
  isPelicanRunning?: Ref<boolean>;
  onApply?: (item: ConfigItem) => void;
}

export interface UseConfigReturn {
  config: ClientConfig;
  probeConfig: ClientConfig;
  pelicanConfig: ClientConfig;
  configList: Ref<ConfigItem[]>;
  activeConfigId: Ref<string | null>;
  activeConfig: ComputedRef<ConfigItem | undefined>;
  activeConfigName: ComputedRef<string>;
  configListCount: ComputedRef<number>;
  isPasswordVisible: Ref<boolean>;
  isAdvancedOpen: Ref<boolean>;
  isConfigListModalOpen: Ref<boolean>;
  isConfigEditModalOpen: Ref<boolean>;
  configEditModalMode: Ref<"create" | "edit" | "save-current">;
  editingConfigItem: Ref<ConfigItem | null>;
  settingsSummary: ComputedRef<string>;
  hasCurrentInput: ComputedRef<boolean>;
  isCurrentConfigSaved: ComputedRef<boolean>;
  canSaveCurrent: ComputedRef<boolean>;
  matchedConfigItem: ComputedRef<ConfigItem | undefined>;
  isConfigModified: ComputedRef<boolean>;
  togglePasswordVisibility: () => void;
  toggleAdvanced: () => void;
  openConfigListModal: () => void;
  closeConfigListModal: () => void;
  openSaveCurrentModal: () => void;
  openCreateConfigModal: () => void;
  openEditConfigModal: (item: ConfigItem) => void;
  closeConfigEditModal: () => void;
  updateCurrentConfig: () => boolean;
  saveConfig: () => void;
  loadConfig: () => void;
  resetConfig: () => Promise<boolean>;
  applyConfig: (item: ConfigItem) => void;
  handleSaveConfigItem: (
    data: Omit<ConfigItem, "id" | "createdAt" | "updatedAt">,
    id?: string,
    applyImmediately?: boolean
  ) => void;
  deleteConfigItem: (id: string) => Promise<boolean>;
  swapConfigItems: (sourceId: string, targetId: string) => void;
}

export function useConfig(options?: UseConfigOptions): UseConfigReturn {
  const { confirm } = useConfirm();
  const modal = useConfigModal();

  const activeModeRef = options?.activeMode || ref<"probe" | "pelican">("probe");
  const isRunningRef = options?.isRunning || ref(false);
  const isPelicanRunningRef = options?.isPelicanRunning || ref(false);

  const probeConfig = reactive<ClientConfig>({
    baseUrl: "",
    apiKey: "",
    apiFormat: "chat_completions",
    modelName: "",
    reasoningEffort: "high",
    stream: true,
  });

  const pelicanConfig = reactive<ClientConfig>({
    baseUrl: "",
    apiKey: "",
    apiFormat: "chat_completions",
    modelName: "",
    reasoningEffort: "high",
    stream: true,
  });

  const config = new Proxy({} as ClientConfig, {
    get(_, prop: string) {
      const activeObj = activeModeRef.value === "pelican" ? pelicanConfig : probeConfig;
      return (activeObj as any)[prop];
    },
    set(_, prop: string, value: any) {
      const activeObj = activeModeRef.value === "pelican" ? pelicanConfig : probeConfig;
      (activeObj as any)[prop] = value;
      return true;
    },
  });

  const configList = ref<ConfigItem[]>([]);
  const activeConfigId = ref<string | null>(null);
  const lastActiveConfigId = ref<string | null>(null);
  let isInitializing = true;

  const activeConfig = computed<ConfigItem | undefined>(() => {
    if (!activeConfigId.value) return undefined;
    const item = configList.value.find((c) => c.id === activeConfigId.value);
    if (!item) return undefined;

    const curBaseUrl = (config.baseUrl || "").trim();
    const curApiKey = (config.apiKey || "").trim();
    const itemBaseUrl = (item.baseUrl || "").trim();
    const itemApiKey = (item.apiKey || "").trim();

    // 当 Base URL 或 API Key 被修改后，当前不再处于该配置的生效状态
    if (curBaseUrl !== itemBaseUrl || curApiKey !== itemApiKey) {
      return undefined;
    }

    return item;
  });

  const activeConfigName = computed<string>(() => {
    return activeConfig.value?.name || "";
  });

  const configListCount = computed<number>(() => {
    return configList.value.length;
  });

  const hasCurrentInput = computed<boolean>(() => {
    return Boolean(config.baseUrl?.trim() && config.apiKey?.trim());
  });

  const isCurrentConfigSaved = computed<boolean>(() => {
    if (!config.baseUrl?.trim() || !config.apiKey?.trim()) return false;
    return configList.value.some((item) => isConfigEqual(config, item));
  });

  const matchedConfigItem = computed<ConfigItem | undefined>(() => {
    const curBaseUrl = (config.baseUrl || "").trim();
    const curApiKey = (config.apiKey || "").trim();
    if (!curBaseUrl || !curApiKey) return undefined;

    // 优先匹配当前活跃的配置项
    if (activeConfigId.value) {
      const activeItem = configList.value.find((item) => item.id === activeConfigId.value);
      if (
        activeItem &&
        isSameConfigIdentity(curBaseUrl, curApiKey, activeItem.baseUrl, activeItem.apiKey)
      ) {
        return activeItem;
      }
    }

    return configList.value.find((item) =>
      isSameConfigIdentity(curBaseUrl, curApiKey, item.baseUrl, item.apiKey)
    );
  });

  const isConfigModified = computed<boolean>(() => {
    if (!matchedConfigItem.value) return false;
    return !isConfigEqual(config, matchedConfigItem.value);
  });

  const canSaveCurrent = computed<boolean>(() => {
    return (
      Boolean(config.baseUrl?.trim() && config.apiKey?.trim()) &&
      !isCurrentConfigSaved.value
    );
  });

  const settingsSummary = computed(() => formatSettingsSummary(config));

  function saveConfigListToStorage(): void {
    persistConfigList(configList.value, activeConfigId.value);
  }

  function saveConfig(): void {
    if (isInitializing) return;
    const cur = activeModeRef.value === "pelican" ? pelicanConfig : probeConfig;
    persistCurrentConfig(cur);
  }

  function handleOpenSaveCurrentModal(): void {
    modal.openSaveCurrentModal({
      matchedItem: matchedConfigItem.value,
      activeConfigId: activeConfigId.value,
      activeConfigName: activeConfigName.value,
      config,
    });
  }

  function updateCurrentConfig(): boolean {
    const target = matchedConfigItem.value;
    if (!target) return false;

    const index = configList.value.findIndex((item) => item.id === target.id);
    if (index === -1) return false;

    const trimmedBaseUrl = (config.baseUrl || "").trim();
    const trimmedApiKey = (config.apiKey || "").trim();
    const trimmedModelName = (config.modelName || "").trim();

    config.baseUrl = trimmedBaseUrl;
    config.apiKey = trimmedApiKey;
    config.modelName = trimmedModelName;

    const now = Date.now();
    const updatedItem: ConfigItem = {
      ...configList.value[index],
      baseUrl: trimmedBaseUrl,
      apiKey: trimmedApiKey,
      apiFormat: config.apiFormat || "chat_completions",
      modelName: trimmedModelName,
      reasoningEffort: resolveValidReasoningEffort(
        trimmedModelName,
        config.reasoningEffort || "high"
      ),
      stream: config.stream !== false,
      updatedAt: now,
    };

    configList.value.splice(index, 1, updatedItem);
    activeConfigId.value = updatedItem.id;
    lastActiveConfigId.value = updatedItem.id;
    saveConfig();
    saveConfigListToStorage();
    return true;
  }

  function applyConfig(item: ConfigItem): void {
    const applyTo = (cfg: ClientConfig) => {
      cfg.baseUrl = item.baseUrl || "";
      cfg.apiKey = item.apiKey || "";
      cfg.modelName = item.modelName || "";
      if (item.apiFormat) {
        cfg.apiFormat = item.apiFormat;
      }
      const targetEffort = item.reasoningEffort || "high";
      cfg.reasoningEffort = resolveValidReasoningEffort(item.modelName, targetEffort);
      cfg.stream = item.stream !== false;
    };

    // 仅向当前未在运行的模式应用配置，避免破坏正在进行的测试
    if (!isRunningRef.value) {
      applyTo(probeConfig);
    }
    if (!isPelicanRunningRef.value) {
      applyTo(pelicanConfig);
    }

    activeConfigId.value = item.id;
    lastActiveConfigId.value = item.id;
    saveConfig();
    saveConfigListToStorage();
    options?.onApply?.(item);
  }

  function handleSaveConfigItem(
    data: Omit<ConfigItem, "id" | "createdAt" | "updatedAt">,
    id?: string,
    applyImmediately: boolean = false
  ): void {
    const now = Date.now();
    const sanitizedData = {
      ...data,
      reasoningEffort: resolveValidReasoningEffort(data.modelName, data.reasoningEffort),
    };

    if (id) {
      const index = configList.value.findIndex((item) => item.id === id);
      if (index !== -1) {
        const updatedItem: ConfigItem = {
          ...configList.value[index],
          ...sanitizedData,
          updatedAt: now,
        };
        configList.value.splice(index, 1, updatedItem);
        if (activeConfigId.value === id || applyImmediately) {
          applyConfig(updatedItem);
        }
      }
    } else {
      const newId = generateConfigId();
      const newItem: ConfigItem = {
        ...sanitizedData,
        id: newId,
        createdAt: now,
        updatedAt: now,
      };
      configList.value.push(newItem);
      if (applyImmediately) {
        applyConfig(newItem);
      } else if (modal.configEditModalMode.value === "save-current") {
        activeConfigId.value = newId;
        lastActiveConfigId.value = newId;
      }
    }
    saveConfigListToStorage();
    modal.closeConfigEditModal();
  }

  async function deleteConfigItem(id: string): Promise<boolean> {
    const target = configList.value.find((item) => item.id === id);
    const targetName = target?.name ? `「${target.name}」` : "该配置";
    const confirmed = await confirm({
      type: "danger",
      styleVariant: "spotlight",
      title: "确认删除配置预设？",
      message: `确定要删除配置预设 ${targetName} 吗？删除后将无法恢复。`,
      confirmText: "确认删除",
      cancelText: "取消",
    });

    if (!confirmed) {
      return false;
    }

    configList.value = configList.value.filter((item) => item.id !== id);
    if (activeConfigId.value === id) {
      activeConfigId.value = null;
    }
    if (lastActiveConfigId.value === id) {
      lastActiveConfigId.value = null;
    }
    saveConfigListToStorage();
    return true;
  }

  function swapConfigItems(sourceId: string, targetId: string): void {
    const sourceIdx = configList.value.findIndex((c) => c.id === sourceId);
    const targetIdx = configList.value.findIndex((c) => c.id === targetId);
    if (sourceIdx !== -1 && targetIdx !== -1 && sourceIdx !== targetIdx) {
      const nextList = [...configList.value];
      const temp = nextList[sourceIdx];
      nextList[sourceIdx] = nextList[targetIdx];
      nextList[targetIdx] = temp;
      configList.value = nextList;
      saveConfigListToStorage();
    }
  }

  function loadConfig(): void {
    try {
      const { configList: loadedList, activeConfigId: candidateActiveId, savedConfig } =
        loadStoredConfigs();

      configList.value = loadedList;
      activeConfigId.value = candidateActiveId;
      lastActiveConfigId.value = candidateActiveId;
      saveConfigListToStorage();

      applyPersistedConfigToTarget(savedConfig, probeConfig);
      applyPersistedConfigToTarget(savedConfig, pelicanConfig);
    } finally {
      isInitializing = false;
    }
  }

  async function resetConfig(): Promise<boolean> {
    const confirmed = await confirm({
      type: "warning",
      styleVariant: "spotlight",
      title: "确认重置探测配置？",
      message: "重置后将清空当前界面的 Base URL、API Key 与已选模型，已保存的配置预设不受影响。",
      confirmText: "确认重置",
      cancelText: "取消",
    });

    if (!confirmed) {
      return false;
    }

    clearCurrentConfigStorage();

    const resetOne = (cfg: ClientConfig) => {
      cfg.baseUrl = "";
      cfg.apiKey = "";
      cfg.modelName = "";
      cfg.apiFormat = "chat_completions";
      cfg.reasoningEffort = "high";
      cfg.stream = true;
    };

    if (!isRunningRef.value) resetOne(probeConfig);
    if (!isPelicanRunningRef.value) resetOne(pelicanConfig);

    activeConfigId.value = null;
    lastActiveConfigId.value = null;
    clearActiveConfigIdStorage();
    return true;
  }

  function checkAndSyncActiveConfigOnCredentialChange(): void {
    if (isInitializing) return;

    const curBaseUrl = (config.baseUrl || "").trim();
    const curApiKey = (config.apiKey || "").trim();

    // 1. 若当前凭据与当前激活配置依然匹配，保持当前激活状态
    if (activeConfigId.value) {
      const currentItem = configList.value.find((item) => item.id === activeConfigId.value);
      if (
        currentItem &&
        isSameConfigIdentity(curBaseUrl, curApiKey, currentItem.baseUrl, currentItem.apiKey)
      ) {
        return;
      }
    }

    // 2. 若凭据不匹配或当前无激活配置，尝试恢复或匹配已保存配置
    let targetItem: ConfigItem | undefined = undefined;

    // 优先尝试恢复最近激活过的配置（如用户输入额外字符后又删除改回）
    if (lastActiveConfigId.value) {
      const lastItem = configList.value.find((item) => item.id === lastActiveConfigId.value);
      if (
        lastItem &&
        isSameConfigIdentity(curBaseUrl, curApiKey, lastItem.baseUrl, lastItem.apiKey)
      ) {
        targetItem = lastItem;
      }
    }

    // 若非上一个激活项，在配置列表中按当前凭据寻找其他匹配项
    if (!targetItem && curBaseUrl && curApiKey) {
      targetItem = configList.value.find((item) =>
        isSameConfigIdentity(curBaseUrl, curApiKey, item.baseUrl, item.apiKey)
      );
    }

    const nextActiveId = targetItem ? targetItem.id : null;
    if (activeConfigId.value !== nextActiveId) {
      activeConfigId.value = nextActiveId;
      if (nextActiveId) {
        lastActiveConfigId.value = nextActiveId;
      }
      saveConfigListToStorage();
    }
  }

  // 监听模型变动，限定思考强度到指定支持档位
  watch(
    () => probeConfig.modelName,
    (newModel) => {
      const validEffort = resolveValidReasoningEffort(newModel, probeConfig.reasoningEffort);
      if (validEffort !== probeConfig.reasoningEffort) {
        probeConfig.reasoningEffort = validEffort;
      }
    }
  );

  watch(
    () => pelicanConfig.modelName,
    (newModel) => {
      const validEffort = resolveValidReasoningEffort(newModel, pelicanConfig.reasoningEffort);
      if (validEffort !== pelicanConfig.reasoningEffort) {
        pelicanConfig.reasoningEffort = validEffort;
      }
    }
  );

  // 在测试未运行时，Base URL 与 API Key 自动在双模式之间同步
  watch(
    () => [probeConfig.baseUrl, probeConfig.apiKey],
    ([newUrl, newKey]) => {
      if (activeModeRef.value === "probe" && !isPelicanRunningRef.value) {
        pelicanConfig.baseUrl = newUrl;
        pelicanConfig.apiKey = newKey;
      }
    }
  );

  watch(
    () => [pelicanConfig.baseUrl, pelicanConfig.apiKey],
    ([newUrl, newKey]) => {
      if (activeModeRef.value === "pelican" && !isRunningRef.value) {
        probeConfig.baseUrl = newUrl;
        probeConfig.apiKey = newKey;
      }
    }
  );

  // 监听 Base URL 与 API Key 变动，实时同步并恢复 active-config-tag 标记
  watch(
    [
      () => probeConfig.baseUrl,
      () => probeConfig.apiKey,
      () => pelicanConfig.baseUrl,
      () => pelicanConfig.apiKey,
    ],
    () => {
      checkAndSyncActiveConfigOnCredentialChange();
    }
  );

  // 当切换测试模式时，平滑顺延当前配置（除非目标测试正在进行中）
  watch(
    () => activeModeRef.value,
    (newMode, oldMode) => {
      if (!newMode || !oldMode || newMode === oldMode) return;
      const isTargetRunning = newMode === "pelican" ? isPelicanRunningRef.value : isRunningRef.value;
      if (!isTargetRunning) {
        const sourceConfig = oldMode === "pelican" ? pelicanConfig : probeConfig;
        const targetConfig = newMode === "pelican" ? pelicanConfig : probeConfig;
        targetConfig.baseUrl = sourceConfig.baseUrl;
        targetConfig.apiKey = sourceConfig.apiKey;
        targetConfig.apiFormat = sourceConfig.apiFormat;
        targetConfig.modelName = sourceConfig.modelName;
        targetConfig.reasoningEffort = sourceConfig.reasoningEffort;
        targetConfig.stream = sourceConfig.stream;
      }
    }
  );

  // 监听表单输入变化并自动持久化当前输入
  watch([probeConfig, pelicanConfig], () => {
    saveConfig();
  });

  return {
    config,
    probeConfig,
    pelicanConfig,
    configList,
    activeConfigId,
    activeConfig,
    activeConfigName,
    configListCount,
    isPasswordVisible: modal.isPasswordVisible,
    isAdvancedOpen: modal.isAdvancedOpen,
    isConfigListModalOpen: modal.isConfigListModalOpen,
    isConfigEditModalOpen: modal.isConfigEditModalOpen,
    configEditModalMode: modal.configEditModalMode,
    editingConfigItem: modal.editingConfigItem,
    settingsSummary,
    hasCurrentInput,
    isCurrentConfigSaved,
    canSaveCurrent,
    matchedConfigItem,
    isConfigModified,
    togglePasswordVisibility: modal.togglePasswordVisibility,
    toggleAdvanced: modal.toggleAdvanced,
    openConfigListModal: modal.openConfigListModal,
    closeConfigListModal: modal.closeConfigListModal,
    openSaveCurrentModal: handleOpenSaveCurrentModal,
    openCreateConfigModal: modal.openCreateConfigModal,
    openEditConfigModal: modal.openEditConfigModal,
    closeConfigEditModal: modal.closeConfigEditModal,
    updateCurrentConfig,
    saveConfig,
    loadConfig,
    resetConfig,
    applyConfig,
    handleSaveConfigItem,
    deleteConfigItem,
    swapConfigItems,
  };
}
