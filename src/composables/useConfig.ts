import { ref, reactive, computed, watch, type Ref, type ComputedRef } from "vue";
import { STORAGE_KEY, CONFIG_LIST_STORAGE_KEY, ACTIVE_CONFIG_ID_KEY } from "../constants";
import type { ClientConfig, ConfigItem } from "../types";
import { useConfirm } from "./useConfirm";

function generateConfigId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isSameConfigIdentity(
  urlA: string | undefined,
  keyA: string | undefined,
  urlB: string | undefined,
  keyB: string | undefined
): boolean {
  const normUrlA = (urlA || "").trim();
  const normKeyA = (keyA || "").trim();
  const normUrlB = (urlB || "").trim();
  const normKeyB = (keyB || "").trim();
  return Boolean(normUrlA && normKeyA && normUrlA === normUrlB && normKeyA === normKeyB);
}

export function isConfigEqual(current: ClientConfig, item: ConfigItem): boolean {
  const normCurrentBaseUrl = (current.baseUrl || "").trim();
  const normItemBaseUrl = (item.baseUrl || "").trim();
  const normCurrentApiKey = (current.apiKey || "").trim();
  const normItemApiKey = (item.apiKey || "").trim();
  const normCurrentModel = (current.modelName || "").trim();
  const normItemModel = (item.modelName || "").trim();
  const normCurrentFormat = current.apiFormat || "chat_completions";
  const normItemFormat = item.apiFormat || "chat_completions";
  const normCurrentEffort = current.reasoningEffort || "high";
  const normItemEffort = item.reasoningEffort || "high";
  const normCurrentStream = current.stream !== false;
  const normItemStream = item.stream !== false;

  return (
    normCurrentBaseUrl === normItemBaseUrl &&
    normCurrentApiKey === normItemApiKey &&
    normCurrentModel === normItemModel &&
    normCurrentFormat === normItemFormat &&
    normCurrentEffort === normItemEffort &&
    normCurrentStream === normItemStream
  );
}

export interface UseConfigOptions {
  onApply?: (item: ConfigItem) => void;
}

export interface UseConfigReturn {
  config: ClientConfig;
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

  const config = reactive<ClientConfig>({
    baseUrl: "",
    apiKey: "",
    apiFormat: "chat_completions",
    modelName: "",
    reasoningEffort: "high",
    stream: true,
  });

  const configList = ref<ConfigItem[]>([]);
  const activeConfigId = ref<string | null>(null);

  const isPasswordVisible = ref(false);
  const isAdvancedOpen = ref(false);
  const isConfigListModalOpen = ref(false);
  const isConfigEditModalOpen = ref(false);
  const configEditModalMode = ref<"create" | "edit" | "save-current">("save-current");
  const editingConfigItem = ref<ConfigItem | null>(null);

  let isInitializing = true;

  const activeConfig = computed<ConfigItem | undefined>(() => {
    if (!activeConfigId.value) return undefined;
    return configList.value.find((item) => item.id === activeConfigId.value);
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

    const effortMap: Record<string, string> = {
      none: "关闭",
      minimal: "极低",
      low: "低",
      medium: "中",
      high: "高",
      xhigh: "极高",
      max: "极限",
      ultra: "极致",
    };
    const effortLabel = effortMap[config.reasoningEffort] || "高";
    const streamLabel = config.stream !== false ? "流式" : "同步";

    return `${formatName} · ${streamLabel} · 思考强度:${effortLabel}`;
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
      id: matched?.id || "",
      name: matched?.name || activeConfigName.value || "",
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (err) {
      console.warn("保存当前配置失败:", err);
    }
  }

  function applyConfig(item: ConfigItem): void {
    config.baseUrl = item.baseUrl || "";
    config.apiKey = item.apiKey || "";
    config.modelName = item.modelName || "";
    if (item.apiFormat) {
      config.apiFormat = item.apiFormat;
    }
    if (item.reasoningEffort) {
      config.reasoningEffort = item.reasoningEffort;
    }
    config.stream = item.stream !== false;
    activeConfigId.value = item.id;
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
    if (id) {
      // 编辑已有项
      const index = configList.value.findIndex((item) => item.id === id);
      if (index !== -1) {
        const updatedItem: ConfigItem = {
          ...configList.value[index],
          ...data,
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
        ...data,
        id: newId,
        createdAt: now,
        updatedAt: now,
      };
      configList.value.push(newItem);
      if (applyImmediately || !activeConfigId.value) {
        applyConfig(newItem);
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
        if (savedActiveId && loadedList.some((item) => item.id === savedActiveId)) {
          activeConfigId.value = savedActiveId;
        } else if (loadedList.length > 0 && !savedActiveId) {
          activeConfigId.value = loadedList[0].id;
        }
      }

      configList.value = loadedList;
      saveConfigListToStorage();

      // 5. 应用表单初始值
      if (savedConfig.baseUrl !== undefined) config.baseUrl = savedConfig.baseUrl;
      if (savedConfig.apiKey !== undefined) config.apiKey = savedConfig.apiKey;
      if (savedConfig.modelName !== undefined) config.modelName = savedConfig.modelName;
      if (savedConfig.apiFormat !== undefined) {
        if (
          savedConfig.apiFormat === "responses" ||
          savedConfig.apiFormat === "openai_responses" ||
          savedConfig.apiFormat === "openai_native"
        ) {
          config.apiFormat = "responses";
        } else if (savedConfig.apiFormat === "anthropic") {
          config.apiFormat = "anthropic";
        } else {
          config.apiFormat = "chat_completions";
        }
      }
      if (savedConfig.reasoningEffort !== undefined) {
        config.reasoningEffort = savedConfig.reasoningEffort;
      }
      if (savedConfig.stream !== undefined) {
        config.stream = savedConfig.stream !== false;
      } else {
        config.stream = true;
      }
    } catch (err) {
      console.warn("加载本地配置失败:", err);
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
      detailList: [
        "清空当前输入的 Base URL 与 API Key",
        "模型设置与推理深度恢复为默认值",
        "已保存的配置预设列表将继续保留",
      ],
    });

    if (!confirmed) {
      return false;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("清除配置缓存失败:", err);
    }
    config.baseUrl = "";
    config.apiKey = "";
    config.modelName = "";
    config.apiFormat = "chat_completions";
    config.reasoningEffort = "high";
    config.stream = true;
    activeConfigId.value = null;
    try {
      localStorage.removeItem(ACTIVE_CONFIG_ID_KEY);
    } catch {}
    return true;
  }

  // 监听表单输入变化并自动持久化当前输入
  watch(config, () => {
    saveConfig();
  });

  return {
    config,
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
    saveConfig,
    loadConfig,
    resetConfig,
    applyConfig,
    handleSaveConfigItem,
    deleteConfigItem,
    swapConfigItems,
  };
}

