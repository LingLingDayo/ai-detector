import { defineStore } from "pinia";
import { ref } from "vue";
import { generateChallenges, generateSingleChallenge, type Challenge } from "../utils/challenge";
import type { UnifiedBank, GlobalAnalysisResult } from "../utils/fingerprint";
import rawUnifiedBank from "../data/unified_bank.json";
import type { ClientConfig, ProbeStepItem, StatusAlertInfo, ProbeHistoryItem } from "../types";
import { useConfigStore } from "./config";
import { loadInitialProbeHistory, persistProbeHistory, createProbeHistoryRecord, clearProbeHistoryStorage, MAX_PROBE_HISTORY_COUNT } from "../utils/probeHistory";
import { executeSingleProbe } from "../services/probeRunner";
import { createInitialSteps, formatProbeStepResult, createFailedStep, createCancelledSteps, computeProgress, computeRunningStatusDesc, collectStepErrors, performFinalEvaluation } from "../utils/probeEvaluation";
import { loadActiveUnifiedBank, getPersistedUpdateStatus, setPersistedUpdateStatus, checkFingerprintUpdate, executeFingerprintUpdate } from "../services/fingerprintSync";

const unifiedBank = rawUnifiedBank as unknown as UnifiedBank;

const PROBE_INTRO_DESC = "通过 3 道随机题目分析模型回答特征，并与已收录模型的指纹比对，判断最可能的真实模型";

type ResolvedProbeOptions = { baseUrl: string; apiKey: string; model: string; apiFormat?: string; reasoningEffort?: string; isStream: boolean; timeoutSeconds: number };

export const useProbeTestStore = defineStore("probeTest", () => {
  const isRunning = ref(false);
  const hasStarted = ref(false);
  const hasResult = ref(false);
  const progressPercent = ref(0);
  const completedCount = ref(0);
  const totalCount = 3;
  const statusTitle = ref("探测题目");
  const statusDesc = ref(PROBE_INTRO_DESC);
  const statusAlert = ref<StatusAlertInfo | null>(null);
  const analysisResult = ref<GlobalAnalysisResult | null>(null);
  const currentProbeHistoryItem = ref<ProbeHistoryItem | null>(null);
  const probeHistoryList = ref<ProbeHistoryItem[]>(loadInitialProbeHistory());
  const testedModel = ref("");
  const activeUnifiedBank = ref<UnifiedBank>(loadActiveUnifiedBank());
  const hasFingerprintUpdate = ref<boolean>(getPersistedUpdateStatus());
  const isUpdatingFingerprint = ref<boolean>(false);

  const totalBankModelsCount = unifiedBank?.models?.length || 18;

  const isDetailModalOpen = ref(false);
  const selectedDetailIndex = ref(0);

  function openDetailModal(index: number = 0): void {
    selectedDetailIndex.value = Math.max(0, Math.min(totalCount - 1, index));
    isDetailModalOpen.value = true;
  }

  function closeDetailModal(): void {
    isDetailModalOpen.value = false;
  }

  function addProbeHistoryItem(item: Omit<ProbeHistoryItem, "id" | "createdAt">): ProbeHistoryItem {
    const newItem = createProbeHistoryRecord(item);
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
    clearProbeHistoryStorage();
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

  const currentChallenges = ref<Challenge[]>(generateChallenges(totalCount));

  let sessionId = 0;
  const stepAbortControllers = new Map<number, AbortController>();
  const stepTickets = new Map<number, number>();
  let lastUsedConfig: Partial<ClientConfig> | null = null;
  let lastUsedConfigName: string | undefined = undefined;

  const steps = ref<ProbeStepItem[]>(createInitialSteps(currentChallenges.value));

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
    const errors = collectStepErrors(steps.value);
    statusAlert.value = errors.length > 0 ? { message: errors.join("\n"), type: "error" } : null;
  }

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
    sessionId += 1;
    for (const ctrl of stepAbortControllers.values()) {
      ctrl.abort();
    }
    stepAbortControllers.clear();
    stepTickets.clear();
    isRunning.value = false;

    steps.value = createCancelledSteps(steps.value);
    statusTitle.value = "测试已取消";
    statusDesc.value = "测试已中断，再次点击开始按钮重新测试";
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
    statusTitle.value = "探测题目";
    statusDesc.value = PROBE_INTRO_DESC;
    statusAlert.value = null;
    analysisResult.value = null;
    currentProbeHistoryItem.value = null;
    lastUsedConfig = null;
    lastUsedConfigName = undefined;
    currentChallenges.value = generateChallenges(totalCount);
    steps.value = createInitialSteps(currentChallenges.value);
  }

  function finalizeTestEvaluation(params: {
    baseUrl: string;
    apiKey: string;
    model: string;
    reasoningEffort?: string;
    configName?: string;
    sessionId: number;
  }): void {
    const { baseUrl, apiKey, model, reasoningEffort, configName, sessionId: evalSessionId } = params;
    if (evalSessionId !== sessionId) return;

    const evalResult = performFinalEvaluation({
      steps: steps.value,
      unifiedBank: activeUnifiedBank.value,
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
      addProbeHistoryItem(evalResult.historyItemPayload);
    }

    isRunning.value = false;
    hasResult.value = true;
  }

  function resolveProbeOptions(config?: Partial<ClientConfig>): ResolvedProbeOptions | null {
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
      return null;
    }
    if (!model) {
      alert("请填写或选择测试模型 ID！");
      return null;
    }

    return { baseUrl, apiKey, model, apiFormat, reasoningEffort, isStream, timeoutSeconds };
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
    challenge: Challenge,
    options: ResolvedProbeOptions,
    ticket: number,
    currentSessionId: number,
    isRetry = false
  ): Promise<void> {
    const stepCtrl = new AbortController();
    stepAbortControllers.set(index, stepCtrl);

    try {
      const res = await executeSingleProbe({
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
        isCancelled: () => sessionId !== currentSessionId || stepTickets.get(index) !== ticket,
      });

      if (sessionId !== currentSessionId || stepTickets.get(index) !== ticket) return;

      if (res) {
        steps.value[index] = formatProbeStepResult(index, challenge, res);
      } else if (steps.value[index].state === "working") {
        steps.value[index] = createFailedStep(
          index,
          challenge,
          isRetry ? "重试中断或未获取到结果" : "请求中断或未获取到结果",
          isRetry ? "重试失败" : "失败"
        );
      }
    } finally {
      if (stepAbortControllers.get(index) === stepCtrl) {
        stepAbortControllers.delete(index);
      }
    }
  }

  async function startTest(config: ClientConfig, configName?: string): Promise<void> {
    const options = resolveProbeOptions(config);
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

    const options = resolveProbeOptions(config);
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
      statText: `期望 ${challenge.expected_count} 个`,
      prompt: challenge.prompt,
      expectedCount: challenge.expected_count,
      answer: undefined,
      parsedNumbers: undefined,
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

  async function performFingerprintUpdate(): Promise<boolean> {
    if (isUpdatingFingerprint.value) return false;
    isUpdatingFingerprint.value = true;
    try {
      const newBank = await executeFingerprintUpdate();
      activeUnifiedBank.value = newBank;
      hasFingerprintUpdate.value = false;
      alert(`指纹题库更新成功！当前题库已支持 ${newBank.models?.length || 0} 个模型。`);
      return true;
    } catch (err) {
      alert(`指纹题库更新失败: ${err instanceof Error ? err.message : "网络连接异常，请稍后重试"}`);
      return false;
    } finally {
      isUpdatingFingerprint.value = false;
    }
  }

  async function initStartupFingerprintCheck(): Promise<void> {
    if (hasFingerprintUpdate.value) return;
    try {
      if (await checkFingerprintUpdate(activeUnifiedBank.value)) {
        hasFingerprintUpdate.value = true;
        setPersistedUpdateStatus(true);
      }
    } catch {
      // 启动自动检测静默失败，严禁抛错或弹窗提示
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
    currentProbeHistoryItem,
    totalBankModelsCount,
    probeHistoryList,
    testedModel,
    hasFingerprintUpdate,
    isUpdatingFingerprint,
    activeUnifiedBank,
    isDetailModalOpen,
    selectedDetailIndex,
    openDetailModal,
    closeDetailModal,
    performFingerprintUpdate,
    initStartupFingerprintCheck,
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
