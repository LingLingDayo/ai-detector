import { generateChallenges } from "./utils/challenge.js";
import { parseNumbers, analyzeGlobalOutputs } from "./utils/fingerprint.js";
import unifiedBank from "./data/unified_bank.json";

const STORAGE_KEY = "modeltrace_client_config";

// Default recommended models
const DEFAULT_MODELS = [
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

// DOM Elements
const form = document.getElementById("test-form");
const baseUrlInput = document.getElementById("base-url");
const apiKeyInput = document.getElementById("api-key");
const toggleKeyBtn = document.getElementById("toggle-key-visibility");
const eyeOpenIcon = toggleKeyBtn.querySelector(".eye-open");
const eyeClosedIcon = toggleKeyBtn.querySelector(".eye-closed");

const comboboxWrapper = document.getElementById("combobox-wrapper");
const modelNameInput = document.getElementById("model-name");
const btnFetchModels = document.getElementById("btn-fetch-models");
const refreshIcon = btnFetchModels.querySelector(".refresh-icon");
const btnToggleDropdown = document.getElementById("btn-toggle-dropdown");
const modelDropdown = document.getElementById("model-dropdown");
const dropdownSearch = document.getElementById("dropdown-search");
const dropdownStatusBar = document.getElementById("dropdown-status-bar");
const dropdownList = document.getElementById("dropdown-list");

const toggleAdvancedBtn = document.getElementById("toggle-advanced");
const advancedPanel = document.getElementById("advanced-panel");
const settingsSummary = document.getElementById("settings-summary");
const temperatureInput = document.getElementById("temperature");
const timeoutInput = document.getElementById("timeout");
const saveTip = document.getElementById("save-tip");
const btnStart = document.getElementById("btn-start");
const startSpinner = document.getElementById("start-spinner");
const btnReset = document.getElementById("btn-reset");

const progressSection = document.getElementById("progress-section");
const progressTitle = document.getElementById("progress-title");
const progressStatusDesc = document.getElementById("progress-status-desc");
const progressPercent = document.getElementById("progress-percent");
const progressCountText = document.getElementById("progress-count-text");
const progressBarFill = document.getElementById("progress-bar-fill");
const statusAlert = document.getElementById("status-alert");

const resultSection = document.getElementById("result-section");
const winnerName = document.getElementById("winner-name");
const winnerProb = document.getElementById("winner-prob");
const familyName = document.getElementById("family-name");
const familyProb = document.getElementById("family-prob");
const validSamples = document.getElementById("valid-samples");
const diagnosticsBar = document.getElementById("diagnostics-bar");
const resultsTbody = document.getElementById("results-tbody");
const bankBadge = document.getElementById("bank-badge");

let availableModels = [...DEFAULT_MODELS];
let isFetchedFromApi = false;
let isFetchingModels = false;

// Initialize Tauri invoke
let tauriInvoke = null;
async function initTauri() {
  try {
    const tauriApi = await import("@tauri-apps/api/core");
    if (tauriApi && typeof tauriApi.invoke === "function") {
      tauriInvoke = tauriApi.invoke;
    }
  } catch {
    console.info("Running in standard Web environment");
  }
}

// --------------------------------------------------------------------------
// Config Persistence
// --------------------------------------------------------------------------
function getActiveEndpointFormat() {
  const checked = document.querySelector('input[name="endpoint-format"]:checked');
  return checked ? checked.value : "openai";
}

function updateSettingsSummary() {
  const format = getActiveEndpointFormat();
  const formatName = format === "anthropic" ? "Claude Messages" : "OpenAI 端点";
  settingsSummary.textContent = formatName;
}

let saveTimer = null;
function triggerSaveTip() {
  saveTip.classList.add("saved");
  saveTip.textContent = "已自动保存配置 ✓";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTip.classList.remove("saved");
    saveTip.textContent = "已自动保存配置";
  }, 2000);
}

function saveConfig() {
  const config = {
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

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const config = JSON.parse(raw);
    if (config.baseUrl) baseUrlInput.value = config.baseUrl;
    if (config.apiKey) apiKeyInput.value = config.apiKey;
    if (config.modelName) modelNameInput.value = config.modelName;
    if (config.temperature) temperatureInput.value = config.temperature;
    if (config.timeout) timeoutInput.value = config.timeout;
    if (config.apiFormat) {
      const radio = document.querySelector(`input[name="endpoint-format"][value="${config.apiFormat}"]`);
      if (radio) radio.checked = true;
    }
    updateSettingsSummary();
  } catch (err) {
    console.warn("加载保存配置失败:", err);
  }
}

function resetConfig() {
  if (confirm("确定要清空已保存的 Base URL 和 API Key 等配置吗？")) {
    localStorage.removeItem(STORAGE_KEY);
    baseUrlInput.value = "";
    apiKeyInput.value = "";
    modelNameInput.value = "gpt-4o";
    temperatureInput.value = "";
    timeoutInput.value = "180";
    const defaultRadio = document.querySelector('input[name="endpoint-format"][value="openai"]');
    if (defaultRadio) defaultRadio.checked = true;
    updateSettingsSummary();
    triggerSaveTip();
  }
}

// --------------------------------------------------------------------------
// Model Dropdown Component
// --------------------------------------------------------------------------
function renderModelList(filter = "") {
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

function openDropdown() {
  comboboxWrapper.classList.add("combobox-open");
  modelDropdown.classList.remove("hidden");
  dropdownSearch.value = "";
  renderModelList();
  dropdownSearch.focus();
}

function closeDropdown() {
  comboboxWrapper.classList.remove("combobox-open");
  modelDropdown.classList.add("hidden");
}

function toggleDropdown() {
  if (modelDropdown.classList.contains("hidden")) {
    openDropdown();
    if (!isFetchedFromApi && baseUrlInput.value.trim() && apiKeyInput.value.trim()) {
      fetchModelsList();
    }
  } else {
    closeDropdown();
  }
}

async function fetchModelsList() {
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
    let list = [];
    if (tauriInvoke) {
      list = await tauriInvoke("fetch_models_list", {
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

      const headers = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      };
      if (apiFormat === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      }

      const res = await fetch(endpoint, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      list = (data.data || []).map((item) => item.id).filter(Boolean);
    }

    if (list && list.length > 0) {
      availableModels = list;
      isFetchedFromApi = true;
      dropdownStatusBar.innerHTML = `<span style="color:var(--success)">已成功获取 ${list.length} 个模型</span>`;
    } else {
      dropdownStatusBar.innerHTML = `<span>上游未返回可用模型列表，仍可手动输入</span>`;
    }
  } catch (err) {
    console.warn("获取模型列表异常:", err);
    dropdownStatusBar.innerHTML = `<span>获取失败(${err.message || "请求受限"})，可手动输入</span>`;
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
  fetchModelsList();
});

dropdownSearch.addEventListener("input", (e) => {
  renderModelList(e.target.value);
});

dropdownList.addEventListener("click", (e) => {
  const item = e.target.closest(".dropdown-item");
  if (item && item.dataset.model) {
    const selected = item.dataset.model;
    modelNameInput.value = selected;
    if (selected.toLowerCase().includes("claude")) {
      const claudeRadio = document.querySelector('input[name="endpoint-format"][value="anthropic"]');
      if (claudeRadio) claudeRadio.checked = true;
    } else {
      const openaiRadio = document.querySelector('input[name="endpoint-format"][value="openai"]');
      if (openaiRadio) openaiRadio.checked = true;
    }
    saveConfig();
    closeDropdown();
  }
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!comboboxWrapper.contains(e.target)) {
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

document.querySelectorAll('input[name="endpoint-format"]').forEach((radio) => {
  radio.addEventListener("change", saveConfig);
});

btnReset.addEventListener("click", resetConfig);

// --------------------------------------------------------------------------
// Probe Request (IPC / Web Fetch fallback)
// --------------------------------------------------------------------------
async function sendProbe({ baseUrl, apiKey, model, prompt, apiFormat, temperature, timeoutSeconds }) {
  if (tauriInvoke) {
    return await tauriInvoke("send_probe_request", {
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
  const headers = { "Content-Type": "application/json" };
  let bodyObj;

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

  const json = await res.json();
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
function updateStepUI(index, state, text, stat = "") {
  const stepEl = document.getElementById(`step-${index}`);
  if (!stepEl) return;
  stepEl.className = `probe-step ${state}`;
  const stateEl = stepEl.querySelector(".step-state");
  const statEl = stepEl.querySelector(".step-stat");
  if (stateEl) stateEl.textContent = text;
  if (statEl) statEl.textContent = stat;
}

function setProgress(completedCount, totalCount = 3, message = "") {
  const percent = Math.min(100, Math.round((completedCount / totalCount) * 100));
  progressBarFill.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressCountText.textContent = `完成 ${completedCount}/${totalCount} 题`;
  if (message) progressStatusDesc.textContent = message;
}

function showStatusAlert(msg, type = "error") {
  statusAlert.className = `status-alert ${type}`;
  statusAlert.textContent = msg;
  statusAlert.classList.remove("hidden");
}

function hideStatusAlert() {
  statusAlert.classList.add("hidden");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[c]);
}

function percentFormat(val) {
  return `${(val * 100).toFixed(1)}%`;
}

function renderResults(analysis) {
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
form.addEventListener("submit", async (e) => {
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
  const challenges = generateChallenges(3);
  const outputs = [];
  const errors = [];

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
    } catch (err) {
      console.error(`第 ${i + 1} 题请求失败:`, err);
      updateStepUI(i, "error", "失败", "错误");
      errors.push(`第 ${i + 1} 题失败: ${err.message || err}`);
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
    } catch (analysisErr) {
      showStatusAlert(`归因计算异常: ${analysisErr.message}`);
    }
  }

  btnStart.disabled = false;
  startSpinner.classList.add("hidden");
});

// --------------------------------------------------------------------------
// App Initialization
// --------------------------------------------------------------------------
async function init() {
  await initTauri();
  loadConfig();
  if (unifiedBank && unifiedBank.models) {
    bankBadge.innerHTML = `<span class="badge-dot"></span> ${unifiedBank.models.length} 个模型已就绪`;
  }
}

init();
