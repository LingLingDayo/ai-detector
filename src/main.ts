import { generateChallenges, type Challenge } from "./utils/challenge";
import {
  parseNumbers,
  analyzeGlobalOutputs,
  type UnifiedBank,
  type GlobalAnalysisResult,
  type ProbeOutputItem,
} from "./utils/fingerprint";
import rawUnifiedBank from "./data/unified_bank.json";

const unifiedBank = rawUnifiedBank as unknown as UnifiedBank;

const STORAGE_KEY = "modeltrace_client_config";

// Default recommended models
const DEFAULT_MODELS: readonly string[] = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.5-preview",
  "o1",
  "o3-mini",
  "claude-3-5-sonnet-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-3-5-haiku-20241022",
  "deepseek-chat",
  "deepseek-reasoner",
];

interface ClientConfig {
  baseUrl: string;
  apiKey: string;
  apiFormat: string;
  modelName: string;
  temperature: string;
  timeout: string;
}

interface SendProbeOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  apiFormat: string;
  temperature: number | null;
  timeoutSeconds: number;
}

interface ProbeResponse {
  text: string;
  raw_status: number;
  duration_ms: number;
}

type TauriInvokeFn = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

// DOM Elements
const form = document.getElementById("test-form") as HTMLFormElement;
const baseUrlInput = document.getElementById("base-url") as HTMLInputElement;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const toggleKeyBtn = document.getElementById("toggle-key-visibility") as HTMLButtonElement;
const eyeOpenIcon = toggleKeyBtn.querySelector(".eye-open") as SVGElement;
const eyeClosedIcon = toggleKeyBtn.querySelector(".eye-closed") as SVGElement;

const comboboxWrapper = document.getElementById("combobox-wrapper") as HTMLDivElement;
const modelNameInput = document.getElementById("model-name") as HTMLInputElement;
const btnFetchModels = document.getElementById("btn-fetch-models") as HTMLButtonElement;
const refreshIcon = btnFetchModels.querySelector(".refresh-icon") as SVGElement;
const btnToggleDropdown = document.getElementById("btn-toggle-dropdown") as HTMLButtonElement;
const modelDropdown = document.getElementById("model-dropdown") as HTMLDivElement;
const dropdownSearch = document.getElementById("dropdown-search") as HTMLInputElement;
const dropdownStatusBar = document.getElementById("dropdown-status-bar") as HTMLDivElement;
const dropdownList = document.getElementById("dropdown-list") as HTMLUListElement;

const toggleAdvancedBtn = document.getElementById("toggle-advanced") as HTMLButtonElement;
const advancedPanel = document.getElementById("advanced-panel") as HTMLDivElement;
const settingsSummary = document.getElementById("settings-summary") as HTMLSpanElement;
const temperatureInput = document.getElementById("temperature") as HTMLInputElement;
const timeoutInput = document.getElementById("timeout") as HTMLInputElement;
const saveTip = document.getElementById("save-tip") as HTMLSpanElement;
const btnStart = document.getElementById("btn-start") as HTMLButtonElement;
const startSpinner = document.getElementById("start-spinner") as HTMLSpanElement;
const btnReset = document.getElementById("btn-reset") as HTMLButtonElement;

const progressSection = document.getElementById("progress-section") as HTMLElement;
const progressTitle = document.getElementById("progress-title") as HTMLHeadingElement;
const progressStatusDesc = document.getElementById("progress-status-desc") as HTMLSpanElement;
const progressPercent = document.getElementById("progress-percent") as HTMLSpanElement;
const progressCountText = document.getElementById("progress-count-text") as HTMLElement;
const progressBarFill = document.getElementById("progress-bar-fill") as HTMLDivElement;
const statusAlert = document.getElementById("status-alert") as HTMLDivElement;

const resultSection = document.getElementById("result-section") as HTMLElement;
const winnerName = document.getElementById("winner-name") as HTMLElement;
const winnerProb = document.getElementById("winner-prob") as HTMLSpanElement;
const familyName = document.getElementById("family-name") as HTMLElement;
const familyProb = document.getElementById("family-prob") as HTMLSpanElement;
const validSamples = document.getElementById("valid-samples") as HTMLElement;
const diagnosticsBar = document.getElementById("diagnostics-bar") as HTMLDivElement;
const resultsTbody = document.getElementById("results-tbody") as HTMLTableSectionElement;
const bankBadge = document.getElementById("bank-badge") as HTMLSpanElement;

let availableModels: string[] = [...DEFAULT_MODELS];
let isFetchedFromApi = false;
let isFetchingModels = false;

// Initialize Tauri invoke
let tauriInvoke: TauriInvokeFn | null = null;
async function initTauri(): Promise<void> {
  try {
    const tauriApi = await import("@tauri-apps/api/core");
    if (tauriApi && typeof tauriApi.invoke === "function") {
      tauriInvoke = tauriApi.invoke as TauriInvokeFn;
    }
  } catch {
    console.info("Running in standard Web environment");
  }
}

// --------------------------------------------------------------------------
// Config Persistence
// --------------------------------------------------------------------------
function getActiveEndpointFormat(): string {
  const checked = document.querySelector<HTMLInputElement>('input[name="endpoint-format"]:checked');
  return checked ? checked.value : "openai";
}

function updateSettingsSummary(): void {
  const format = getActiveEndpointFormat();
  const formatName = format === "anthropic" ? "Claude Messages" : "OpenAI 端点";
  settingsSummary.textContent = formatName;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function triggerSaveTip(): void {
  saveTip.classList.add("saved");
  saveTip.textContent = "已自动保存配置 ✓";
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTip.classList.remove("saved");
    saveTip.textContent = "已自动保存配置";
  }, 2000);
}

function saveConfig(): void {
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

function loadConfig(): void {
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
      const radio = document.querySelector<HTMLInputElement>(`input[name="endpoint-format"][value="${config.apiFormat}"]`);
      if (radio) radio.checked = true;
    }
    updateSettingsSummary();
  } catch (err) {
    console.warn("加载保存配置失败:", err);
  }
}

function resetConfig(): void {
  if (confirm("确定要清空已保存的 Base URL 和 API Key 等配置吗？")) {
    localStorage.removeItem(STORAGE_KEY);
    baseUrlInput.value = "";
    apiKeyInput.value = "";
    modelNameInput.value = "gpt-4o";
    temperatureInput.value = "";
    timeoutInput.value = "180";
    const defaultRadio = document.querySelector<HTMLInputElement>('input[name="endpoint-format"][value="openai"]');
    if (defaultRadio) defaultRadio.checked = true;
    updateSettingsSummary();
    triggerSaveTip();
  }
}

// --------------------------------------------------------------------------
// Model Dropdown Component
// --------------------------------------------------------------------------
function renderModelList(filter = ""): void {
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

function openDropdown(): void {
  comboboxWrapper.classList.add("combobox-open");
  modelDropdown.classList.remove("hidden");
  dropdownSearch.value = "";
  renderModelList();
  dropdownSearch.focus();
}

function closeDropdown(): void {
  comboboxWrapper.classList.remove("combobox-open");
  modelDropdown.classList.add("hidden");
}

function toggleDropdown(): void {
  if (modelDropdown.classList.contains("hidden")) {
    openDropdown();
    if (!isFetchedFromApi && baseUrlInput.value.trim() && apiKeyInput.value.trim()) {
      void fetchModelsList();
    }
  } else {
    closeDropdown();
  }
}

async function fetchModelsList(): Promise<void> {
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
    let list: string[] = [];
    if (tauriInvoke) {
      list = await tauriInvoke<string[]>("fetch_models_list", {
        baseUrl,
        apiKey,
        apiFormat,
      });
    } else {
      // Browser fallback
      let endpoint = baseUrl.replace(/\/+$/, "");
      if (endpoint.endsWith("/chat/completions")) {
        endpoint = endpoint.replace(/\/chat\/completions$/, "/models");
      } else if (endpoint.endsWith("/messages")) {
        endpoint = endpoint.replace(/\/messages$/, "/models");
      } else if (endpoint.endsWith("/v1")) {
        endpoint += "/models";
      } else {
        endpoint += "/v1/models";
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      };
      if (apiFormat === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      }

      const res = await fetch(endpoint, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      list = (data.data || []).map((item) => item.id).filter(Boolean);
    }

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

// Model dropdown event listeners
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
      const claudeRadio = document.querySelector<HTMLInputElement>('input[name="endpoint-format"][value="anthropic"]');
      if (claudeRadio) claudeRadio.checked = true;
    } else {
      const openaiRadio = document.querySelector<HTMLInputElement>('input[name="endpoint-format"][value="openai"]');
      if (openaiRadio) openaiRadio.checked = true;
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

// --------------------------------------------------------------------------
// UI Event Handlers
// --------------------------------------------------------------------------
toggleKeyBtn.addEventListener("click", () => {
  const isPassword = apiKeyInput.type === "password";
  apiKeyInput.type = isPassword ? "text" : "password";
  eyeOpenIcon.classList.toggle("hidden", isPassword);
  eyeClosedIcon.classList.toggle("hidden", !isPassword);
});

toggleAdvancedBtn.addEventListener("click", () => {
  const isOpen = !advancedPanel.classList.contains("hidden");
  advancedPanel.classList.toggle("hidden", isOpen);
  toggleAdvancedBtn.classList.toggle("open", !isOpen);
});

[baseUrlInput, apiKeyInput, modelNameInput, temperatureInput, timeoutInput].forEach((el) => {
  el.addEventListener("input", saveConfig);
});

document.querySelectorAll<HTMLInputElement>('input[name="endpoint-format"]').forEach((radio) => {
  radio.addEventListener("change", saveConfig);
});

btnReset.addEventListener("click", resetConfig);

// --------------------------------------------------------------------------
// Probe Request (IPC / Web Fetch fallback)
// --------------------------------------------------------------------------
async function sendProbe({
  baseUrl,
  apiKey,
  model,
  prompt,
  apiFormat,
  temperature,
  timeoutSeconds,
}: SendProbeOptions): Promise<ProbeResponse> {
  if (tauriInvoke) {
    return await tauriInvoke<ProbeResponse>("send_probe_request", {
      req: {
        base_url: baseUrl,
        api_key: apiKey,
        model,
        prompt,
        api_format: apiFormat,
        temperature: temperature !== null ? temperature : undefined,
        timeout_seconds: timeoutSeconds,
      },
    });
  }

  // Web fallback for browser preview
  let endpoint = baseUrl.replace(/\/+$/, "");
  if (apiFormat === "anthropic") {
    endpoint += endpoint.endsWith("/messages") ? "" : (endpoint.endsWith("/v1") ? "/messages" : "/v1/messages");
  } else {
    endpoint += endpoint.endsWith("/chat/completions") ? "" : (endpoint.endsWith("/v1") ? "/chat/completions" : "/v1/chat/completions");
  }

  const startTime = Date.now();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  interface RequestBody {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
  }

  let bodyObj: RequestBody;

  if (apiFormat === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["Authorization"] = `Bearer ${apiKey}`;
    bodyObj = {
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    };
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
    bodyObj = {
      model,
      messages: [{ role: "user", content: prompt }],
    };
  }
  if (temperature !== null) bodyObj.temperature = temperature;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObj),
  });

  const durationMs = Date.now() - startTime;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`上游接口返回错误 (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  let text = "";
  if (apiFormat === "anthropic") {
    text = (json.content || []).map((c) => c.text || "").join("");
  } else {
    text = json.choices?.[0]?.message?.content || "";
  }

  return { text, raw_status: res.status, duration_ms: durationMs };
}

// --------------------------------------------------------------------------
// Testing Execution & Progress Controller
// --------------------------------------------------------------------------
function updateStepUI(index: number, state: "pending" | "working" | "done" | "error", text: string, stat = ""): void {
  const stepEl = document.getElementById(`step-${index}`);
  if (!stepEl) return;
  stepEl.className = `probe-step ${state}`;
  const stateEl = stepEl.querySelector(".step-state");
  const statEl = stepEl.querySelector(".step-stat");
  if (stateEl) stateEl.textContent = text;
  if (statEl) statEl.textContent = stat;
}

function setProgress(completedCount: number, totalCount = 3, message = ""): void {
  const percent = Math.min(100, Math.round((completedCount / totalCount) * 100));
  progressBarFill.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressCountText.textContent = `完成 ${completedCount}/${totalCount} 题`;
  if (message) progressStatusDesc.textContent = message;
}

function showStatusAlert(msg: string, type: "error" | "warning" = "error"): void {
  statusAlert.className = `status-alert ${type}`;
  statusAlert.textContent = msg;
  statusAlert.classList.remove("hidden");
}

function hideStatusAlert(): void {
  statusAlert.classList.add("hidden");
}

function escapeHtml(str: string): string {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[c] || c);
}

function percentFormat(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function renderResults(analysis: GlobalAnalysisResult): void {
  winnerName.textContent = analysis.prediction_name || analysis.prediction;
  winnerProb.textContent = `全局概率 ${percentFormat(analysis.probability)}`;
  familyName.textContent = analysis.family_prediction_name || analysis.family_prediction;
  familyProb.textContent = `家族综合 ${percentFormat(analysis.family_probability)}`;
  validSamples.textContent = `${analysis.used_outputs} / 3`;

  // Diagnostics Bar
  diagnosticsBar.innerHTML = analysis.diagnostics
    .map(
      (d) =>
        `<span class="diag-pill ${d.accepted ? "accepted" : "rejected"}" title="预期基准: 需至少 ${d.minimum_numbers} 个有效整数">
          挑战 ${d.index + 1}: ${d.parsed_numbers} 个数字 · ${d.accepted ? "计入" : "忽略"}
        </span>`
    )
    .join("");

  // Results Table Rows
  resultsTbody.innerHTML = analysis.results
    .map((item, idx) => {
      const isWinner = idx === 0;
      const probPercent = (item.probability * 100).toFixed(1);
      return `
        <tr class="${isWinner ? "winner-row" : ""}">
          <td><span class="rank-pill">${idx + 1}</span></td>
          <td>
            <strong>${escapeHtml(item.display_name)}</strong>
            ${isWinner ? '<span class="badge badge-success" style="margin-left:6px">最佳归因</span>' : ""}
          </td>
          <td><span class="family-tag">${escapeHtml(item.family_name)}</span></td>
          <td>
            <div class="prob-cell">
              <div class="prob-bar-track">
                <div class="prob-bar-fill" style="width: ${probPercent}%"></div>
              </div>
              <span class="prob-val">${probPercent}%</span>
            </div>
          </td>
          <td><span class="similarity-val">${percentFormat(item.profile_similarity)}</span></td>
        </tr>
      `;
    })
    .join("");

  resultSection.classList.remove("hidden");
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// --------------------------------------------------------------------------
// Main Start Test Handler
// --------------------------------------------------------------------------
form.addEventListener("submit", async (e: SubmitEvent) => {
  e.preventDefault();

  const baseUrl = baseUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const model = modelNameInput.value.trim() || "gpt-4o";
  const apiFormat = getActiveEndpointFormat();
  const tempVal = temperatureInput.value.trim();
  const temperature = tempVal !== "" ? parseFloat(tempVal) : null;
  const timeoutSeconds = parseInt(timeoutInput.value.trim(), 10) || 180;

  if (!baseUrl || !apiKey) {
    alert("请填写 Base URL 和 API Key！");
    return;
  }

  saveConfig();
  closeDropdown();

  // Reset UI
  btnStart.disabled = true;
  startSpinner.classList.remove("hidden");
  hideStatusAlert();
  resultSection.classList.add("hidden");
  progressSection.classList.remove("hidden");

  progressTitle.textContent = "探测测试进行中";
  setProgress(0, 3, "正在初始化 3 组长整数挑战探针...");

  for (let i = 0; i < 3; i++) {
    updateStepUI(i, "pending", "等待中", "-");
  }

  // Generate 3 randomized questions
  const challenges: Challenge[] = generateChallenges(3);
  const outputs: ProbeOutputItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < challenges.length; i++) {
    const challenge = challenges[i];
    updateStepUI(i, "working", "请求中...", "执行");
    setProgress(i, 3, `正在执行第 ${i + 1}/3 题，等待模型完整序列...`);

    try {
      const response = await sendProbe({
        baseUrl,
        apiKey,
        model,
        prompt: challenge.prompt,
        apiFormat,
        temperature,
        timeoutSeconds,
      });

      const parsedNumbers = parseNumbers(response.text);
      const minimum = Math.max(80, Math.ceil(challenge.expected_count * 0.55));
      const accepted = parsedNumbers.length >= minimum;

      if (accepted) {
        updateStepUI(i, "done", "已采纳", `${parsedNumbers.length} 个数字`);
        outputs.push({
          text: response.text,
          expected_count: challenge.expected_count,
        });
      } else {
        updateStepUI(i, "error", "数字不足", `${parsedNumbers.length}/${minimum}`);
        errors.push(`第 ${i + 1} 题: 仅解析到 ${parsedNumbers.length} 个有效整数（需至少 ${minimum} 个）`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`第 ${i + 1} 题请求失败:`, err);
      updateStepUI(i, "error", "失败", "错误");
      errors.push(`第 ${i + 1} 题失败: ${errMsg}`);
    }

    // Update progress bar immediately after each probe!
    const finishedProbes = i + 1;
    setProgress(
      finishedProbes,
      3,
      finishedProbes < 3
        ? `第 ${finishedProbes} 题已完成，进入下一题...`
        : "3 题测试完成，正在计算模型归因..."
    );
  }

  // Finish evaluation
  if (outputs.length === 0) {
    progressTitle.textContent = "未获得有效样本";
    progressStatusDesc.textContent = "3 题测试均未能获取合规输出，请检查错误原因。";
    showStatusAlert(errors.join("；\n") || "未获得任何可分析输出。");
  } else {
    progressTitle.textContent = "测试完成";
    progressStatusDesc.textContent = `成功采纳 ${outputs.length}/3 份有效输出样本`;
    try {
      const analysis = analyzeGlobalOutputs(outputs, unifiedBank);
      renderResults(analysis);
    } catch (analysisErr: unknown) {
      const errMsg = analysisErr instanceof Error ? analysisErr.message : String(analysisErr);
      showStatusAlert(`归因计算异常: ${errMsg}`);
    }
  }

  btnStart.disabled = false;
  startSpinner.classList.add("hidden");
});

// --------------------------------------------------------------------------
// App Initialization
// --------------------------------------------------------------------------
async function init(): Promise<void> {
  await initTauri();
  loadConfig();
  if (unifiedBank && unifiedBank.models) {
    bankBadge.innerHTML = `<span class="badge-dot"></span> ${unifiedBank.models.length} 个模型已就绪`;
  }
}

void init();
