import { defineStore } from "pinia";
import { ref, reactive, computed, watch } from "vue";
import {
  STORAGE_KEY,
  CONFIG_LIST_STORAGE_KEY,
  ACTIVE_CONFIG_ID_KEY,
  resolveValidReasoningEffort,
} from "../constants";
import type { ActiveTestMode, ClientConfig, ConfigItem } from "../types";
import { useConfirm } from "../composables/useConfirm";
import {
  generateConfigId,
  isSameConfigIdentity,
  isConfigEqual,
} from "../utils/configHelpers";

import { useProbeTestStore } from "./probeTest";
import { usePelicanTestStore } from "./pelicanTest";
import { useConnectionTestStore } from "./connectionTest";

export { isSameConfigIdentity, isConfigEqual };

export const useConfigStore = defineStore("config", () => {
  const { confirm } = useConfirm();

  // 当前测试模式：probe（模型测试）、pelican（鹈鹕测试）或 connection（连接测试）
  const activeMode = ref<ActiveTestMode>("probe");

  function isTestRunning(mode: ActiveTestMode): boolean {
    try {
      if (mode === "probe") {
        return Boolean(useProbeTestStore().isRunning);
      }
      if (mode === "pelican") {
        return Boolean(usePelicanTestStore().isPelicanRunning);
      }
      return Boolean(useConnectionTestStore().isConnectionRunning);
    } catch {
      return false;
    }
  }

  function copyConfig(source: ClientConfig, target: ClientConfig): void {
    target.baseUrl = source.baseUrl;
    target.apiKey = source.apiKey;
    target.apiFormat = source.apiFormat;
    target.modelName = source.modelName;
    target.reasoningEffort = source.reasoningEffort;
    target.stream = source.stream;
  }

  function syncConfigOnModeSwitch(fromMode: ActiveTestMode, toMode: ActiveTestMode): void {
    if (fromMode === toMode) return;
    // 除非切换后的那个测试正在进行，否则任何时候切换测试类型都应该平滑顺延当前配置
    if (!isTestRunning(toMode)) {
      copyConfig(getModeConfig(fromMode), getModeConfig(toMode));
    }
  }

  function setActiveMode(mode: ActiveTestMode): void {
    if (activeMode.value === mode) return;
    const previousMode = activeMode.value;
    syncConfigOnModeSwitch(previousMode, mode);
    activeMode.value = mode;
    saveConfig();
  }

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

  const connectionConfig = reactive<ClientConfig>({
    baseUrl: "",
    apiKey: "",
    apiFormat: "chat_completions",
    modelName: "",
    reasoningEffort: "high",
    stream: true,
  });

  function getModeConfig(mode: ActiveTestMode): ClientConfig {
    if (mode === "pelican") return pelicanConfig;
    if (mode === "connection") return connectionConfig;
    return probeConfig;
  }

  const modeConfigEntries: Array<[ActiveTestMode, ClientConfig]> = [
    ["probe", probeConfig],
    ["pelican", pelicanConfig],
    ["connection", connectionConfig],
  ];

  // 根据当前激活模式，提供统一的动态代理对象
  const config = new Proxy({} as ClientConfig, {
    get(_, prop: string) {
      const activeObj = getModeConfig(activeMode.value);
      return (activeObj as any)[prop];
    },
    set(_, prop: string, value: any) {
      const activeObj = getModeConfig(activeMode.value);
      (activeObj as any)[prop] = value;
      return true;
    },
  });

  const configList = ref<ConfigItem[]>([]);
  const activeConfigId = ref<string | null>(null);
  const lastActiveConfigId = ref<string | null>(null);

  const isPasswordVisible = ref(false);
  const isAdvancedOpen = ref(false);
  const isConfigListModalOpen = ref(false);
  const isConfigEditModalOpen = ref(false);
  const configEditModalMode = ref<"create" | "edit" | "save-current">("save-current");
  const editingConfigItem = ref<ConfigItem | null>(null);

  let isInitializing = true;

  const activeConfig = computed<ConfigItem | undefined>(() => {
    if (!activeConfigId.value) return undefined;
    const item = configList.value.find((item) => item.id === activeConfigId.value);
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

  const settingsSummary = computed(() => {
    let formatName = "/v1/chat/completions";
    if (config.apiFormat === "responses") {
      formatName = "/v1/responses";
    } else if (config.apiFormat === "anthropic") {
      formatName = "/v1/messages";
    }

    const streamLabel = config.stream !== false ? "流式请求" : "同步请求";

    return `${formatName} · ${streamLabel}`;
  });

  function togglePasswordVisibility(): void {
    isPasswordVisible.value = !isPasswordVisible.value;
  }

  function toggleAdvanced(): void {
    isAdvancedOpen.value = !isAdvancedOpen.value;
  }

  function openConfigListModal(): void {
    isConfigListModalOpen.value = true;
  }

  function closeConfigListModal(): void {
    isConfigListModalOpen.value = false;
  }

  function openSaveCurrentModal(): void {
    const matched = matchedConfigItem.value;
    configEditModalMode.value = "save-current";
    editingConfigItem.value = {
      id: activeConfigId.value ? (matched?.id || "") : "",
      name: activeConfigId.value ? (matched?.name || activeConfigName.value || "") : "",
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      apiFormat: config.apiFormat,
      modelName: config.modelName,
      reasoningEffort: config.reasoningEffort,
      stream: config.stream !== false,
    };
    isConfigEditModalOpen.value = true;
  }

  function openCreateConfigModal(): void {
    configEditModalMode.value = "create";
    editingConfigItem.value = null;
    isConfigEditModalOpen.value = true;
  }

  function openEditConfigModal(item: ConfigItem): void {
    configEditModalMode.value = "edit";
    editingConfigItem.value = { ...item };
    isConfigEditModalOpen.value = true;
  }

  function closeConfigEditModal(): void {
    isConfigEditModalOpen.value = false;
    editingConfigItem.value = null;
  }

  function saveConfigListToStorage(): void {
    try {
      localStorage.setItem(CONFIG_LIST_STORAGE_KEY, JSON.stringify(configList.value));
      if (activeConfigId.value) {
        localStorage.setItem(ACTIVE_CONFIG_ID_KEY, activeConfigId.value);
      } else {
        localStorage.removeItem(ACTIVE_CONFIG_ID_KEY);
      }
    } catch (err) {
      console.warn("保存配置列表到本地存储失败:", err);
    }
  }

  function saveConfig(): void {
    if (isInitializing) return;
    try {
      const cur = getModeConfig(activeMode.value);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
    } catch (err) {
      console.warn("保存当前配置失败:", err);
    }
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

  function applyConfig(item: ConfigItem, onApply?: (item: ConfigItem) => void): void {
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

    for (const [mode, targetConfig] of modeConfigEntries) {
      if (!isTestRunning(mode)) {
        applyTo(targetConfig);
      }
    }

    activeConfigId.value = item.id;
    lastActiveConfigId.value = item.id;
    saveConfig();
    saveConfigListToStorage();
    onApply?.(item);
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
      // 编辑已有项
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
      // 新建项
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
      } else if (configEditModalMode.value === "save-current") {
        activeConfigId.value = newId;
        lastActiveConfigId.value = newId;
      }
    }
    saveConfigListToStorage();
    closeConfigEditModal();
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
      // 1. 读取保存的配置列表
      const rawList = localStorage.getItem(CONFIG_LIST_STORAGE_KEY);
      let loadedList: ConfigItem[] = [];
      if (rawList) {
        try {
          loadedList = JSON.parse(rawList);
        } catch {
          loadedList = [];
        }
      }

      // 2. 读取当前活跃配置 ID
      const savedActiveId = localStorage.getItem(ACTIVE_CONFIG_ID_KEY);

      // 3. 读取旧版或当前活跃表单配置
      const rawConfig = localStorage.getItem(STORAGE_KEY);
      let savedConfig: Partial<ClientConfig> = {};
      if (rawConfig) {
        try {
          savedConfig = JSON.parse(rawConfig);
        } catch {
          savedConfig = {};
        }
      }

      // 4. 数据迁移：如果列表为空但旧单配置有有效数据，自动转为默认配置项
      if (loadedList.length === 0 && (savedConfig.baseUrl || savedConfig.apiKey)) {
        const defaultItem: ConfigItem = {
          id: generateConfigId(),
          name: "默认配置",
          baseUrl: savedConfig.baseUrl || "",
          apiKey: savedConfig.apiKey || "",
          apiFormat: savedConfig.apiFormat || "chat_completions",
          modelName: savedConfig.modelName || "",
          reasoningEffort: savedConfig.reasoningEffort || "high",
          stream: savedConfig.stream !== false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        loadedList = [defaultItem];
        activeConfigId.value = defaultItem.id;
      } else {
        configList.value = loadedList;
        let candidateActiveId: string | null = null;
        if (savedActiveId && loadedList.some((item) => item.id === savedActiveId)) {
          candidateActiveId = savedActiveId;
        } else if (
          loadedList.length > 0 &&
          !savedActiveId &&
          !savedConfig.baseUrl &&
          !savedConfig.apiKey
        ) {
          candidateActiveId = loadedList[0].id;
        }

        if (candidateActiveId) {
          const target = loadedList.find((item) => item.id === candidateActiveId);
          if (target) {
            const curUrl = (savedConfig.baseUrl || "").trim();
            const curKey = (savedConfig.apiKey || "").trim();
            const targetUrl = (target.baseUrl || "").trim();
            const targetKey = (target.apiKey || "").trim();
            if ((curUrl || curKey) && (curUrl !== targetUrl || curKey !== targetKey)) {
              candidateActiveId = null;
            }
          }
        }
        activeConfigId.value = candidateActiveId;
        lastActiveConfigId.value = candidateActiveId || savedActiveId || null;
      }

      configList.value = loadedList;
      saveConfigListToStorage();

      // 5. 应用表单初始值
      const applyInitial = (target: ClientConfig) => {
        if (savedConfig.baseUrl !== undefined) target.baseUrl = savedConfig.baseUrl;
        if (savedConfig.apiKey !== undefined) target.apiKey = savedConfig.apiKey;
        if (savedConfig.modelName !== undefined) target.modelName = savedConfig.modelName;
        if (savedConfig.apiFormat !== undefined) {
          if (
            savedConfig.apiFormat === "responses" ||
            savedConfig.apiFormat === "openai_responses" ||
            savedConfig.apiFormat === "openai_native"
          ) {
            target.apiFormat = "responses";
          } else if (savedConfig.apiFormat === "anthropic") {
            target.apiFormat = "anthropic";
          } else {
            target.apiFormat = "chat_completions";
          }
        }
        if (savedConfig.reasoningEffort !== undefined) {
          target.reasoningEffort = resolveValidReasoningEffort(
            target.modelName,
            savedConfig.reasoningEffort
          );
        } else {
          target.reasoningEffort = resolveValidReasoningEffort(target.modelName, "high");
        }
        if (savedConfig.stream !== undefined) {
          target.stream = savedConfig.stream !== false;
        } else {
          target.stream = true;
        }
      };

      applyInitial(probeConfig);
      applyInitial(pelicanConfig);
      applyInitial(connectionConfig);
    } catch (err) {
      console.warn("加载本地配置失败:", err);
    } finally {
      isInitializing = false;
    }
  }

  async function resetConfig(onReset?: () => void): Promise<boolean> {
    const confirmed = await confirm({
      type: "warning",
      styleVariant: "spotlight",
      title: "确认重置当前配置？",
      message:
        "重置后将清空当前界面的 Base URL、API Key、已选模型与请求参数，已保存的配置预设不受影响。",
      confirmText: "确认重置",
      cancelText: "取消",
    });

    if (!confirmed) {
      return false;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("清除配置缓存失败:", err);
    }

    const resetOne = (cfg: ClientConfig) => {
      cfg.baseUrl = "";
      cfg.apiKey = "";
      cfg.modelName = "";
      cfg.apiFormat = "chat_completions";
      cfg.reasoningEffort = "high";
      cfg.stream = true;
    };

    resetOne(probeConfig);
    resetOne(pelicanConfig);
    resetOne(connectionConfig);

    activeConfigId.value = null;
    lastActiveConfigId.value = null;
    try {
      localStorage.removeItem(ACTIVE_CONFIG_ID_KEY);
    } catch {}

    onReset?.();
    return true;
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

  watch(
    () => connectionConfig.modelName,
    (newModel) => {
      const validEffort = resolveValidReasoningEffort(
        newModel,
        connectionConfig.reasoningEffort
      );
      if (validEffort !== connectionConfig.reasoningEffort) {
        connectionConfig.reasoningEffort = validEffort;
      }
    }
  );

  // 在目标测试未运行时，Base URL 与 API Key 自动在三种模式之间同步
  for (const [mode, sourceConfig] of modeConfigEntries) {
    watch(
      () => [sourceConfig.baseUrl, sourceConfig.apiKey],
      ([newUrl, newKey]) => {
        if (activeMode.value !== mode) return;
        for (const [otherMode, targetConfig] of modeConfigEntries) {
          if (otherMode === mode || isTestRunning(otherMode)) continue;
          targetConfig.baseUrl = newUrl;
          targetConfig.apiKey = newKey;
        }
      }
    );
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

  // 监听 Base URL 与 API Key 变动，实时同步并恢复 active-config-tag 标记
  watch(
    [
      () => probeConfig.baseUrl,
      () => probeConfig.apiKey,
      () => pelicanConfig.baseUrl,
      () => pelicanConfig.apiKey,
      () => connectionConfig.baseUrl,
      () => connectionConfig.apiKey,
    ],
    () => {
      checkAndSyncActiveConfigOnCredentialChange();
    }
  );

  // 监听表单输入变化并自动持久化当前输入
  watch([probeConfig, pelicanConfig, connectionConfig], () => {
    saveConfig();
  });

  return {
    activeMode,
    setActiveMode,
    config,
    probeConfig,
    pelicanConfig,
    connectionConfig,
    configList,
    activeConfigId,
    activeConfig,
    activeConfigName,
    configListCount,
    isPasswordVisible,
    isAdvancedOpen,
    isConfigListModalOpen,
    isConfigEditModalOpen,
    configEditModalMode,
    editingConfigItem,
    settingsSummary,
    hasCurrentInput,
    isCurrentConfigSaved,
    canSaveCurrent,
    matchedConfigItem,
    isConfigModified,
    togglePasswordVisibility,
    toggleAdvanced,
    openConfigListModal,
    closeConfigListModal,
    openSaveCurrentModal,
    openCreateConfigModal,
    openEditConfigModal,
    closeConfigEditModal,
    updateCurrentConfig,
    saveConfig,
    loadConfig,
    resetConfig,
    applyConfig,
    handleSaveConfigItem,
    deleteConfigItem,
    swapConfigItems,
  };
});
