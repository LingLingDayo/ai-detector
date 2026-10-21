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
  };
  emit: {
    (e: "update:modelValue", value: string): void;
    (e: "update:apiFormat", value: string): void;
    (e: "update:reasoningEffort", value: string): void;
  };
}

export type CredentialModelResolution =
  | { action: "keep" }
  | { action: "clear" }
  | { action: "select"; model: string };

export function resolveModelAfterCredentialChange(
  currentModel: string,
  models: string[],
  fetchFailed: boolean
): CredentialModelResolution {
  if (fetchFailed || models.length === 0) {
    return { action: "clear" };
  }

  const model = currentModel.trim();
  if (model && models.includes(model)) {
    return { action: "keep" };
  }

  return { action: "select", model: models[0] };
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
        modelsStore.getStatus(url).lastFetchFailed
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
      hasAutoSelected.value = true;
      applyAutoSelectedModel(list[0]);
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
