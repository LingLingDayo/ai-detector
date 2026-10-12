import { ref, type Ref } from "vue";
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
import type { ClientConfig, ProbeStepItem, StatusAlertInfo } from "../types";

const unifiedBank = rawUnifiedBank as unknown as UnifiedBank;

export interface UseProbeTestReturn {
  isRunning: Ref<boolean>;
  hasStarted: Ref<boolean>;
  hasResult: Ref<boolean>;
  progressPercent: Ref<number>;
  completedCount: Ref<number>;
  totalCount: number;
  statusTitle: Ref<string>;
  statusDesc: Ref<string>;
  steps: Ref<ProbeStepItem[]>;
  currentChallenges: Ref<Challenge[]>;
  statusAlert: Ref<StatusAlertInfo | null>;
  analysisResult: Ref<GlobalAnalysisResult | null>;
  totalBankModelsCount: number;
  startTest: (config: ClientConfig) => Promise<void>;
  cancelTest: () => void;
  resetTest: () => void;
  refreshQuestions: () => void;
  refreshSingleQuestion: (index: number) => void;
}

export function useProbeTest(): UseProbeTestReturn {
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

  // 初始化首次选题
  const currentChallenges = ref<Challenge[]>(generateChallenges(totalCount));

  let currentRunId = 0;
  let abortController: AbortController | null = null;

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

  const totalBankModelsCount = unifiedBank?.models?.length || 18;

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
    progressPercent.value = 0;
    completedCount.value = 0;
    statusTitle.value = "探测题目";
    statusDesc.value = "已就绪，点击开始测试发起探测";
    statusAlert.value = null;
    analysisResult.value = null;
    currentChallenges.value = generateChallenges(totalCount);
    steps.value = createInitialSteps(currentChallenges.value);
  }

  async function startTest(config: ClientConfig): Promise<void> {
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

    // Reset UI state for new test run
    isRunning.value = true;
    hasStarted.value = true;
    hasResult.value = false;
    statusAlert.value = null;
    analysisResult.value = null;
    progressPercent.value = 0;
    completedCount.value = 0;
    statusTitle.value = "探测进行中";
    statusDesc.value = "正在发起测试请求...";
    // 使用当前选定好的 3 道题目（若未就绪则重新生成）
    const challenges: Challenge[] =
      currentChallenges.value.length === totalCount
        ? currentChallenges.value
        : generateChallenges(totalCount);
    currentChallenges.value = challenges;

    const outputs: (ProbeOutputItem | null)[] = new Array(totalCount).fill(null);
    const errors: string[] = [];

    // 初始化步骤信息，包含题目内容和预期数量
    steps.value = challenges.map((ch, idx) => ({
      id: idx,
      state: "working",
      stateText: "请求中...",
      statText: "执行",
      prompt: ch.prompt,
      expectedCount: ch.expected_count,
    }));

    const tasks = challenges.map(async (challenge, i) => {
      const minimum = Math.max(80, Math.ceil(challenge.expected_count * 0.55));
      let accepted = false;
      let finalResponseText = "";
      let lastParsedNumbers: number[] = [];
      let lastErrMsg = "";

      // 最多尝试 2 次（初次执行 + 失败后最多静默重试 1 次）
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (runId !== currentRunId) return;
        try {
          const response = await sendProbe({
            baseUrl,
            apiKey,
            model,
            prompt: challenge.prompt,
            apiFormat,
            reasoningEffort,
            stream: isStream,
            timeoutSeconds,
            signal: abortController?.signal,
          });

          if (runId !== currentRunId) return;

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
          if (runId !== currentRunId) return;
          lastErrMsg = err instanceof Error ? err.message : String(err);
          console.error(`第 ${i + 1} 题第 ${attempt} 次尝试失败:`, err);
        }
      }

      if (runId !== currentRunId) return;

      try {
        if (accepted) {
          steps.value[i] = {
            id: i,
            state: "done",
            stateText: "已采纳",
            statText: `${lastParsedNumbers.length} 个数字`,
            prompt: challenge.prompt,
            expectedCount: challenge.expected_count,
            answer: finalResponseText,
            parsedNumbers: lastParsedNumbers,
          };
          outputs[i] = {
            text: finalResponseText,
            expected_count: challenge.expected_count,
          };
        } else if (lastParsedNumbers.length > 0) {
          steps.value[i] = {
            id: i,
            state: "error",
            stateText: "数字不足",
            statText: `${lastParsedNumbers.length}/${minimum}`,
            prompt: challenge.prompt,
            expectedCount: challenge.expected_count,
            answer: finalResponseText,
            parsedNumbers: lastParsedNumbers,
            error: lastErrMsg,
          };
          errors.push(`第 ${i + 1} 题: ${lastErrMsg}`);
        } else {
          steps.value[i] = {
            id: i,
            state: "error",
            stateText: "失败",
            statText: "错误",
            prompt: challenge.prompt,
            expectedCount: challenge.expected_count,
            answer: finalResponseText || undefined,
            error: lastErrMsg,
          };
          errors.push(`第 ${i + 1} 题失败: ${lastErrMsg}`);
        }
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

    const validOutputs = outputs.filter((item): item is ProbeOutputItem => item !== null);

    // Process evaluation and output results
    if (validOutputs.length === 0) {
      statusTitle.value = "未获得有效样本";
      statusDesc.value = "3 题测试均未能获取合规输出，请检查错误原因。";
      statusAlert.value = {
        message: errors.join("；\n") || "未获得任何可分析输出。",
        type: "error",
      };
    } else {
      statusTitle.value = "测试完成";
      statusDesc.value = `成功采纳 ${validOutputs.length}/${totalCount} 份有效输出样本`;
      try {
        analysisResult.value = analyzeGlobalOutputs(validOutputs, unifiedBank);
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
    abortController = null;
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
    totalBankModelsCount,
    startTest,
    cancelTest,
    resetTest,
    refreshQuestions,
    refreshSingleQuestion,
  };
}
