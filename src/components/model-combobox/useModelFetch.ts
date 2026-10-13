import { ref, watch, onMounted, onUnmounted } from "vue";
import { fetchRemoteModels } from "../../services/api";
import { findModelReasoningRule } from "../../data/modelReasoningRules";
import {
  saveModelsToStorage,
  loadSavedModels,
  mergeModelList,
  isValidBaseUrl,
  isValidApiKey,
} from "./modelStorage";

export interface UseModelFetchOptions {
  getProps: () => {
    modelValue: string;
    baseUrl: string;
    apiKey: string;
    apiFormat?: string;
    autoSelectFirst?: boolean;
  };
  emit: {
    (e: "update:modelValue", value: string): void;
    (e: "update:apiFormat", value: string): void;
    (e: "update:reasoningEffort", value: string): void;
  };
}

export function useModelFetch({ getProps, emit }: UseModelFetchOptions) {
  const availableModels = ref<string[]>([]);
  const isFetchedFromApi = ref(false);
  const isFetching = ref(false);
  const statusBarText = ref("未获取模型，可点击右侧 ↻ 按钮自动拉取");
  const statusColor = ref<string>("");
  const hasAutoSelected = ref(false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function loadInitialModels(url: string): void {
    const saved = loadSavedModels(url);
    if (saved && saved.length > 0) {
      availableModels.value = saved;
      isFetchedFromApi.value = true;
      statusBarText.value = `已加载本地保存的 ${saved.length} 个模型`;
      statusColor.value = "";
    } else {
      availableModels.value = [];
      isFetchedFromApi.value = false;
      statusBarText.value = "未获取模型，可点击右侧 ↻ 按钮自动拉取";
      statusColor.value = "";
    }
  }

  async function fetchModels(options: { autoSelectFirst?: boolean } = {}): Promise<void> {
    const props = getProps();
    const url = props.baseUrl.trim();
    const key = props.apiKey.trim();

    if (!url || !key) {
      statusBarText.value = "请先填写 Base URL 和 API Key 以获取模型";
      statusColor.value = "var(--warning)";
      return;
    }

    if (isFetching.value) return;
    isFetching.value = true;
    statusBarText.value = "正在从 /v1/models 拉取可用模型列表...";
    statusColor.value = "";

    try {
      const list = await fetchRemoteModels(url, key, props.apiFormat || "chat_completions");
      isFetchedFromApi.value = true;
      if (list && list.length > 0) {
        // 保留用户已排好的顺序，过滤远端已移除的，新模型追加到末尾
        const saved = loadSavedModels(url);
        const mergedList = mergeModelList(saved, list);

        availableModels.value = mergedList;
        saveModelsToStorage(url, mergedList);
        statusBarText.value = `已成功获取 ${mergedList.length} 个模型`;
        statusColor.value = "var(--success)";

        if (options.autoSelectFirst) {
          hasAutoSelected.value = true;
          const firstModel = mergedList[0];
          emit("update:modelValue", firstModel);
          if (firstModel.toLowerCase().includes("claude")) {
            emit("update:apiFormat", "anthropic");
          }
          const matchedRule = findModelReasoningRule(firstModel);
          if (matchedRule) {
            emit("update:reasoningEffort", matchedRule.defaultEffort);
          }
        }
      } else {
        availableModels.value = [];
        statusBarText.value = "上游未返回可用模型列表，仍可手动输入";
        statusColor.value = "";
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn("获取模型列表异常:", err);
      statusBarText.value = `获取失败(${errMsg || "请求受限"})，可手动输入`;
      statusColor.value = "var(--danger)";
    } finally {
      isFetching.value = false;
    }
  }

  function checkAndTriggerAutoFetch(immediate = false): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    const props = getProps();
    const url = props.baseUrl;
    const key = props.apiKey;

    if (isValidBaseUrl(url) && isValidApiKey(key)) {
      const shouldSelectFirst = Boolean(props.autoSelectFirst && !hasAutoSelected.value && !props.modelValue.trim());
      if (immediate) {
        void fetchModels({ autoSelectFirst: shouldSelectFirst });
      } else {
        debounceTimer = setTimeout(() => {
          const currentProps = getProps();
          if (isValidBaseUrl(currentProps.baseUrl) && isValidApiKey(currentProps.apiKey)) {
            const selectFirst = Boolean(currentProps.autoSelectFirst && !hasAutoSelected.value && !currentProps.modelValue.trim());
            void fetchModels({ autoSelectFirst: selectFirst });
          }
        }, 800);
      }
    }
  }

  function selectModel(model: string): void {
    const props = getProps();
    emit("update:modelValue", model);
    if (model.toLowerCase().includes("claude")) {
      emit("update:apiFormat", "anthropic");
    } else if (props.apiFormat !== "responses") {
      emit("update:apiFormat", "chat_completions");
    }
    const matchedRule = findModelReasoningRule(model);
    if (matchedRule) {
      emit("update:reasoningEffort", matchedRule.defaultEffort);
    }
  }

  function resetModelList(): void {
    const props = getProps();
    loadInitialModels(props.baseUrl);
    isFetching.value = false;
    hasAutoSelected.value = false;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  watch(
    [() => getProps().baseUrl, () => getProps().apiKey],
    ([newUrl, newKey], [oldUrl, oldKey]) => {
      if (newUrl !== oldUrl || newKey !== oldKey) {
        hasAutoSelected.value = false;
        loadInitialModels(newUrl || "");
      }
      checkAndTriggerAutoFetch(false);
    }
  );

  onMounted(() => {
    loadInitialModels(getProps().baseUrl);
    setTimeout(() => {
      checkAndTriggerAutoFetch(false);
    }, 100);
  });

  onUnmounted(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });

  return {
    availableModels,
    isFetchedFromApi,
    isFetching,
    statusBarText,
    statusColor,
    loadInitialModels,
    fetchModels,
    checkAndTriggerAutoFetch,
    selectModel,
    resetModelList,
  };
}
