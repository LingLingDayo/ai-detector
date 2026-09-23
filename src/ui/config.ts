import { STORAGE_KEY } from "../constants";
import type { ClientConfig } from "../types";
import {
  baseUrlInput,
  apiKeyInput,
  modelNameInput,
  saveTip,
  settingsSummary,
  toggleKeyBtn,
  eyeOpenIcon,
  eyeClosedIcon,
  toggleAdvancedBtn,
  advancedPanel,
  btnReset,
  getActiveEndpointFormat,
  setEndpointFormatRadio,
  getActiveReasoningEffort,
  setReasoningEffortRadio,
} from "./dom";

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function updateSettingsSummary(): void {
  const format = getActiveEndpointFormat();
  let formatName = "/v1/chat/completions";
  if (format === "openai_native") {
    formatName = "OpenAI 原生";
  } else if (format === "anthropic") {
    formatName = "Claude Messages";
  }

  const effort = getActiveReasoningEffort();
  const effortLabel = effort === "none" ? "无思考" : effort.toUpperCase();

  settingsSummary.textContent = `${formatName} · 思考:${effortLabel}`;
}

export function triggerSaveTip(): void {
  saveTip.classList.add("saved");
  saveTip.textContent = "已自动保存配置 ✓";
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTip.classList.remove("saved");
    saveTip.textContent = "已自动保存配置";
  }, 2000);
}

export function saveConfig(): void {
  const config: ClientConfig = {
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    apiFormat: getActiveEndpointFormat(),
    modelName: modelNameInput.value.trim(),
    reasoningEffort: getActiveReasoningEffort(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  updateSettingsSummary();
  triggerSaveTip();
}

export function loadConfig(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const config = JSON.parse(raw) as Partial<ClientConfig>;
    if (config.baseUrl) baseUrlInput.value = config.baseUrl;
    if (config.apiKey) apiKeyInput.value = config.apiKey;
    if (config.modelName) modelNameInput.value = config.modelName;
    if (config.apiFormat) {
      setEndpointFormatRadio(config.apiFormat);
    }
    if (config.reasoningEffort) {
      setReasoningEffortRadio(config.reasoningEffort);
    } else {
      setReasoningEffortRadio("high");
    }
    updateSettingsSummary();
  } catch (err) {
    console.warn("加载保存配置失败:", err);
  }
}

export function resetConfig(): void {
  if (confirm("确定要清空已保存的 Base URL 和 API Key 等配置吗？")) {
    localStorage.removeItem(STORAGE_KEY);
    baseUrlInput.value = "";
    apiKeyInput.value = "";
    modelNameInput.value = "";
    setEndpointFormatRadio("chat_completions");
    setReasoningEffortRadio("high");
    updateSettingsSummary();
    triggerSaveTip();
  }
}

export function initConfigHandlers(): void {
  // API Key visibility toggle
  toggleKeyBtn.addEventListener("click", () => {
    const isPassword = apiKeyInput.type === "password";
    apiKeyInput.type = isPassword ? "text" : "password";
    eyeOpenIcon.classList.toggle("hidden", isPassword);
    eyeClosedIcon.classList.toggle("hidden", !isPassword);
  });

  // Advanced settings toggle
  toggleAdvancedBtn.addEventListener("click", () => {
    const isOpen = !advancedPanel.classList.contains("hidden");
    advancedPanel.classList.toggle("hidden", isOpen);
    toggleAdvancedBtn.classList.toggle("open", !isOpen);
  });

  // Auto-save bindings
  [baseUrlInput, apiKeyInput, modelNameInput].forEach((el) => {
    el.addEventListener("input", saveConfig);
  });

  document.querySelectorAll<HTMLInputElement>('input[name="endpoint-format"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.checked) {
        if (target.value === "openai_native" && !baseUrlInput.value.trim()) {
          baseUrlInput.value = "https://api.openai.com/v1";
        } else if (target.value === "anthropic" && !baseUrlInput.value.trim()) {
          baseUrlInput.value = "https://api.anthropic.com/v1";
        }
      }
      saveConfig();
    });
  });

  document.querySelectorAll<HTMLInputElement>('input[name="reasoning-effort"]').forEach((radio) => {
    radio.addEventListener("change", saveConfig);
  });

  // Reset button
  btnReset.addEventListener("click", resetConfig);
}
