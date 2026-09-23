import { STORAGE_KEY } from "../constants";
import type { ClientConfig } from "../types";
import {
  baseUrlInput,
  apiKeyInput,
  modelNameInput,
  temperatureInput,
  timeoutInput,
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
} from "./dom";

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function updateSettingsSummary(): void {
  const format = getActiveEndpointFormat();
  const formatName = format === "anthropic" ? "Claude Messages" : "OpenAI 端点";
  settingsSummary.textContent = formatName;
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
    temperature: temperatureInput.value.trim(),
    timeout: timeoutInput.value.trim(),
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
    if (config.temperature) temperatureInput.value = config.temperature;
    if (config.timeout) timeoutInput.value = config.timeout;
    if (config.apiFormat) {
      setEndpointFormatRadio(config.apiFormat);
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
    temperatureInput.value = "";
    timeoutInput.value = "180";
    setEndpointFormatRadio("openai");
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
  [baseUrlInput, apiKeyInput, modelNameInput, temperatureInput, timeoutInput].forEach((el) => {
    el.addEventListener("input", saveConfig);
  });

  document.querySelectorAll<HTMLInputElement>('input[name="endpoint-format"]').forEach((radio) => {
    radio.addEventListener("change", saveConfig);
  });

  // Reset button
  btnReset.addEventListener("click", resetConfig);
}
