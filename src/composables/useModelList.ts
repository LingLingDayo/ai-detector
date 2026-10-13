import { ref, computed, type Ref, type ComputedRef } from "vue";
import { fetchRemoteModels } from "../services/api";
import type { ClientConfig } from "../types";

export interface UseModelListReturn {
  availableModels: Ref<string[]>;
  isFetchedFromApi: Ref<boolean>;
  isFetchingModels: Ref<boolean>;
  searchQuery: Ref<string>;
  isOpen: Ref<boolean>;
  statusBarText: Ref<string>;
  statusType: Ref<"default" | "success" | "warning" | "error">;
  filteredModels: ComputedRef<string[]>;
  openDropdown: () => void;
  closeDropdown: () => void;
  toggleDropdown: (config: ClientConfig) => void;
  fetchModels: (
    baseUrl: string,
    apiKey: string,
    apiFormat: string,
    options?: { autoSelectFirst?: boolean; config?: ClientConfig }
  ) => Promise<void>;
  selectModel: (model: string, config: ClientConfig) => void;
  resetModels: () => void;
}

export function useModelList(): UseModelListReturn {
  const availableModels = ref<string[]>([]);
  const isFetchedFromApi = ref(false);
  const isFetchingModels = ref(false);
  const searchQuery = ref("");
  const isOpen = ref(false);
  const statusBarText = ref("未获取模型，可点击右侧 ↻ 按钮自动拉取");
  const statusType = ref<"default" | "success" | "warning" | "error">("default");

  const filteredModels = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return availableModels.value;
    return availableModels.value.filter((m) => m.toLowerCase().includes(q));
  });

  function openDropdown(): void {
    isOpen.value = true;
    searchQuery.value = "";
    if (!isFetchedFromApi.value) {
      statusBarText.value = "未获取模型，可点击右侧 ↻ 按钮自动拉取";
      statusType.value = "default";
    }
  }

  function closeDropdown(): void {
    isOpen.value = false;
  }

  function toggleDropdown(config: ClientConfig): void {
    if (isOpen.value) {
      closeDropdown();
    } else {
      openDropdown();
      if (!isFetchedFromApi.value && config.baseUrl.trim() && config.apiKey.trim()) {
        void fetchModels(config.baseUrl, config.apiKey, config.apiFormat);
      }
    }
  }

  async function fetchModels(
    baseUrl: string,
    apiKey: string,
    apiFormat: string,
    options: { autoSelectFirst?: boolean; config?: ClientConfig } = {}
  ): Promise<void> {
    const trimmedUrl = baseUrl.trim();
    const trimmedKey = apiKey.trim();

    if (!trimmedUrl || !trimmedKey) {
      statusBarText.value = "请先填写 Base URL 和 API Key 以获取模型";
      statusType.value = "warning";
      return;
    }

    if (isFetchingModels.value) return;
    isFetchingModels.value = true;
    statusBarText.value = "正在从 /v1/models 拉取可用模型列表...";
    statusType.value = "default";

    try {
      const list = await fetchRemoteModels(trimmedUrl, trimmedKey, apiFormat);
      isFetchedFromApi.value = true;
      if (list && list.length > 0) {
        availableModels.value = list;
        statusBarText.value = `已成功获取 ${list.length} 个模型`;
        statusType.value = "success";

        if (options.autoSelectFirst && options.config) {
          const firstModel = list[0];
          options.config.modelName = firstModel;
          if (firstModel.toLowerCase().includes("claude")) {
            options.config.apiFormat = "anthropic";
          }
        }
      } else {
        availableModels.value = [];
        statusBarText.value = "上游未返回可用模型列表，仍可手动输入";
        statusType.value = "default";
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn("获取远程模型异常:", err);
      statusBarText.value = `获取失败(${errMsg || "请求受限"})，可手动输入`;
      statusType.value = "error";
    } finally {
      isFetchingModels.value = false;
    }
  }

  function selectModel(model: string, config: ClientConfig): void {
    config.modelName = model;
    if (model.toLowerCase().includes("claude")) {
      config.apiFormat = "anthropic";
    } else if (config.apiFormat !== "responses") {
      config.apiFormat = "chat_completions";
    }
    closeDropdown();
  }

  function resetModels(): void {
    availableModels.value = [];
    isFetchedFromApi.value = false;
    isFetchingModels.value = false;
    searchQuery.value = "";
    isOpen.value = false;
    statusBarText.value = "未获取模型，可点击右侧 ↻ 按钮自动拉取";
    statusType.value = "default";
  }

  return {
    availableModels,
    isFetchedFromApi,
    isFetchingModels,
    searchQuery,
    isOpen,
    statusBarText,
    statusType,
    filteredModels,
    openDropdown,
    closeDropdown,
    toggleDropdown,
    fetchModels,
    selectModel,
    resetModels,
  };
}
