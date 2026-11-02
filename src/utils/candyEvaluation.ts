import type {
  CandyChallenge,
  CandyAnalysisResult,
  CandyHistoryItem,
  CandyStepDiagnostic,
  ProbeStepItem,
  StatusAlertInfo,
} from "../types";
import type { SingleCandyRunResult } from "../services/candyRunner";
import { maskApiKey } from "./pelicanFormatters";

export const CANDY_PASS_THRESHOLD = 2;

export function createInitialCandySteps(challenges: CandyChallenge[]): ProbeStepItem[] {
  return challenges.map((ch, idx) => ({
    id: idx,
    state: "pending",
    stateText: "待测试",
    statText: `答案: ${ch.expectedAnswer}`,
    prompt: ch.prompt,
    expectedAnswer: ch.expectedAnswer,
    optimalCircle: ch.optimalCircle,
    optimalStar: ch.optimalStar,
  }));
}

export function formatCandyStepResult(
  index: number,
  challenge: CandyChallenge,
  res: SingleCandyRunResult
): ProbeStepItem {
  if (res.hasResponse && res.isCorrect) {
    return {
      id: index,
      state: "done",
      stateText: "回答正确",
      statText: `答 ${res.extractedAnswer} · 正确`,
      prompt: challenge.prompt,
      expectedAnswer: challenge.expectedAnswer,
      optimalCircle: challenge.optimalCircle,
      optimalStar: challenge.optimalStar,
      modelAnswer: res.extractedAnswer,
      isCorrect: true,
      answer: res.finalResponseText,
      durationMs: res.durationMs,
    };
  }

  if (res.hasResponse && !res.isCorrect) {
    const modelAnsLabel = res.extractedAnswer !== null ? `答 ${res.extractedAnswer}` : "未识别";
    return {
      id: index,
      state: "error",
      stateText: "回答错误",
      statText: `${modelAnsLabel} (正确 ${challenge.expectedAnswer})`,
      prompt: challenge.prompt,
      expectedAnswer: challenge.expectedAnswer,
      optimalCircle: challenge.optimalCircle,
      optimalStar: challenge.optimalStar,
      modelAnswer: res.extractedAnswer,
      isCorrect: false,
      answer: res.finalResponseText,
      durationMs: res.durationMs,
      error: res.lastErrMsg,
    };
  }

  return {
    id: index,
    state: "error",
    stateText: "请求失败",
    statText: `答案: ${challenge.expectedAnswer}`,
    prompt: challenge.prompt,
    expectedAnswer: challenge.expectedAnswer,
    optimalCircle: challenge.optimalCircle,
    optimalStar: challenge.optimalStar,
    modelAnswer: null,
    isCorrect: false,
    answer: res.finalResponseText || undefined,
    durationMs: res.durationMs,
    error: res.lastErrMsg || "请求未返回有效结果",
  };
}

export function createFailedCandyStep(
  index: number,
  challenge: CandyChallenge,
  error = "请求中断或未获取到结果",
  stateText = "请求失败"
): ProbeStepItem {
  return {
    id: index,
    state: "error",
    stateText,
    statText: `答案: ${challenge.expectedAnswer}`,
    prompt: challenge.prompt,
    expectedAnswer: challenge.expectedAnswer,
    optimalCircle: challenge.optimalCircle,
    optimalStar: challenge.optimalStar,
    modelAnswer: null,
    isCorrect: false,
    error,
  };
}

export function createCancelledCandySteps(steps: ProbeStepItem[]): ProbeStepItem[] {
  return steps.map((s) => {
    if (s.state === "working" || s.state === "pending") {
      return {
        ...s,
        state: "cancelled",
        stateText: "已取消",
        statText: s.expectedAnswer !== undefined ? `答案: ${s.expectedAnswer}` : "已中断",
      };
    }
    return s;
  });
}

export function collectCandyNetworkErrors(steps: ProbeStepItem[]): string[] {
  return steps
    .map((s, i) => {
      // 仅收集无模型回答的底层请求报错；模型答错题在诊断报告中专门展示，不作为网络错误告警
      if (s.state === "error" && !s.answer && s.error) {
        return `第 ${i + 1} 题: ${s.error}`;
      }
      return null;
    })
    .filter((v): v is string => Boolean(v));
}

export interface CandyFinalEvaluationParams {
  steps: ProbeStepItem[];
  challenges: CandyChallenge[];
  totalCount: number;
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  configName?: string;
}

export interface CandyFinalEvaluationResult {
  statusTitle: string;
  statusDesc: string;
  statusAlert: StatusAlertInfo | null;
  analysisResult: CandyAnalysisResult | null;
  historyItemPayload: Omit<CandyHistoryItem, "id" | "createdAt"> | null;
}

export function performCandyFinalEvaluation(
  params: CandyFinalEvaluationParams
): CandyFinalEvaluationResult {
  const {
    steps,
    challenges,
    totalCount,
    baseUrl,
    apiKey,
    model,
    reasoningEffort,
    configName,
  } = params;

  const networkErrors = collectCandyNetworkErrors(steps);
  const answeredCount = steps.filter((s) => Boolean(s.answer)).length;

  if (answeredCount === 0) {
    return {
      statusTitle: "未获得有效回答",
      statusDesc: "3 题测试均未获取到模型输出，请检查连接或重试。",
      statusAlert: {
        message: networkErrors.join("\n") || "未收到任何模型响应内容。",
        type: "error",
      },
      analysisResult: null,
      historyItemPayload: null,
    };
  }

  const diagnostics: CandyStepDiagnostic[] = steps.map((s, idx) => {
    const ch = challenges[idx];
    return {
      index: idx,
      prompt: s.prompt || ch?.prompt || "",
      circleApple: ch?.circleApple ?? 0,
      circlePeach: ch?.circlePeach ?? 0,
      circleWatermelon: ch?.circleWatermelon ?? 0,
      starApple: ch?.starApple ?? 0,
      starPeach: ch?.starPeach ?? 0,
      starWatermelon: ch?.starWatermelon ?? 0,
      expectedAnswer: s.expectedAnswer ?? ch?.expectedAnswer ?? 0,
      optimalCircle: s.optimalCircle ?? ch?.optimalCircle ?? 0,
      optimalStar: s.optimalStar ?? ch?.optimalStar ?? 0,
      modelAnswer: s.modelAnswer ?? null,
      isCorrect: Boolean(s.isCorrect),
      answer: s.answer,
      error: s.error,
      durationMs: s.durationMs,
    };
  });

  const correctCount = diagnostics.filter((d) => d.isCorrect).length;
  const passed = correctCount >= CANDY_PASS_THRESHOLD;
  const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

  const validDurations = diagnostics
    .map((d) => d.durationMs || 0)
    .filter((ms) => ms > 0);
  const totalDurationMs = validDurations.reduce((sum, v) => sum + v, 0);
  const avgDurationMs =
    validDurations.length > 0 ? Math.round(totalDurationMs / validDurations.length) : 0;

  const statusTitle = passed ? "糖果测试通过" : "糖果测试未通过";
  const statusDesc = passed
    ? `连续 ${totalCount} 题中答对 ${correctCount} 题（需 ≥ ${CANDY_PASS_THRESHOLD} 题），模型长逻辑链推理表现正常`
    : `连续 ${totalCount} 题中仅答对 ${correctCount} 题（需 ≥ ${CANDY_PASS_THRESHOLD} 题），模型可能遭遇降智或思考链截断`;

  const statusAlert: StatusAlertInfo | null =
    networkErrors.length > 0
      ? { message: networkErrors.join("\n"), type: "error" }
      : null;

  const analysisResult: CandyAnalysisResult = {
    passed,
    correctCount,
    totalCount,
    accuracy,
    avgDurationMs,
    totalDurationMs,
    diagnostics,
  };

  const historyItemPayload: Omit<CandyHistoryItem, "id" | "createdAt"> = {
    configName: configName?.trim() || undefined,
    baseUrl,
    apiKey: maskApiKey(apiKey),
    modelName: model,
    reasoningEffort: reasoningEffort || "high",
    passed,
    correctCount,
    totalCount,
    accuracy,
    avgDurationMs,
    totalDurationMs,
    diagnostics,
  };

  return {
    statusTitle,
    statusDesc,
    statusAlert,
    analysisResult,
    historyItemPayload,
  };
}
