import { DEFAULT_MODELS } from "../constants";
import { fetchRemoteModels } from "../services/api";
import { saveConfig } from "./config";
import {
  baseUrlInput,
  apiKeyInput,
  comboboxWrapper,
  modelNameInput,
  btnFetchModels,
  refreshIcon,
  btnToggleDropdown,
  modelDropdown,
  dropdownSearch,
  dropdownStatusBar,
  dropdownList,
  getActiveEndpointFormat,
  setEndpointFormatRadio,
} from "./dom";
import { escapeHtml } from "./render";

let availableModels: string[] = [...DEFAULT_MODELS];
let isFetchedFromApi = false;
let isFetchingModels = false;

export function renderModelList(filter = ""): void {
  const query = filter.trim().toLowerCase();
  const filtered = availableModels.filter((m) => m.toLowerCase().includes(query));
  const currentModel = modelNameInput.value.trim();

  if (filtered.length === 0) {
    dropdownList.innerHTML = `<li class="dropdown-empty">未匹配到模型，支持直接在上方输入</li>`;
    return;
  }

  dropdownList.innerHTML = filtered
    .map((m) => {
      const isSelected = m === currentModel;
      return `
        <li class="dropdown-item ${isSelected ? "selected" : ""}" data-model="${escapeHtml(m)}">
          <span>${escapeHtml(m)}</span>
          ${isSelected ? '<span style="font-size:0.75rem">✓</span>' : ""}
        </li>
      `;
    })
    .join("");
}

export function openDropdown(): void {
  comboboxWrapper.classList.add("combobox-open");
  modelDropdown.classList.remove("hidden");
  dropdownSearch.value = "";
  renderModelList();
  dropdownSearch.focus();
}

export function closeDropdown(): void {
  comboboxWrapper.classList.remove("combobox-open");
  modelDropdown.classList.add("hidden");
}

export function toggleDropdown(): void {
  if (modelDropdown.classList.contains("hidden")) {
    openDropdown();
    if (!isFetchedFromApi && baseUrlInput.value.trim() && apiKeyInput.value.trim()) {
      void fetchModelsList();
    }
  } else {
    closeDropdown();
  }
}

export async function fetchModelsList(): Promise<void> {
  const baseUrl = baseUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const apiFormat = getActiveEndpointFormat();

  if (!baseUrl || !apiKey) {
    dropdownStatusBar.innerHTML = `<span>请先填写 Base URL 和 API Key 以获取模型</span>`;
    return;
  }

  if (isFetchingModels) return;
  isFetchingModels = true;
  refreshIcon.classList.add("spinning");
  dropdownStatusBar.innerHTML = `<span>正在从 /v1/models 拉取可用模型列表...</span>`;

  try {
    const list = await fetchRemoteModels(baseUrl, apiKey, apiFormat);

    if (list && list.length > 0) {
      availableModels = list;
      isFetchedFromApi = true;
      dropdownStatusBar.innerHTML = `<span style="color:var(--success)">已成功获取 ${list.length} 个模型</span>`;
    } else {
      dropdownStatusBar.innerHTML = `<span>上游未返回可用模型列表，仍可手动输入</span>`;
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("获取模型列表异常:", err);
    dropdownStatusBar.innerHTML = `<span>获取失败(${errMsg || "请求受限"})，可手动输入</span>`;
  } finally {
    isFetchingModels = false;
    refreshIcon.classList.remove("spinning");
    renderModelList(dropdownSearch.value);
  }
}

export function initModelDropdown(): void {
  btnToggleDropdown.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  btnFetchModels.addEventListener("click", (e) => {
    e.stopPropagation();
    if (modelDropdown.classList.contains("hidden")) {
      openDropdown();
    }
    void fetchModelsList();
  });

  dropdownSearch.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    renderModelList(target.value);
  });

  dropdownList.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLLIElement>(".dropdown-item");
    if (item && item.dataset.model) {
      const selected = item.dataset.model;
      modelNameInput.value = selected;
      if (selected.toLowerCase().includes("claude")) {
        setEndpointFormatRadio("anthropic");
      } else {
        setEndpointFormatRadio("openai");
      }
      saveConfig();
      closeDropdown();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!comboboxWrapper.contains(e.target as Node)) {
      closeDropdown();
    }
  });
}
