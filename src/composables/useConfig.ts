import { ref, reactive, computed, watch, type Ref, type ComputedRef } from "vue";
import { STORAGE_KEY } from "../constants";
import type { ClientConfig } from "../types";

export interface UseConfigReturn {
  config: ClientConfig;
  isPasswordVisible: Ref<boolean>;
  isAdvancedOpen: Ref<boolean>;
  saveTipText: Ref<string>;
  isSaveTipActive: Ref<boolean>;
  settingsSummary: ComputedRef<string>;
  togglePasswordVisibility: () => void;
  toggleAdvanced: () => void;
  saveConfig: () => void;
  loadConfig: () => void;
  resetConfig: () => void;
}

export function useConfig(): UseConfigReturn {
  const config = reactive<ClientConfig>({
    baseUrl: "",
    apiKey: "",
    apiFormat: "chat_completions",
    modelName: "",
    reasoningEffort: "high",
  });

  const isPasswordVisible = ref(false);
  const isAdvancedOpen = ref(false);
  const saveTipText = ref("已自动保存配置");
  const isSaveTipActive = ref(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let isInitializing = true;

  const settingsSummary = computed(() => {
    let formatName = "/v1/chat/completions";
    if (config.apiFormat === "openai_native") {
      formatName = "OpenAI 原生";
    } else if (config.apiFormat === "anthropic") {
      formatName = "Claude Messages";
    }

    const effort = config.reasoningEffort;
    const effortLabel = effort === "none" ? "无思考" : effort.toUpperCase();

    return `${formatName} · 思考:${effortLabel}`;
  });

  function togglePasswordVisibility(): void {
    isPasswordVisible.value = !isPasswordVisible.value;
  }

  function toggleAdvanced(): void {
    isAdvancedOpen.value = !isAdvancedOpen.value;
  }

  function triggerSaveTip(): void {
    isSaveTipActive.value = true;
    saveTipText.value = "已自动保存配置 ✓";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      isSaveTipActive.value = false;
      saveTipText.value = "已自动保存配置";
    }, 2000);
  }

  function saveConfig(): void {
    if (isInitializing) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      triggerSaveTip();
    } catch (err) {
      console.warn("保存配置失败:", err);
    }
  }

  function loadConfig(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        isInitializing = false;
        return;
      }
      const saved = JSON.parse(raw) as Partial<ClientConfig>;
      if (saved.baseUrl !== undefined) config.baseUrl = saved.baseUrl;
      if (saved.apiKey !== undefined) config.apiKey = saved.apiKey;
      if (saved.modelName !== undefined) config.modelName = saved.modelName;
      if (saved.apiFormat !== undefined) {
        config.apiFormat = saved.apiFormat === "openai" ? "chat_completions" : saved.apiFormat;
      }
      if (saved.reasoningEffort !== undefined) {
        config.reasoningEffort = saved.reasoningEffort;
      }
    } catch (err) {
      console.warn("加载本地配置失败:", err);
    } finally {
      isInitializing = false;
    }
  }

  function resetConfig(): void {
    if (window.confirm("确定要清空已保存的 Base URL 和 API Key 等配置吗？")) {
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
      triggerSaveTip();
    }
  }

  // Auto-fill URL hint on protocol change when URL is blank
  watch(
    () => config.apiFormat,
    (newFormat) => {
      if (isInitializing) return;
      if (newFormat === "openai_native" && !config.baseUrl.trim()) {
        config.baseUrl = "https://api.openai.com/v1";
      } else if (newFormat === "anthropic" && !config.baseUrl.trim()) {
        config.baseUrl = "https://api.anthropic.com/v1";
      }
    }
  );

  // Watch state changes and auto-save
  watch(config, () => {
    saveConfig();
  });

  return {
    config,
    isPasswordVisible,
    isAdvancedOpen,
    saveTipText,
    isSaveTipActive,
    settingsSummary,
    togglePasswordVisibility,
    toggleAdvanced,
    saveConfig,
    loadConfig,
    resetConfig,
  };
}
