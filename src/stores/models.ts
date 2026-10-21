import { defineStore } from "pinia";
import { ref, reactive } from "vue";
import { fetchRemoteModels } from "../services/api";
import {
  loadSavedModels,
  saveModelsToStorage,
  mergeModelList,
  isValidBaseUrl,
  isValidApiKey,
  getModelStorageKey,
} from "../components/model-combobox/modelStorage";

export interface ModelUrlStatus {
  isFetching: boolean;
  isFetched: boolean;
  statusBarText: string;
  statusColor: string;
}

const DEFAULT_STATUS_TEXT = "未获取模型，可点击右侧 ↻ 按钮自动拉取";

export const useModelsStore = defineStore("models", () => {
  // 按照标准化 URL 缓存模型列表
  const modelsCache = reactive<Record<string, string[]>>({});

  // 按照标准化 URL 记录拉取与状态信息
  const statusCache = reactive<Record<string, ModelUrlStatus>>({});

  // 正在进行中的请求 Promise，防止同 URL 并发重复请求
  const pendingRequests = new Map<string, Promise<string[]>>();

  function getCleanUrl(url: string): string {
    return (url || "").trim().toLowerCase().replace(/\/+$/, "");
  }

  function getStatus(url: string): ModelUrlStatus {
    const cleanUrl = getCleanUrl(url);
    if (!statusCache[cleanUrl]) {
      const saved = loadSavedModels(url);
      const hasSaved = Boolean(saved && saved.length > 0);
      statusCache[cleanUrl] = {
        isFetching: false,
        isFetched: hasSaved,
        statusBarText: hasSaved ? `已加载本地保存的 ${saved!.length} 个模型` : DEFAULT_STATUS_TEXT,
        statusColor: "",
      };
    }
    return statusCache[cleanUrl];
  }

  function getModels(url: string): string[] {
    const cleanUrl = getCleanUrl(url);
    if (modelsCache[cleanUrl]) {
      return modelsCache[cleanUrl];
    }
    const saved = loadSavedModels(url);
    if (saved && saved.length > 0) {
      modelsCache[cleanUrl] = saved;
      return saved;
    }
    return [];
  }

  async function fetchModels(
    baseUrl: string,
    apiKey: string,
    apiFormat: string = "chat_completions"
  ): Promise<string[]> {
    const cleanUrl = getCleanUrl(baseUrl);
    const trimmedKey = apiKey.trim();

    const status = getStatus(baseUrl);

    if (!cleanUrl || !trimmedKey) {
      status.statusBarText = "请先填写 Base URL 和 API Key 以获取模型";
      status.statusColor = "var(--warning)";
      return getModels(baseUrl);
    }

    if (pendingRequests.has(cleanUrl)) {
      return pendingRequests.get(cleanUrl)!;
    }

    status.isFetching = true;
    status.statusBarText = "正在从 /v1/models 拉取可用模型列表...";
    status.statusColor = "";

    const requestPromise = (async () => {
      try {
        const list = await fetchRemoteModels(baseUrl.trim(), trimmedKey, apiFormat || "chat_completions");
        status.isFetched = true;

        if (list && list.length > 0) {
          const saved = loadSavedModels(baseUrl);
          const mergedList = mergeModelList(saved, list);
          modelsCache[cleanUrl] = mergedList;
          saveModelsToStorage(baseUrl, mergedList);

          status.statusBarText = `已成功获取 ${mergedList.length} 个模型`;
          status.statusColor = "var(--success)";
          return mergedList;
        } else {
          modelsCache[cleanUrl] = [];
          status.statusBarText = "上游未返回可用模型列表，仍可手动输入";
          status.statusColor = "";
          return [];
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn("获取模型列表异常:", err);
        status.statusBarText = `获取失败(${errMsg || "请求受限"})，可手动输入`;
        status.statusColor = "var(--danger)";
        return getModels(baseUrl);
      } finally {
        status.isFetching = false;
        pendingRequests.delete(cleanUrl);
      }
    })();

    pendingRequests.set(cleanUrl, requestPromise);
    return requestPromise;
  }

  function resetModels(url: string): void {
    const cleanUrl = getCleanUrl(url);
    delete modelsCache[cleanUrl];
    delete statusCache[cleanUrl];
    // 重新从本地存储载入初始状态
    getModels(url);
    getStatus(url);
  }

  function clearCache(): void {
    Object.keys(modelsCache).forEach((k) => delete modelsCache[k]);
    Object.keys(statusCache).forEach((k) => delete statusCache[k]);
    pendingRequests.clear();
  }

  return {
    modelsCache,
    statusCache,
    getCleanUrl,
    getStatus,
    getModels,
    fetchModels,
    resetModels,
    clearCache,
  };
});
