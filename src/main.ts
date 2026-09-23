import { generateChallenges, type Challenge } from "./utils/challenge";
import {
  parseNumbers,
  analyzeGlobalOutputs,
  type UnifiedBank,
  type ProbeOutputItem,
} from "./utils/fingerprint";
import rawUnifiedBank from "./data/unified_bank.json";

import { initTauri, sendProbe } from "./services/api";
import {
  form,
  baseUrlInput,
  apiKeyInput,
  modelNameInput,
  temperatureInput,
  timeoutInput,
  progressSection,
  progressTitle,
  progressStatusDesc,
  resultSection,
  getActiveEndpointFormat,
} from "./ui/dom";
import {
  saveConfig,
  loadConfig,
  initConfigHandlers,
} from "./ui/config";
import {
  closeDropdown,
  initModelDropdown,
} from "./ui/dropdown";
import {
  updateStepUI,
  setProgress,
  showStatusAlert,
  hideStatusAlert,
  setTestLoadingState,
  renderBankBadge,
  renderResults,
} from "./ui/render";

const unifiedBank = rawUnifiedBank as unknown as UnifiedBank;

// --------------------------------------------------------------------------
// Test Execution Workflow
// --------------------------------------------------------------------------
async function handleTestSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault();

  const baseUrl = baseUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const model = modelNameInput.value.trim();
  const apiFormat = getActiveEndpointFormat();
  const tempVal = temperatureInput.value.trim();
  const temperature = tempVal !== "" ? parseFloat(tempVal) : null;
  const timeoutSeconds = parseInt(timeoutInput.value.trim(), 10) || 180;

  if (!baseUrl || !apiKey) {
    alert("请填写 Base URL 和 API Key！");
    return;
  }

  if (!model) {
    alert("请填写或选择待测模型 ID！");
    return;
  }

  saveConfig();
  closeDropdown();

  // Reset UI state for testing
  setTestLoadingState(true);
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
        errors.push(
          `第 ${i + 1} 题: 仅解析到 ${parsedNumbers.length} 个有效整数（需至少 ${minimum} 个）`
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`第 ${i + 1} 题请求失败:`, err);
      updateStepUI(i, "error", "失败", "错误");
      errors.push(`第 ${i + 1} 题失败: ${errMsg}`);
    }

    const finishedProbes = i + 1;
    setProgress(
      finishedProbes,
      3,
      finishedProbes < 3
        ? `第 ${finishedProbes} 题已完成，进入下一题...`
        : "3 题测试完成，正在计算模型归因..."
    );
  }

  // Finish evaluation and render results
  if (outputs.length === 0) {
    progressTitle.textContent = "未获得有效样本";
    progressStatusDesc.textContent =
      "3 题测试均未能获取合规输出，请检查错误原因。";
    showStatusAlert(errors.join("；\n") || "未获得任何可分析输出。");
  } else {
    progressTitle.textContent = "测试完成";
    progressStatusDesc.textContent = `成功采纳 ${outputs.length}/3 份有效输出样本`;
    try {
      const analysis = analyzeGlobalOutputs(outputs, unifiedBank);
      renderResults(analysis);
    } catch (analysisErr: unknown) {
      const errMsg =
        analysisErr instanceof Error ? analysisErr.message : String(analysisErr);
      showStatusAlert(`归因计算异常: ${errMsg}`);
    }
  }

  setTestLoadingState(false);
}

// --------------------------------------------------------------------------
// App Initialization
// --------------------------------------------------------------------------
async function init(): Promise<void> {
  await initTauri();
  initConfigHandlers();
  initModelDropdown();
  loadConfig();

  form.addEventListener("submit", handleTestSubmit);

  if (unifiedBank && unifiedBank.models) {
    renderBankBadge(unifiedBank.models.length);
  }
}

void init();
