import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { findModelReasoningRule } from "../../data/modelReasoningRules";
import { useModelsStore } from "../../stores/models";
import { isValidBaseUrl, isValidApiKey } from "./modelStorage";

export interface UseModelFetchOptions {
  getProps: () => {
    modelValue: string;
    baseUrl: string;
    apiKey: string;
    apiFormat?: string;
    autoSelectFirst?: boolean;
    isCustomModel?: boolean;
  };
  emit: {
    (e: "update:modelValue", value: string): void;
    (e: "update:apiFormat", value: string): void;
    (e: "update:reasoningEffort", value: string): void;
    (e: "update:isCustomModel", value: boolean): void;
  };
}

export type CredentialModelResolution =
  | { action: "keep" }
  | { action: "clear" }
  | { action: "select"; model: string };

/**
 * 提取模型名称中的首个版本/数字标识数组（如 "gpt-5.6-sol" -> [5, 6]）
 * 无有效数字标识时返回 null
 */
export function extractModelVersionParts(model: string): number[] | null {
  const trimmed = model.trim();
  if (!trimmed) return null;

  const lastSlashIndex = trimmed.lastIndexOf("/");
  const baseName =
    lastSlashIndex !== -1 && lastSlashIndex < trimmed.length - 1
      ? trimmed.slice(lastSlashIndex + 1)
      : trimmed;

  // 移除独立的日期快照片段（如 20250501、2024-11-20、2025-05），避免日期数字干扰版本比较
  const withoutDates = baseName.replace(
    /(?:^|[-_:.])(?:20\d{2}[-_]?(?:0[1-9]|1[0-2])[-_]?(?:0[1-9]|[12]\d|3[01])|20\d{2}[-_](?:0[1-9]|1[0-2]))(?=$|[-_:.])/g,
    "-"
  );

  const match = withoutDates.match(/\d+\.\d+(?:\.\d+)*|\d+(?:-(?:[1-9]\d?|0)(?=$|[-_:]))?/);
  if (!match) return null;

  return match[0].split(/[.-]/).map((part) => Number(part));
}

/**
 * 逐段比较两个版本号数组，缺失位按 0 对齐
 */
export function compareModelVersionParts(a: readonly number[], b: readonly number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const numA = a[i] ?? 0;
    const numB = b[i] ?? 0;
    if (numA !== numB) {
      return numA - numB;
    }
  }
  return 0;
}

/**
 * 从模型列表中选出默认模型：
 * 1. 优先选择标识数字最大的模型（无数字优先级更低）
 * 2. 最大数字并列时选择列表中靠前的第一个
 * 3. 全部无数字标识时兜底返回列表第一个模型
 */
export function selectDefaultModel(models: readonly string[]): string | null {
  if (models.length === 0) return null;

  let bestModel = models[0];
  let bestVersion = extractModelVersionParts(bestModel);

  for (let i = 1; i < models.length; i++) {
    const candidate = models[i];
    const candidateVersion = extractModelVersionParts(candidate);
    if (!candidateVersion) continue;

    if (!bestVersion || compareModelVersionParts(candidateVersion, bestVersion) > 0) {
      bestModel = candidate;
      bestVersion = candidateVersion;
    }
  }

  return bestModel;
}

export function resolveModelAfterCredentialChange(
  currentModel: string,
  models: string[],
  fetchFailed: boolean,
  isCustomModel: boolean = false
): CredentialModelResolution {
  // 手动输入的模型并非从列表选中，列表刷新结果不参与其保留、替换或清空判定
  if (isCustomModel && currentModel.trim()) {
    return { action: "keep" };
  }

  if (fetchFailed || models.length === 0) {
    return { action: "clear" };
  }

  const model = currentModel.trim();
  if (model && models.includes(model)) {
    return { action: "keep" };
  }

  const defaultModel = selectDefaultModel(models);
  if (!defaultModel) {
    return { action: "clear" };
  }

  return { action: "select", model: defaultModel };
}

export function useModelFetch({ getProps, emit }: UseModelFetchOptions) {
  const modelsStore = useModelsStore();
  const hasAutoSelected = ref(false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFetchCredentials: { baseUrl: string; apiKey: string } | null = null;

  const currentStatus = computed(() => modelsStore.getStatus(getProps().baseUrl));
  const availableModels = computed(() => modelsStore.getModels(getProps().baseUrl));
  const isFetching = computed(() => currentStatus.value.isFetching);
  const isFetchedFromApi = computed(() => currentStatus.value.isFetched);
  const statusBarText = computed(() => currentStatus.value.statusBarText);
  const statusColor = computed(() => currentStatus.value.statusColor);

  function syncReasoningEffort(model: string): void {
    const matchedRule = findModelReasoningRule(model);
    if (matchedRule) {
      emit("update:reasoningEffort", matchedRule.defaultEffort);
    }
  }

  function applyAutoSelectedModel(model: string): void {
    emit("update:modelValue", model);
    emit("update:isCustomModel", false);
    if (model.toLowerCase().includes("claude")) {
      emit("update:apiFormat", "anthropic");
    }
    syncReasoningEffort(model);
  }

  async function fetchModels(options: { autoSelectFirst?: boolean } = {}): Promise<void> {
    const props = getProps();
    const url = props.baseUrl.trim();
    const key = props.apiKey.trim();

    if (!url || !key) {
      void modelsStore.fetchModels(url, key, props.apiFormat || "chat_completions");
      return;
    }

    const isCredentialChange =
      lastFetchCredentials !== null &&
      (url !== lastFetchCredentials.baseUrl || key !== lastFetchCredentials.apiKey) &&
      Boolean(props.autoSelectFirst);
    lastFetchCredentials = { baseUrl: url, apiKey: key };

    const list = await modelsStore.fetchModels(url, key, props.apiFormat || "chat_completions");

    const current = getProps();
    if (current.baseUrl.trim() !== url || current.apiKey.trim() !== key) {
      return;
    }

    if (isCredentialChange) {
      const resolution = resolveModelAfterCredentialChange(
        current.modelValue,
        list,
        modelsStore.getStatus(url).lastFetchFailed,
        current.isCustomModel === true
      );

      if (resolution.action === "clear") {
        if (current.modelValue.trim()) {
          emit("update:modelValue", "");
        }
        return;
      }

      if (resolution.action === "select") {
        hasAutoSelected.value = true;
        applyAutoSelectedModel(resolution.model);
      }
      return;
    }

    if (list.length > 0 && options.autoSelectFirst && !current.modelValue.trim()) {
      const defaultModel = selectDefaultModel(list);
      if (defaultModel) {
        hasAutoSelected.value = true;
        applyAutoSelectedModel(defaultModel);
      }
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
    emit("update:isCustomModel", false);
    if (model.toLowerCase().includes("claude")) {
      emit("update:apiFormat", "anthropic");
    } else if (props.apiFormat !== "responses") {
      emit("update:apiFormat", "chat_completions");
    }
    syncReasoningEffort(model);
  }

  function resetModelList(): void {
    const props = getProps();
    modelsStore.resetModels(props.baseUrl);
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
      }
      checkAndTriggerAutoFetch(false);
    }
  );

  onMounted(() => {
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
    fetchModels,
    checkAndTriggerAutoFetch,
    selectModel,
    resetModelList,
  };
}
