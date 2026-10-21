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

export function useModelFetch({ getProps, emit }: UseModelFetchOptions) {
  const modelsStore = useModelsStore();
  const hasAutoSelected = ref(false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const currentStatus = computed(() => modelsStore.getStatus(getProps().baseUrl));
  const availableModels = computed(() => modelsStore.getModels(getProps().baseUrl));
  const isFetching = computed(() => currentStatus.value.isFetching);
  const isFetchedFromApi = computed(() => currentStatus.value.isFetched);
  const statusBarText = computed(() => currentStatus.value.statusBarText);
  const statusColor = computed(() => currentStatus.value.statusColor);

  async function fetchModels(options: { autoSelectFirst?: boolean } = {}): Promise<void> {
    const props = getProps();
    const url = props.baseUrl.trim();
    const key = props.apiKey.trim();

    if (!url || !key) {
      void modelsStore.fetchModels(url, key, props.apiFormat || "chat_completions");
      return;
    }

    const list = await modelsStore.fetchModels(url, key, props.apiFormat || "chat_completions");

    if (list && list.length > 0 && options.autoSelectFirst) {
      hasAutoSelected.value = true;
      const firstModel = list[0];
      emit("update:modelValue", firstModel);
      if (firstModel.toLowerCase().includes("claude")) {
        emit("update:apiFormat", "anthropic");
      }
      const matchedRule = findModelReasoningRule(firstModel);
      if (matchedRule) {
        emit("update:reasoningEffort", matchedRule.defaultEffort);
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
