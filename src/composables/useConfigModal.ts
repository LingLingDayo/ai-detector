import { ref } from "vue";
import type { ConfigItem, ClientConfig } from "../types";

export interface OpenSaveCurrentModalOptions {
  matchedItem?: ConfigItem;
  activeConfigId: string | null;
  activeConfigName: string;
  config: ClientConfig;
}

/**
 * 管理配置相关的模态框打开状态、编辑模式与展示项
 */
export function useConfigModal() {
  const isPasswordVisible = ref(false);
  const isAdvancedOpen = ref(false);
  const isConfigListModalOpen = ref(false);
  const isConfigEditModalOpen = ref(false);
  const configEditModalMode = ref<"create" | "edit" | "save-current">("save-current");
  const editingConfigItem = ref<ConfigItem | null>(null);

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

  function openSaveCurrentModal(options: OpenSaveCurrentModalOptions): void {
    const { matchedItem, activeConfigId, activeConfigName, config } = options;
    configEditModalMode.value = "save-current";
    editingConfigItem.value = {
      id: activeConfigId ? (matchedItem?.id || "") : "",
      name: activeConfigId ? (matchedItem?.name || activeConfigName || "") : "",
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

  return {
    isPasswordVisible,
    isAdvancedOpen,
    isConfigListModalOpen,
    isConfigEditModalOpen,
    configEditModalMode,
    editingConfigItem,
    togglePasswordVisibility,
    toggleAdvanced,
    openConfigListModal,
    closeConfigListModal,
    openSaveCurrentModal,
    openCreateConfigModal,
    openEditConfigModal,
    closeConfigEditModal,
  };
}
