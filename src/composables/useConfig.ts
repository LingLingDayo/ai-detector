import { ref, reactive, computed, watch, type Ref, type ComputedRef } from "vue";
import { STORAGE_KEY, CONFIG_LIST_STORAGE_KEY, ACTIVE_CONFIG_ID_KEY } from "../constants";
import type { ClientConfig, ConfigItem } from "../types";

function generateConfigId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  resetConfig: () => void;
  applyConfig: (item: ConfigItem) => void;
  handleSaveConfigItem: (
    data: Omit<ConfigItem, "id" | "createdAt" | "updatedAt">,
    id?: string,
    applyImmediately?: boolean
  ) => void;
  deleteConfigItem: (id: string) => void;
}

export function useConfig(): UseConfigReturn {
  const config = reactive<ClientConfig>({
    baseUrl: "",
    apiKey: "",
    apiFormat: "chat_completions",
    modelName: "",
    reasoningEffort: "high",
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

    return `${formatName} · 思考强度:${effortLabel}`;
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
    configEditModalMode.value = "save-current";
    editingConfigItem.value = {
      id: "",
      name: activeConfigName.value || "",
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      apiFormat: config.apiFormat,
      modelName: config.modelName,
      reasoningEffort: config.reasoningEffort,
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
    activeConfigId.value = item.id;
    saveConfig();
    saveConfigListToStorage();
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

  function deleteConfigItem(id: string): void {
    const target = configList.value.find((item) => item.id === id);
    const targetName = target?.name ? `「${target.name}」` : "该配置";
    if (!window.confirm(`确定要删除配置 ${targetName} 吗？`)) {
      return;
    }

    configList.value = configList.value.filter((item) => item.id !== id);
    if (activeConfigId.value === id) {
      activeConfigId.value = null;
    }
    saveConfigListToStorage();
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
    } catch (err) {
      console.warn("加载本地配置失败:", err);
    } finally {
      isInitializing = false;
    }
  }

  function resetConfig(): void {
    if (window.confirm("确定要清空当前的 Base URL 和 API Key 等表单输入吗？")) {
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
      activeConfigId.value = null;
      try {
        localStorage.removeItem(ACTIVE_CONFIG_ID_KEY);
      } catch {}
    }
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
  };
}

