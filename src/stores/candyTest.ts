import { defineStore } from "pinia";
import { ref } from "vue";
import {
  fetchCandyChallenges,
  fetchSingleCandyChallenge,
  generateCandyChallengesSync,
  generateSingleCandyChallengeSync,
} from "../utils/candyChallenge";
import type {
  CandyAnalysisResult,
  CandyChallenge,
  CandyHistoryItem,
  ClientConfig,
  ProbeStepItem,
  StatusAlertInfo,
} from "../types";
import { useConfigStore } from "./config";
import {
  clearCandyHistoryStorage,
  createCandyHistoryRecord,
  loadInitialCandyHistory,
  MAX_CANDY_HISTORY_COUNT,
  persistCandyHistory,
} from "../utils/candyHistory";
import { executeSingleCandy } from "../services/candyRunner";
import { isTauriApp } from "../services/api";
import {
  collectCandyNetworkErrors,
  createCancelledCandySteps,
  createFailedCandyStep,
  createInitialCandySteps,
  formatCandyStepResult,
  performCandyFinalEvaluation,
} from "../utils/candyEvaluation";
import { computeProgress, computeRunningStatusDesc } from "../utils/probeEvaluation";

const CANDY_INTRO_DESC =
  "连续 3 道动态糖果组合逻辑推理题，答对 ≥ 2 题即判定通过";

type ResolvedCandyOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  apiFormat?: string;
  reasoningEffort?: string;
  isStream: boolean;
  timeoutSeconds: number;
};

export const useCandyTestStore = defineStore("candyTest", () => {
  const isRunning = ref(false);
  const hasStarted = ref(false);
  const hasResult = ref(false);
  const progressPercent = ref(0);
  const completedCount = ref(0);
  const totalCount = 3;
  const statusTitle = ref("糖果测试题目");
  const statusDesc = ref(CANDY_INTRO_DESC);
  const statusAlert = ref<StatusAlertInfo | null>(null);
  const analysisResult = ref<CandyAnalysisResult | null>(null);
  const currentCandyHistoryItem = ref<CandyHistoryItem | null>(null);
  const candyHistoryList = ref<CandyHistoryItem[]>(loadInitialCandyHistory());
  const testedModel = ref("");

  const isDetailModalOpen = ref(false);
  const selectedDetailIndex = ref(0);

  function openDetailModal(index: number = 0): void {
    selectedDetailIndex.value = Math.max(0, Math.min(totalCount - 1, index));
    isDetailModalOpen.value = true;
  }

  function closeDetailModal(): void {
    isDetailModalOpen.value = false;
  }

  function addCandyHistoryItem(
    item: Omit<CandyHistoryItem, "id" | "createdAt">
  ): CandyHistoryItem {
    const newItem = createCandyHistoryRecord(item);
    const updated = [newItem, ...candyHistoryList.value].slice(0, MAX_CANDY_HISTORY_COUNT);
    candyHistoryList.value = updated;
    persistCandyHistory(updated);
    currentCandyHistoryItem.value = newItem;
    return newItem;
  }

  function deleteCandyHistoryItem(id: string): void {
    const updated = candyHistoryList.value.filter((item) => item.id !== id);
    candyHistoryList.value = updated;
    persistCandyHistory(updated);
  }

  function clearCandyHistory(): void {
    candyHistoryList.value = [];
    clearCandyHistoryStorage();
  }

  const currentChallenges = ref<CandyChallenge[]>(generateCandyChallengesSync(totalCount));

  let sessionId = 0;
  const stepAbortControllers = new Map<number, AbortController>();
  const stepTickets = new Map<number, number>();
  let lastUsedConfig: Partial<ClientConfig> | null = null;
  let lastUsedConfigName: string | undefined = undefined;

  const steps = ref<ProbeStepItem[]>(createInitialCandySteps(currentChallenges.value));

  function applyHistoryItem(item: CandyHistoryItem): void {
    if (Array.isArray(item.diagnostics) && item.diagnostics.length > 0) {
      currentChallenges.value = item.diagnostics.map((d, idx) => ({
        id: `candy-hist-${item.id}-${idx + 1}`,
        circleApple: d.circleApple,
        circlePeach: d.circlePeach,
        circleWatermelon: d.circleWatermelon,
        starApple: d.starApple,
        starPeach: d.starPeach,
        starWatermelon: d.starWatermelon,
        expectedAnswer: d.expectedAnswer,
        optimalCircle: d.optimalCircle,
        optimalStar: d.optimalStar,
        prompt: d.prompt,
      }));

      steps.value = item.diagnostics.map((d, idx) => ({
        id: idx,
        state: d.isCorrect ? "done" : "error",
        stateText: d.isCorrect ? "回答正确" : d.answer ? "回答错误" : "请求失败",
        statText: d.isCorrect
          ? `答 ${d.modelAnswer} · 正确`
          : d.modelAnswer !== null
          ? `答 ${d.modelAnswer} (正确 ${d.expectedAnswer})`
          : `答案: ${d.expectedAnswer}`,
        prompt: d.prompt,
        expectedAnswer: d.expectedAnswer,
        optimalCircle: d.optimalCircle,
        optimalStar: d.optimalStar,
        modelAnswer: d.modelAnswer,
        isCorrect: d.isCorrect,
        answer: d.answer,
        error: d.error,
        durationMs: d.durationMs,
      }));
    }

    analysisResult.value = {
      passed: item.passed,
      correctCount: item.correctCount,
      totalCount: item.totalCount || totalCount,
      accuracy: item.accuracy,
      avgDurationMs: item.avgDurationMs,
      totalDurationMs: item.totalDurationMs,
      diagnostics: item.diagnostics || [],
    };
    hasResult.value = true;
    hasStarted.value = true;
    progressPercent.value = 100;
    completedCount.value = item.totalCount || totalCount;
    statusTitle.value = item.passed ? "糖果测试通过" : "糖果测试未通过";
    statusDesc.value = item.passed
      ? `连续 ${item.totalCount} 题中答对 ${item.correctCount} 题（需 ≥ 2 题），模型长逻辑链推理表现正常`
      : `连续 ${item.totalCount} 题中仅答对 ${item.correctCount} 题（需 ≥ 2 题），模型可能遭遇降智或思考链截断`;
    statusAlert.value = null;
    currentCandyHistoryItem.value = item;
    testedModel.value = item.modelName;
  }

  function updateProgressState(): void {
    const progress = computeProgress(steps.value, totalCount);
    completedCount.value = progress.completedCount;
    progressPercent.value = progress.progressPercent;
  }

  function updateRunningStatusDesc(): void {
    const desc = computeRunningStatusDesc(steps.value, totalCount);
    if (desc) {
      statusDesc.value = desc;
    }
  }

  function updateStatusAlert(): void {
    const errors = collectCandyNetworkErrors(steps.value);
    statusAlert.value =
      errors.length > 0 ? { message: errors.join("\n"), type: "error" } : null;
  }

  async function initCandyChallenges(): Promise<void> {
    if (isRunning.value || hasStarted.value) return;
    if (isTauriApp()) {
      const rustChallenges = await fetchCandyChallenges(totalCount);
      if (!isRunning.value && !hasStarted.value && rustChallenges.length === totalCount) {
        currentChallenges.value = rustChallenges;
        steps.value = createInitialCandySteps(rustChallenges);
      }
    }
  }

  function refreshQuestions(): void {
    if (isRunning.value) return;
    const syncList = generateCandyChallengesSync(totalCount);
    currentChallenges.value = syncList;
    steps.value = createInitialCandySteps(syncList);
    hasStarted.value = false;
    hasResult.value = false;
    progressPercent.value = 0;
    completedCount.value = 0;
    statusTitle.value = "糖果测试题目";
    statusDesc.value = "已重新生成 3 道动态糖果推理题";
    statusAlert.value = null;
    analysisResult.value = null;

    if (isTauriApp()) {
      const snapSession = sessionId;
      void fetchCandyChallenges(totalCount).then((rustList) => {
        if (!isRunning.value && !hasStarted.value && sessionId === snapSession && rustList.length === totalCount) {
          currentChallenges.value = rustList;
          steps.value = createInitialCandySteps(rustList);
        }
      });
    }
  }

  function refreshSingleQuestion(index: number): void {
    if (isRunning.value || index < 0 || index >= totalCount) return;
    const otherAnswers = currentChallenges.value
      .filter((_, i) => i !== index)
      .map((c) => c.expectedAnswer);

    const applySingle = (newCh: CandyChallenge) => {
      currentChallenges.value[index] = newCh;
      steps.value[index] = {
        id: index,
        state: "pending",
        stateText: "待测试",
        statText: `答案: ${newCh.expectedAnswer}`,
        prompt: newCh.prompt,
        expectedAnswer: newCh.expectedAnswer,
        optimalCircle: newCh.optimalCircle,
        optimalStar: newCh.optimalStar,
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
    };

    applySingle(generateSingleCandyChallengeSync(index, otherAnswers));

    if (isTauriApp()) {
      const snapSession = sessionId;
      void fetchSingleCandyChallenge(index, otherAnswers).then((rustCh) => {
        if (!isRunning.value && sessionId === snapSession && steps.value[index]?.state === "pending") {
          applySingle(rustCh);
        }
      });
    }
  }

  function cancelTest(): void {
    if (!isRunning.value) return;
    sessionId += 1;
    for (const ctrl of stepAbortControllers.values()) {
      ctrl.abort();
    }
    stepAbortControllers.clear();
    stepTickets.clear();
    isRunning.value = false;

    steps.value = createCancelledCandySteps(steps.value);
    statusTitle.value = "测试已取消";
    statusDesc.value = "糖果测试已中断，再次点击开始按钮重新测试";
  }

  function resetTest(): void {
    sessionId += 1;
    for (const ctrl of stepAbortControllers.values()) {
      ctrl.abort();
    }
    stepAbortControllers.clear();
    stepTickets.clear();
    isRunning.value = false;
    hasStarted.value = false;
    hasResult.value = false;
    testedModel.value = "";
    progressPercent.value = 0;
    completedCount.value = 0;
    statusTitle.value = "糖果测试题目";
    statusDesc.value = CANDY_INTRO_DESC;
    statusAlert.value = null;
    analysisResult.value = null;
    currentCandyHistoryItem.value = null;
    lastUsedConfig = null;
    lastUsedConfigName = undefined;
    currentChallenges.value = generateCandyChallengesSync(totalCount);
    steps.value = createInitialCandySteps(currentChallenges.value);
  }

  function finalizeTestEvaluation(params: {
    baseUrl: string;
    apiKey: string;
    model: string;
    reasoningEffort?: string;
    configName?: string;
    sessionId: number;
  }): void {
    const {
      baseUrl,
      apiKey,
      model,
      reasoningEffort,
      configName,
      sessionId: evalSessionId,
    } = params;
    if (evalSessionId !== sessionId) return;

    const evalResult = performCandyFinalEvaluation({
      steps: steps.value,
      challenges: currentChallenges.value,
      totalCount,
      baseUrl,
      apiKey,
      model,
      reasoningEffort,
      configName,
    });

    statusTitle.value = evalResult.statusTitle;
    statusDesc.value = evalResult.statusDesc;
    statusAlert.value = evalResult.statusAlert;
    analysisResult.value = evalResult.analysisResult;

    if (evalResult.historyItemPayload) {
      addCandyHistoryItem(evalResult.historyItemPayload);
    }

    isRunning.value = false;
    hasResult.value = Boolean(evalResult.analysisResult);
  }

  function resolveCandyOptions(config?: Partial<ClientConfig>): ResolvedCandyOptions | null {
    const configStore = useConfigStore();
    const candyConfig = configStore.candyConfig;
    const baseUrl = (
      config?.baseUrl ||
      candyConfig.baseUrl ||
      lastUsedConfig?.baseUrl ||
      ""
    ).trim();
    const apiKey = (
      config?.apiKey ||
      candyConfig.apiKey ||
      lastUsedConfig?.apiKey ||
      ""
    ).trim();
    const model = (
      config?.modelName ||
      candyConfig.modelName ||
      testedModel.value ||
      lastUsedConfig?.modelName ||
      ""
    ).trim();
    const apiFormat =
      config?.apiFormat ?? candyConfig.apiFormat ?? lastUsedConfig?.apiFormat;
    const reasoningEffort =
      config?.reasoningEffort ??
      candyConfig.reasoningEffort ??
      lastUsedConfig?.reasoningEffort;
    const isStream =
      (config?.stream ?? candyConfig.stream ?? lastUsedConfig?.stream) !== false;
    const timeoutSeconds = isStream ? 120 : 240;

    if (!baseUrl || !apiKey) {
      alert("请填写 Base URL 和 API Key！");
      return null;
    }
    if (!model) {
      alert("请填写或选择测试模型 ID！");
      return null;
    }

    return {
      baseUrl,
      apiKey,
      model,
      apiFormat,
      reasoningEffort,
      isStream,
      timeoutSeconds,
    };
  }

  function getResolvedConfigName(configName?: string): string | undefined {
    const configStore = useConfigStore();
    return (
      configName?.trim() ||
      configStore.matchedConfigItem?.name ||
      (configStore.isCurrentConfigSaved ? configStore.activeConfigName : undefined) ||
      lastUsedConfigName
    );
  }

  async function runStepExecution(
    index: number,
    challenge: CandyChallenge,
    options: ResolvedCandyOptions,
    ticket: number,
    currentSessionId: number,
    isRetry = false
  ): Promise<void> {
    const stepCtrl = new AbortController();
    stepAbortControllers.set(index, stepCtrl);

    try {
      const res = await executeSingleCandy({
        index,
        challenge,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        model: options.model,
        apiFormat: options.apiFormat,
        reasoningEffort: options.reasoningEffort,
        stream: options.isStream,
        timeoutSeconds: options.timeoutSeconds,
        signal: stepCtrl.signal,
        onStreamProgress: (partialText) => {
          if (sessionId !== currentSessionId || stepTickets.get(index) !== ticket) return;
          if (steps.value[index]?.state === "working") {
            steps.value[index].answer = partialText;
            steps.value[index].stateText = "思考输出中";
          }
        },
        isCancelled: () =>
          sessionId !== currentSessionId || stepTickets.get(index) !== ticket,
      });

      if (sessionId !== currentSessionId || stepTickets.get(index) !== ticket) return;

      if (res) {
        steps.value[index] = formatCandyStepResult(index, challenge, res);
      } else if (steps.value[index].state === "working") {
        steps.value[index] = createFailedCandyStep(
          index,
          challenge,
          isRetry ? "重试中断或未获取到结果" : "请求中断或未获取到结果",
          isRetry ? "重试失败" : "请求失败"
        );
      }
    } finally {
      if (stepAbortControllers.get(index) === stepCtrl) {
        stepAbortControllers.delete(index);
      }
    }
  }

  async function startTest(config: ClientConfig, configName?: string): Promise<void> {
    const options = resolveCandyOptions(config);
    if (!options) return;

    sessionId += 1;
    const currentSessionId = sessionId;

    for (const ctrl of stepAbortControllers.values()) {
      ctrl.abort();
    }
    stepAbortControllers.clear();
    stepTickets.clear();

    lastUsedConfig = { ...config };
    lastUsedConfigName = configName;

    hasStarted.value = true;
    hasResult.value = false;
    isRunning.value = true;
    testedModel.value = options.model;
    progressPercent.value = 0;
    completedCount.value = 0;
    statusTitle.value = "测试进行中";
    statusDesc.value = "已同时发起 3 题糖果逻辑推理测试请求...";
    statusAlert.value = null;
    analysisResult.value = null;

    const challenges = currentChallenges.value;
    steps.value = challenges.map((ch, i) => ({
      id: i,
      state: "working",
      stateText: "请求中",
      statText: `答案: ${ch.expectedAnswer}`,
      prompt: ch.prompt,
      expectedAnswer: ch.expectedAnswer,
      optimalCircle: ch.optimalCircle,
      optimalStar: ch.optimalStar,
    }));

    const tasks = challenges.map(async (challenge, i) => {
      const ticket = 1;
      stepTickets.set(i, ticket);

      await runStepExecution(i, challenge, options, ticket, currentSessionId, false);

      if (sessionId === currentSessionId && stepTickets.get(i) === ticket) {
        updateProgressState();
        if (steps.value.some((s) => s.state === "working")) {
          statusDesc.value = `已完成 ${completedCount.value}/${totalCount} 题，正在等待剩余响应...`;
          updateStatusAlert();
        }
      }
    });

    await Promise.all(tasks);
    if (sessionId !== currentSessionId) return;

    if (!steps.value.some((s) => s.state === "working")) {
      finalizeTestEvaluation({
        ...options,
        configName: getResolvedConfigName(configName),
        sessionId: currentSessionId,
      });
    }
  }

  async function retrySingleQuestion(
    index: number,
    config?: ClientConfig,
    configName?: string
  ): Promise<void> {
    if (index < 0 || index >= totalCount) return;
    if (steps.value[index]?.state === "working") return;

    const options = resolveCandyOptions(config);
    if (!options) return;

    stepAbortControllers.get(index)?.abort();
    const ticket = (stepTickets.get(index) || 0) + 1;
    stepTickets.set(index, ticket);
    const currentSessionId = sessionId;

    lastUsedConfig = {
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      modelName: options.model,
      apiFormat: options.apiFormat,
      reasoningEffort: options.reasoningEffort,
      stream: options.isStream,
    };
    if (configName) lastUsedConfigName = configName;

    hasStarted.value = true;
    isRunning.value = true;
    testedModel.value = options.model;

    const challenge = currentChallenges.value[index];

    steps.value[index] = {
      id: index,
      state: "working",
      stateText: "重试中",
      statText: `答案: ${challenge.expectedAnswer}`,
      prompt: challenge.prompt,
      expectedAnswer: challenge.expectedAnswer,
      optimalCircle: challenge.optimalCircle,
      optimalStar: challenge.optimalStar,
      modelAnswer: undefined,
      isCorrect: undefined,
      answer: undefined,
      error: undefined,
    };

    updateProgressState();
    statusTitle.value = "测试进行中";
    updateRunningStatusDesc();
    updateStatusAlert();

    await runStepExecution(index, challenge, options, ticket, currentSessionId, true);

    if (sessionId !== currentSessionId || stepTickets.get(index) !== ticket) {
      return;
    }

    updateProgressState();

    if (steps.value.some((s) => s.state === "working")) {
      updateRunningStatusDesc();
      updateStatusAlert();
    } else {
      finalizeTestEvaluation({
        ...options,
        configName: getResolvedConfigName(configName),
        sessionId: currentSessionId,
      });
    }
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
    currentCandyHistoryItem,
    candyHistoryList,
    testedModel,
    isDetailModalOpen,
    selectedDetailIndex,
    openDetailModal,
    closeDetailModal,
    initCandyChallenges,
    startTest,
    cancelTest,
    resetTest,
    refreshQuestions,
    refreshSingleQuestion,
    retrySingleQuestion,
    deleteCandyHistoryItem,
    clearCandyHistory,
    applyHistoryItem,
  };
});

