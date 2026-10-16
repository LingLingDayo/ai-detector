import type { Challenge } from "./challenge";
import type {
  ProbeStepItem,
  StatusAlertInfo,
  ProbeHistoryItem,
} from "../types";
import {
  analyzeGlobalOutputs,
  type UnifiedBank,
  type ProbeOutputItem,
  type GlobalAnalysisResult,
} from "./fingerprint";
import type { SingleProbeResult } from "../services/probeRunner";
import { maskApiKey } from "./pelicanFormatters";

export function createInitialSteps(challenges: Challenge[]): ProbeStepItem[] {
  return challenges.map((ch, idx) => ({
    id: idx,
    state: "pending",
    stateText: "待测试",
    statText: `${ch.expected_count} 个数字`,
    prompt: ch.prompt,
    expectedCount: ch.expected_count,
  }));
}

export function formatProbeStepResult(
  index: number,
  challenge: Challenge,
  res: SingleProbeResult
): ProbeStepItem {
  if (res.accepted) {
    return {
      id: index,
      state: "done",
      stateText: "已采纳",
      statText: `${res.parsedNumbers.length} 个数字`,
      prompt: challenge.prompt,
      expectedCount: challenge.expected_count,
      answer: res.finalResponseText,
      parsedNumbers: res.parsedNumbers,
    };
  }
  if (res.parsedNumbers.length > 0) {
    return {
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
  }
  return {
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

export function createFailedStep(
  index: number,
  challenge: Challenge,
  error = "请求中断或未获取到结果",
  stateText = "失败"
): ProbeStepItem {
  return {
    id: index,
    state: "error",
    stateText,
    statText: "未完成",
    prompt: challenge.prompt,
    expectedCount: challenge.expected_count,
    error,
  };
}

export function createCancelledSteps(steps: ProbeStepItem[]): ProbeStepItem[] {
  return steps.map((s) => {
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
}

export function computeProgress(
  steps: ProbeStepItem[],
  totalCount: number
): { completedCount: number; progressPercent: number } {
  const completed = steps.filter(
    (s) => s.state === "done" || s.state === "error"
  ).length;
  return {
    completedCount: completed,
    progressPercent: Math.round((completed / totalCount) * 100),
  };
}

export function computeRunningStatusDesc(
  steps: ProbeStepItem[],
  totalCount: number
): string | null {
  const workingIndices = steps
    .map((s, i) => (s.state === "working" ? i + 1 : null))
    .filter((n): n is number => n !== null);

  if (workingIndices.length === 0) return null;
  if (workingIndices.length === totalCount) {
    return "已同时发起 3 题并发测试请求...";
  }
  if (workingIndices.length === 1) {
    return `正在测试第 ${workingIndices[0]} 题，请稍候...`;
  }
  return `正在同时测试第 ${workingIndices.join("、")} 题，请稍候...`;
}

export function collectStepErrors(steps: ProbeStepItem[]): string[] {
  return steps
    .map((s, i) => (s.state === "error" && s.error ? `第 ${i + 1} 题: ${s.error}` : null))
    .filter((v): v is string => Boolean(v));
}

export function extractValidOutputs(steps: ProbeStepItem[]): ProbeOutputItem[] {
  const validOutputs: ProbeOutputItem[] = [];
  for (const s of steps) {
    if (s.state === "done" && s.answer) {
      validOutputs.push({
        text: s.answer,
        expected_count: s.expectedCount,
      });
    }
  }
  return validOutputs;
}

export interface FinalEvaluationParams {
  steps: ProbeStepItem[];
  unifiedBank: UnifiedBank;
  totalCount: number;
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  configName?: string;
}

export interface FinalEvaluationResult {
  statusTitle: string;
  statusDesc: string;
  statusAlert: StatusAlertInfo | null;
  analysisResult: GlobalAnalysisResult | null;
  historyItemPayload: Omit<ProbeHistoryItem, "id" | "createdAt"> | null;
}

export function performFinalEvaluation(
  params: FinalEvaluationParams
): FinalEvaluationResult {
  const {
    steps,
    unifiedBank,
    totalCount,
    baseUrl,
    apiKey,
    model,
    reasoningEffort,
    configName,
  } = params;

  const validOutputs = extractValidOutputs(steps);
  const allErrors = collectStepErrors(steps);

  if (validOutputs.length === 0) {
    return {
      statusTitle: "未获得有效样本",
      statusDesc: "3 题测试均未能获取合规输出，请检查错误原因。",
      statusAlert: {
        message: allErrors.join("\n") || "未获得任何可分析输出。",
        type: "error",
      },
      analysisResult: null,
      historyItemPayload: null,
    };
  }

  const statusTitle = "测试完成";
  const statusDesc =
    validOutputs.length === totalCount
      ? "3 题测试均已完成并成功采纳！"
      : `成功采纳 ${validOutputs.length}/${totalCount} 份有效输出样本`;

  let statusAlert: StatusAlertInfo | null =
    allErrors.length > 0
      ? { message: allErrors.join("\n"), type: "error" }
      : null;

  let analysisResult: GlobalAnalysisResult | null = null;
  let historyItemPayload: Omit<ProbeHistoryItem, "id" | "createdAt"> | null = null;

  try {
    analysisResult = analyzeGlobalOutputs(validOutputs, unifiedBank);
    if (analysisResult) {
      const candidates = (analysisResult.results || []).slice(0, 3).map((r) => ({
        model: r.model,
        displayName: r.display_name,
        probability: r.probability,
        familyName: r.family_name,
      }));

      historyItemPayload = {
        configName: configName?.trim() || undefined,
        baseUrl,
        apiKey: maskApiKey(apiKey),
        modelName: model,
        reasoningEffort: reasoningEffort || "high",
        prediction: analysisResult.prediction,
        predictionName: analysisResult.prediction_name || analysisResult.prediction,
        probability: analysisResult.probability,
        familyPredictionName:
          analysisResult.family_prediction_name || analysisResult.family_prediction,
        familyProbability: analysisResult.family_probability,
        usedOutputs: analysisResult.used_outputs,
        candidates,
        fullAnalysis: analysisResult,
      };
    }
  } catch (analysisErr: unknown) {
    const errMsg =
      analysisErr instanceof Error ? analysisErr.message : String(analysisErr);
    statusAlert = {
      message: `归因计算异常: ${errMsg}`,
      type: "error",
    };
  }

  return {
    statusTitle,
    statusDesc,
    statusAlert,
    analysisResult,
    historyItemPayload,
  };
}
