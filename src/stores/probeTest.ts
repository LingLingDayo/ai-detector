import { defineStore } from "pinia";
import { ref } from "vue";
import {
  generateChallenges,
  generateSingleChallenge,
  type Challenge,
} from "../utils/challenge";
import {
  parseNumbers,
  analyzeGlobalOutputs,
  type UnifiedBank,
  type ProbeOutputItem,
  type GlobalAnalysisResult,
} from "../utils/fingerprint";
import rawUnifiedBank from "../data/unified_bank.json";
import { sendProbe } from "../services/api";
import type {
  ClientConfig,
  ProbeStepItem,
  StatusAlertInfo,
  ProbeHistoryItem,
} from "../types";
import { PROBE_HISTORY_STORAGE_KEY } from "../constants";
import { maskApiKey } from "../utils/pelicanFormatters";
import { useConfigStore } from "./config";

const unifiedBank = rawUnifiedBank as unknown as UnifiedBank;

const MAX_PROBE_HISTORY_COUNT = 60;

function loadInitialProbeHistory(): ProbeHistoryItem[] {
  try {
    const raw = localStorage.getItem(PROBE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is ProbeHistoryItem =>
          Boolean(item && typeof item.prediction === "string" && typeof item.probability === "number")
      );
    }
  } catch (err) {
    console.error("加载模型测试历史记录失败:", err);
  }
  return [];
}

function persistProbeHistory(list: ProbeHistoryItem[]): void {
  try {
    localStorage.setItem(PROBE_HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("保存模型测试历史记录失败:", err);
  }
}

function generateProbeHistoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `probe_hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useProbeTestStore = defineStore("probeTest", () => {
  const isRunning = ref(false);
  const hasStarted = ref(false);
  const hasResult = ref(false);
  const progressPercent = ref(0);
  const completedCount = ref(0);
  const totalCount = 3;
  const statusTitle = ref("探测题目");
  const statusDesc = ref("已抽取 3 道测试题目，可点击卡片预览或直接开始测试");
  const statusAlert = ref<StatusAlertInfo | null>(null);
  const analysisResult = ref<GlobalAnalysisResult | null>(null);
  const currentProbeHistoryItem = ref<ProbeHistoryItem | null>(null);
  const probeHistoryList = ref<ProbeHistoryItem[]>(loadInitialProbeHistory());
  const testedModel = ref("");

  // 重要保留：供 sync-upstream.js 自动同步与备用
  const totalBankModelsCount = unifiedBank?.models?.length || 18;

  function addProbeHistoryItem(item: Omit<ProbeHistoryItem, "id" | "createdAt">): ProbeHistoryItem {
    const newItem: ProbeHistoryItem = {
      ...item,
      id: generateProbeHistoryId(),
      createdAt: Date.now(),
    };
    const updated = [newItem, ...probeHistoryList.value].slice(0, MAX_PROBE_HISTORY_COUNT);
    probeHistoryList.value = updated;
    persistProbeHistory(updated);
    currentProbeHistoryItem.value = newItem;
    return newItem;
  }

  function deleteProbeHistoryItem(id: string): void {
    const updated = probeHistoryList.value.filter((item) => item.id !== id);
    probeHistoryList.value = updated;
    persistProbeHistory(updated);
  }

  function clearProbeHistory(): void {
    probeHistoryList.value = [];
    try {
      localStorage.removeItem(PROBE_HISTORY_STORAGE_KEY);
    } catch {
      // 忽略存储删除异常
    }
  }

  function applyHistoryItem(item: ProbeHistoryItem): void {
    if (item.fullAnalysis) {
      analysisResult.value = item.fullAnalysis as GlobalAnalysisResult;
      hasResult.value = true;
      hasStarted.value = true;
      currentProbeHistoryItem.value = item;
    }
    testedModel.value = item.modelName;
  }

  // 初始化首次选题
  const currentChallenges = ref<Challenge[]>(generateChallenges(totalCount));

  let currentRunId = 0;
  let abortController: AbortController | null = null;
  let lastUsedConfig: Partial<ClientConfig> | null = null;
  let lastUsedConfigName: string | undefined = undefined;

  function createInitialSteps(challenges: Challenge[]): ProbeStepItem[] {
    return challenges.map((ch, idx) => ({
      id: idx,
      state: "pending",
      stateText: "待测试",
      statText: `${ch.expected_count} 个数字`,
      prompt: ch.prompt,
      expectedCount: ch.expected_count,
    }));
  }

  const steps = ref<ProbeStepItem[]>(createInitialSteps(currentChallenges.value));

  function refreshQuestions(): void {
    if (isRunning.value) return;
    currentChallenges.value = generateChallenges(totalCount);
    steps.value = createInitialSteps(currentChallenges.value);
    hasStarted.value = false;
    hasResult.value = false;
    progressPercent.value = 0;
    completedCount.value = 0;
    statusDesc.value = "已重新抽取 3 道测试题目，可点击卡片预览或直接开始测试";
    statusAlert.value = null;
    analysisResult.value = null;
  }

  function refreshSingleQuestion(index: number): void {
    if (isRunning.value || index < 0 || index >= totalCount) return;
    const otherLengths = currentChallenges.value
      .filter((_, i) => i !== index)
      .map((c) => c.expected_count);
    const newCh = generateSingleChallenge(index, otherLengths);
    currentChallenges.value[index] = newCh;
    steps.value[index] = {
      id: index,
      state: "pending",
      stateText: "待测试",
      statText: `${newCh.expected_count} 个数字`,
      prompt: newCh.prompt,
      expectedCount: newCh.expected_count,
    };
    if (steps.value.every((s) => s.state !== "error")) {
      statusAlert.value = null;
    }
    if (analysisResult.value) {
      analysisResult.value = null;
      progressPercent.value = 0;
      completedCount.value = 0;
      hasResult.value = false;
    }
  }

  function cancelTest(): void {
    if (!isRunning.value) return;
    currentRunId += 1;
    abortController?.abort();
    abortController = null;
    isRunning.value = false;

    steps.value = steps.value.map((s) => {
      if (s.state === "working" || s.state === "pending") {
        return {
          ...s,
          state: "cancelled",
          stateText: "已取消",
          statText: "已中断",
        };
      }
      return s;
    });

    statusTitle.value = "测试已取消";
    statusDesc.value = "测试已中断，再次点击开始按钮重新测试";
  }

  function resetTest(): void {
    currentRunId += 1;
    abortController?.abort();
    abortController = null;
    isRunning.value = false;
    hasStarted.value = false;
    hasResult.value = false;
    testedModel.value = "";
    progressPercent.value = 0;
    completedCount.value = 0;
    statusTitle.value = "探测题目";
    statusDesc.value = "已就绪，点击开始测试发起探测";
    statusAlert.value = null;
    analysisResult.value = null;
    currentProbeHistoryItem.value = null;
    lastUsedConfig = null;
    lastUsedConfigName = undefined;
    currentChallenges.value = generateChallenges(totalCount);
    steps.value = createInitialSteps(currentChallenges.value);
  }

  interface SingleProbeResult {
    accepted: boolean;
    finalResponseText: string;
    parsedNumbers: number[];
    lastErrMsg: string;
    minimum: number;
  }

  async function executeSingleProbe(params: {
    index: number;
    challenge: Challenge;
    baseUrl: string;
    apiKey: string;
    model: string;
    apiFormat?: string;
    reasoningEffort?: string;
    stream: boolean;
    timeoutSeconds: number;
    signal?: AbortSignal;
    runId: number;
  }): Promise<SingleProbeResult | null> {
    const {
      index,
      challenge,
      baseUrl,
      apiKey,
      model,
      apiFormat,
      reasoningEffort,
      stream,
      timeoutSeconds,
      signal,
      runId,
    } = params;

    const minimum = Math.max(80, Math.ceil(challenge.expected_count * 0.55));
    let accepted = false;
    let finalResponseText = "";
    let lastParsedNumbers: number[] = [];
    let lastErrMsg = "";

    // 最多尝试 2 次（初次执行 + 失败后最多静默重试 1 次）
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (runId !== currentRunId) return null;
      try {
        const response = await sendProbe({
          baseUrl,
          apiKey,
          model,
          prompt: challenge.prompt,
          apiFormat: apiFormat || "openai",
          reasoningEffort,
          stream,
          timeoutSeconds,
          signal,
        });

        if (runId !== currentRunId) return null;

        const parsedNumbers = parseNumbers(response.text);
        lastParsedNumbers = parsedNumbers;
        finalResponseText = response.text;

        if (parsedNumbers.length >= minimum) {
          accepted = true;
          break;
        } else {
          lastErrMsg = `仅解析到 ${parsedNumbers.length} 个有效整数（需至少 ${minimum} 个）`;
        }
      } catch (err: unknown) {
        if (runId !== currentRunId) return null;
        lastErrMsg = err instanceof Error ? err.message : String(err);
        console.error(`第 ${index + 1} 题第 ${attempt} 次尝试失败:`, err);
      }
    }

    if (runId !== currentRunId) return null;

    return {
      accepted,
      finalResponseText,
      parsedNumbers: lastParsedNumbers,
      lastErrMsg,
      minimum,
    };
  }

  function applyProbeResult(
    index: number,
    challenge: Challenge,
    res: SingleProbeResult
  ): void {
    if (res.accepted) {
      steps.value[index] = {
        id: index,
        state: "done",
        stateText: "已采纳",
        statText: `${res.parsedNumbers.length} 个数字`,
        prompt: challenge.prompt,
        expectedCount: challenge.expected_count,
        answer: res.finalResponseText,
        parsedNumbers: res.parsedNumbers,
      };
    } else if (res.parsedNumbers.length > 0) {
      steps.value[index] = {
        id: index,
        state: "error",
        stateText: "数字不足",
        statText: `${res.parsedNumbers.length}/${res.minimum}`,
        prompt: challenge.prompt,
        expectedCount: challenge.expected_count,
        answer: res.finalResponseText,
        parsedNumbers: res.parsedNumbers,
        error: res.lastErrMsg,
      };
    } else {
      steps.value[index] = {
        id: index,
        state: "error",
        stateText: "失败",
        statText: "错误",
        prompt: challenge.prompt,
        expectedCount: challenge.expected_count,
        answer: res.finalResponseText || undefined,
        error: res.lastErrMsg,
      };
    }
  }

  function finalizeTestEvaluation(params: {
    baseUrl: string;
    apiKey: string;
    model: string;
    reasoningEffort?: string;
    configName?: string;
    retryInfo?: { index: number; accepted: boolean };
    runId: number;
  }): void {
    const { baseUrl, apiKey, model, reasoningEffort, configName, retryInfo, runId } = params;
    if (runId !== currentRunId) return;

    const validOutputs: ProbeOutputItem[] = [];
    for (const s of steps.value) {
      if (s.state === "done" && s.answer) {
        validOutputs.push({
          text: s.answer,
          expected_count: s.expectedCount,
        });
      }
    }

    const allErrors = steps.value
      .map((s, i) => (s.state === "error" && s.error ? `第 ${i + 1} 题: ${s.error}` : null))
      .filter(Boolean);

    if (validOutputs.length === 0) {
      statusTitle.value = "未获得有效样本";
      if (retryInfo) {
        statusDesc.value = `第 ${retryInfo.index + 1} 题重试未成功，3 题均未能获取合规输出。`;
      } else {
        statusDesc.value = "3 题测试均未能获取合规输出，请检查错误原因。";
      }
      statusAlert.value = {
        message: allErrors.join("；\n") || "未获得任何可分析输出。",
        type: "error",
      };
      analysisResult.value = null;
    } else {
      statusTitle.value = "测试完成";
      if (retryInfo) {
        if (retryInfo.accepted) {
          statusDesc.value =
            validOutputs.length === totalCount
              ? `第 ${retryInfo.index + 1} 题重试成功，3 题已全部采纳！`
              : `第 ${retryInfo.index + 1} 题重试成功，已采纳 ${validOutputs.length}/${totalCount} 份有效样本`;
        } else {
          statusDesc.value = `第 ${retryInfo.index + 1} 题重试未成功，当前有效样本: ${validOutputs.length}/${totalCount}`;
        }
      } else {
        statusDesc.value =
          validOutputs.length === totalCount
            ? "3 题测试均已完成并成功采纳！"
            : `成功采纳 ${validOutputs.length}/${totalCount} 份有效输出样本`;
      }

      if (allErrors.length > 0) {
        statusAlert.value = {
          message: allErrors.join("；\n"),
          type: "error",
        };
      } else {
        statusAlert.value = null;
      }

      try {
        analysisResult.value = analyzeGlobalOutputs(validOutputs, unifiedBank);
        if (analysisResult.value) {
          const candidates = (analysisResult.value.results || []).slice(0, 3).map((r) => ({
            model: r.model,
            displayName: r.display_name,
            probability: r.probability,
            familyName: r.family_name,
          }));

          addProbeHistoryItem({
            configName: configName?.trim() || undefined,
            baseUrl,
            apiKey: maskApiKey(apiKey),
            modelName: model,
            reasoningEffort: reasoningEffort || "high",
            prediction: analysisResult.value.prediction,
            predictionName:
              analysisResult.value.prediction_name || analysisResult.value.prediction,
            probability: analysisResult.value.probability,
            familyPredictionName:
              analysisResult.value.family_prediction_name ||
              analysisResult.value.family_prediction,
            familyProbability: analysisResult.value.family_probability,
            usedOutputs: analysisResult.value.used_outputs,
            candidates,
            fullAnalysis: analysisResult.value,
          });
        }
      } catch (analysisErr: unknown) {
        if (runId !== currentRunId) return;
        const errMsg =
          analysisErr instanceof Error ? analysisErr.message : String(analysisErr);
        statusAlert.value = {
          message: `归因计算异常: ${errMsg}`,
          type: "error",
        };
      }
    }

    isRunning.value = false;
    hasResult.value = true;
  }

  async function startTest(
    config: ClientConfig,
    configName?: string
  ): Promise<void> {
    const baseUrl = config.baseUrl.trim();
    const apiKey = config.apiKey.trim();
    const model = config.modelName.trim();
    const apiFormat = config.apiFormat;
    const reasoningEffort = config.reasoningEffort;
    const isStream = config.stream !== false;
    const timeoutSeconds = isStream ? 90 : 240;

    if (!baseUrl || !apiKey) {
      alert("请填写 Base URL 和 API Key！");
      return;
    }

    if (!model) {
      alert("请填写或选择测试模型 ID！");
      return;
    }

    const runId = ++currentRunId;
    abortController?.abort();
    abortController = new AbortController();

    lastUsedConfig = { ...config };
    lastUsedConfigName = configName;

    hasStarted.value = true;
    hasResult.value = false;
    isRunning.value = true;
    testedModel.value = model;
    progressPercent.value = 0;
    completedCount.value = 0;
    statusTitle.value = "测试进行中";
    statusDesc.value = "已同时发起 3 题并发测试请求...";
    statusAlert.value = null;
    analysisResult.value = null;

    const challenges = currentChallenges.value;
    steps.value = challenges.map((ch, i) => ({
      id: i,
      state: "working",
      stateText: "请求中",
      statText: `期望 ${ch.expected_count} 个`,
      prompt: ch.prompt,
      expectedCount: ch.expected_count,
    }));

    const tasks = challenges.map(async (challenge, i) => {
      try {
        const res = await executeSingleProbe({
          index: i,
          challenge,
          baseUrl,
          apiKey,
          model,
          apiFormat,
          reasoningEffort,
          stream: isStream,
          timeoutSeconds,
          signal: abortController?.signal,
          runId,
        });

        if (runId !== currentRunId || !res) return;
        applyProbeResult(i, challenge, res);
      } finally {
        if (runId === currentRunId) {
          completedCount.value += 1;
          progressPercent.value = Math.round((completedCount.value / totalCount) * 100);
          if (completedCount.value < totalCount) {
            statusDesc.value = `已完成 ${completedCount.value}/${totalCount} 题，正在等待剩余响应...`;
          } else {
            statusDesc.value = "3 题测试完成，正在计算模型归因...";
          }
        }
      }
    });

    await Promise.all(tasks);
    if (runId !== currentRunId) return;

    finalizeTestEvaluation({
      baseUrl,
      apiKey,
      model,
      reasoningEffort,
      configName,
      runId,
    });
  }

  async function retrySingleQuestion(
    index: number,
    config?: ClientConfig,
    configName?: string
  ): Promise<void> {
    if (isRunning.value || index < 0 || index >= totalCount) return;

    const configStore = useConfigStore();
    const probeConfig = configStore.probeConfig;
    const baseUrl = (config?.baseUrl || probeConfig.baseUrl || lastUsedConfig?.baseUrl || "").trim();
    const apiKey = (config?.apiKey || probeConfig.apiKey || lastUsedConfig?.apiKey || "").trim();
    const model = (config?.modelName || probeConfig.modelName || testedModel.value || lastUsedConfig?.modelName || "").trim();
    const apiFormat = config?.apiFormat ?? probeConfig.apiFormat ?? lastUsedConfig?.apiFormat;
    const reasoningEffort = config?.reasoningEffort ?? probeConfig.reasoningEffort ?? lastUsedConfig?.reasoningEffort;
    const isStream = (config?.stream ?? probeConfig.stream ?? lastUsedConfig?.stream) !== false;
    const timeoutSeconds = isStream ? 90 : 240;

    if (!baseUrl || !apiKey) {
      alert("请填写 Base URL 和 API Key！");
      return;
    }

    if (!model) {
      alert("请填写或选择测试模型 ID！");
      return;
    }

    const runId = ++currentRunId;
    abortController?.abort();
    abortController = new AbortController();

    lastUsedConfig = {
      baseUrl,
      apiKey,
      modelName: model,
      apiFormat,
      reasoningEffort,
      stream: isStream,
    };
    if (configName) lastUsedConfigName = configName;

    hasStarted.value = true;
    isRunning.value = true;
    testedModel.value = model;

    const challenge = currentChallenges.value[index];

    // 将本题置为 working 状态
    steps.value[index] = {
      id: index,
      state: "working",
      stateText: "重试中",
      statText: `期望 ${challenge.expected_count} 个`,
      prompt: challenge.prompt,
      expectedCount: challenge.expected_count,
      answer: undefined,
      parsedNumbers: undefined,
      error: undefined,
    };

    // 重新计算进行中的进度条与完成数（其余已出结果的题目视为已完成，本题重试中）
    const completedBefore = steps.value.filter(
      (s, i) => i !== index && (s.state === "done" || s.state === "error")
    ).length;
    completedCount.value = completedBefore;
    progressPercent.value = Math.round((completedCount.value / totalCount) * 100);

    statusTitle.value = "测试进行中";
    statusDesc.value = `正在重试第 ${index + 1} 题，请稍候...`;

    // 过滤掉当前题的旧报错，仅保留其它题目的报错提示
    const otherErrors = steps.value
      .map((s, i) => (i !== index && s.state === "error" && s.error ? `第 ${i + 1} 题: ${s.error}` : null))
      .filter(Boolean);
    statusAlert.value = otherErrors.length > 0
      ? { message: otherErrors.join("；\n"), type: "error" }
      : null;

    const res = await executeSingleProbe({
      index,
      challenge,
      baseUrl,
      apiKey,
      model,
      apiFormat,
      reasoningEffort,
      stream: isStream,
      timeoutSeconds,
      signal: abortController.signal,
      runId,
    });

    if (runId !== currentRunId || !res) return;

    applyProbeResult(index, challenge, res);

    // 重试完成，全部题目都已有结果
    completedCount.value = totalCount;
    progressPercent.value = 100;

    const resolvedConfigName =
      configName?.trim() ||
      configStore.matchedConfigItem?.name ||
      (configStore.isCurrentConfigSaved ? configStore.activeConfigName : undefined) ||
      lastUsedConfigName;

    finalizeTestEvaluation({
      baseUrl,
      apiKey,
      model,
      reasoningEffort,
      configName: resolvedConfigName,
      retryInfo: { index, accepted: res.accepted },
      runId,
    });
  }

  return {
    isRunning,
    hasStarted,
    hasResult,
    progressPercent,
    completedCount,
    totalCount,
    statusTitle,
    statusDesc,
    steps,
    currentChallenges,
    statusAlert,
    analysisResult,
    currentProbeHistoryItem,
    totalBankModelsCount,
    probeHistoryList,
    testedModel,
    startTest,
    cancelTest,
    resetTest,
    refreshQuestions,
    refreshSingleQuestion,
    retrySingleQuestion,
    deleteProbeHistoryItem,
    clearProbeHistory,
    applyHistoryItem,
  };
});
