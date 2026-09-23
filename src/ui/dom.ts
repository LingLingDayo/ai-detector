// Centralized DOM Element references and queries

export const form = document.getElementById("test-form") as HTMLFormElement;
export const baseUrlInput = document.getElementById("base-url") as HTMLInputElement;
export const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
export const toggleKeyBtn = document.getElementById("toggle-key-visibility") as HTMLButtonElement;
export const eyeOpenIcon = toggleKeyBtn.querySelector(".eye-open") as SVGElement;
export const eyeClosedIcon = toggleKeyBtn.querySelector(".eye-closed") as SVGElement;

export const comboboxWrapper = document.getElementById("combobox-wrapper") as HTMLDivElement;
export const modelNameInput = document.getElementById("model-name") as HTMLInputElement;
export const btnFetchModels = document.getElementById("btn-fetch-models") as HTMLButtonElement;
export const refreshIcon = btnFetchModels.querySelector(".refresh-icon") as SVGElement;
export const btnToggleDropdown = document.getElementById("btn-toggle-dropdown") as HTMLButtonElement;
export const modelDropdown = document.getElementById("model-dropdown") as HTMLDivElement;
export const dropdownSearch = document.getElementById("dropdown-search") as HTMLInputElement;
export const dropdownStatusBar = document.getElementById("dropdown-status-bar") as HTMLDivElement;
export const dropdownList = document.getElementById("dropdown-list") as HTMLUListElement;

export const toggleAdvancedBtn = document.getElementById("toggle-advanced") as HTMLButtonElement;
export const advancedPanel = document.getElementById("advanced-panel") as HTMLDivElement;
export const settingsSummary = document.getElementById("settings-summary") as HTMLSpanElement;
export const temperatureInput = document.getElementById("temperature") as HTMLInputElement;
export const timeoutInput = document.getElementById("timeout") as HTMLInputElement;
export const saveTip = document.getElementById("save-tip") as HTMLSpanElement;
export const btnStart = document.getElementById("btn-start") as HTMLButtonElement;
export const startSpinner = document.getElementById("start-spinner") as HTMLSpanElement;
export const btnReset = document.getElementById("btn-reset") as HTMLButtonElement;

export const progressSection = document.getElementById("progress-section") as HTMLElement;
export const progressTitle = document.getElementById("progress-title") as HTMLHeadingElement;
export const progressStatusDesc = document.getElementById("progress-status-desc") as HTMLSpanElement;
export const progressPercent = document.getElementById("progress-percent") as HTMLSpanElement;
export const progressCountText = document.getElementById("progress-count-text") as HTMLElement;
export const progressBarFill = document.getElementById("progress-bar-fill") as HTMLDivElement;
export const statusAlert = document.getElementById("status-alert") as HTMLDivElement;

export const resultSection = document.getElementById("result-section") as HTMLElement;
export const winnerName = document.getElementById("winner-name") as HTMLElement;
export const winnerProb = document.getElementById("winner-prob") as HTMLSpanElement;
export const familyName = document.getElementById("family-name") as HTMLElement;
export const familyProb = document.getElementById("family-prob") as HTMLSpanElement;
export const validSamples = document.getElementById("valid-samples") as HTMLElement;
export const diagnosticsBar = document.getElementById("diagnostics-bar") as HTMLDivElement;
export const resultsTbody = document.getElementById("results-tbody") as HTMLTableSectionElement;
export const bankBadge = document.getElementById("bank-badge") as HTMLSpanElement;

export function getActiveEndpointFormat(): string {
  const checked = document.querySelector<HTMLInputElement>('input[name="endpoint-format"]:checked');
  return checked ? checked.value : "openai";
}

export function setEndpointFormatRadio(format: string): void {
  const radio = document.querySelector<HTMLInputElement>(
    `input[name="endpoint-format"][value="${format}"]`
  );
  if (radio) {
    radio.checked = true;
  }
}
