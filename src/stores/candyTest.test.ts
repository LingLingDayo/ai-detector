import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import candyTestSource from "./candyTest.ts?raw";
import candyRunnerSource from "../services/candyRunner.ts?raw";
import candyEvaluationSource from "../utils/candyEvaluation.ts?raw";
import candyHistorySource from "../utils/candyHistory.ts?raw";
import candyChallengeSource from "../utils/candyChallenge.ts?raw";
import {
  solveCandyCounts,
  extractCandyAnswer,
  generateCandyChallengesSync,
  generateSingleCandyChallengeSync,
} from "../utils/candyChallenge";
import {
  CANDY_PASS_THRESHOLD,
  performCandyFinalEvaluation,
} from "../utils/candyEvaluation";
import { useCandyTestStore } from "./candyTest";
import { useConfigStore } from "./config";
import type { CandyHistoryItem, ProbeStepItem } from "../types";

// Mock localStorage for node environment
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("candyTest 模块结构与职责拆分", () => {
  it("拆分文件均已存在且包含核心导出", () => {
    expect(candyRunnerSource).toContain("export async function executeSingleCandy");
    expect(candyEvaluationSource).toContain("export function createInitialCandySteps");
    expect(candyEvaluationSource).toContain("export function formatCandyStepResult");
    expect(candyEvaluationSource).toContain("export function performCandyFinalEvaluation");
    expect(candyHistorySource).toContain("export function loadInitialCandyHistory");
    expect(candyHistorySource).toContain("export function persistCandyHistory");
    expect(candyChallengeSource).toContain("export function solveCandyCounts");
    expect(candyChallengeSource).toContain("export function extractCandyAnswer");
  });

  it("useCandyTestStore 导出完整的测试控制、换题、历史记录与详情弹窗方法", () => {
    const requiredExports = [
      "isRunning",
      "hasStarted",
      "hasResult",
      "progressPercent",
      "completedCount",
      "totalCount",
      "statusTitle",
      "statusDesc",
      "steps",
      "currentChallenges",
      "statusAlert",
      "analysisResult",
      "currentCandyHistoryItem",
      "candyHistoryList",
      "testedModel",
      "isDetailModalOpen",
      "selectedDetailIndex",
      "openDetailModal",
      "closeDetailModal",
      "startTest",
      "cancelTest",
      "resetTest",
      "refreshQuestions",
      "refreshSingleQuestion",
      "retrySingleQuestion",
      "deleteCandyHistoryItem",
      "clearCandyHistory",
      "applyHistoryItem",
    ];

    for (const exp of requiredExports) {
      expect(candyTestSource, `useCandyTestStore 导出对象应包含 ${exp}`).toContain(exp);
    }
  });
});

describe("糖果题数学求解器与答案提取器", () => {
  it("经典原题 (7,9,8) 与 (7,6,4) 精确求得最优解 21 (圆形 9 + 星形 12)", () => {
    const result = solveCandyCounts(7, 9, 8, 7, 6, 4);
    expect(result.expectedAnswer).toBe(21);
    expect(result.optimalCircle).toBe(9);
    expect(result.optimalStar).toBe(12);
  });

  it("动态参数组合可求得严格满足最坏情况约束的最小抓取值", () => {
    const challenges = generateCandyChallengesSync(3);
    expect(challenges).toHaveLength(3);
    for (const ch of challenges) {
      expect(ch.expectedAnswer).toBe(ch.optimalCircle + ch.optimalStar);
      expect(ch.optimalCircle).toBeGreaterThan(ch.circleWatermelon);
      expect(ch.optimalStar).toBeGreaterThan(ch.starWatermelon);
      expect(
        ch.optimalCircle > ch.circlePeach + ch.circleWatermelon ||
          ch.optimalStar > ch.starPeach + ch.starWatermelon
      ).toBe(true);
      expect(
        ch.optimalCircle > ch.circleApple + ch.circleWatermelon ||
          ch.optimalStar > ch.starApple + ch.starWatermelon
      ).toBe(true);
    }
  });

  it("extractCandyAnswer 支持标准答案标记、LaTeX boxed 与自然语言结尾提取", () => {
    expect(extractCandyAnswer("经过分类讨论，最终【答案：21】")).toBe(21);
    expect(extractCandyAnswer("Minimum is [Answer: 24]")).toBe(24);
    expect(extractCandyAnswer("Therefore \\boxed{19} candies.")).toBe(19);
    expect(extractCandyAnswer("综上所述，至少需要抓出 22 颗糖果。")).toBe(22);
    expect(extractCandyAnswer("25")).toBe(25);
    expect(extractCandyAnswer("")).toBeNull();
  });
});

describe("糖果测试 3 题连续判定逻辑 (2 题正确即通过)", () => {
  const sampleChallenges = [
    generateSingleCandyChallengeSync(0),
    generateSingleCandyChallengeSync(1),
    generateSingleCandyChallengeSync(2),
  ];

  function buildMockSteps(correctFlags: [boolean, boolean, boolean]): ProbeStepItem[] {
    return sampleChallenges.map((ch, idx) => {
      const isCorrect = correctFlags[idx];
      const modelAns = isCorrect ? ch.expectedAnswer : ch.expectedAnswer + 8;
      return {
        id: idx,
        state: isCorrect ? "done" : "error",
        stateText: isCorrect ? "回答正确" : "回答错误",
        statText: isCorrect ? `答 ${modelAns} · 正确` : `答 ${modelAns}`,
        prompt: ch.prompt,
        answer: `推理过程...【答案：${modelAns}】`,
        expectedAnswer: ch.expectedAnswer,
        modelAnswer: modelAns,
        isCorrect,
        optimalCircle: ch.optimalCircle,
        optimalStar: ch.optimalStar,
        durationMs: 1200 + idx * 300,
      };
    });
  }

  it("3 题对 2 题时判定为测试通过 (passed = true)", () => {
    expect(CANDY_PASS_THRESHOLD).toBe(2);
    const steps = buildMockSteps([true, false, true]);
    const evalResult = performCandyFinalEvaluation({
      steps,
      challenges: sampleChallenges,
      totalCount: 3,
      baseUrl: "https://api.example.com",
      apiKey: "sk-12345678",
      model: "claude-3-7-sonnet",
    });

    expect(evalResult.analysisResult?.passed).toBe(true);
    expect(evalResult.analysisResult?.correctCount).toBe(2);
    expect(evalResult.analysisResult?.totalCount).toBe(3);
    expect(evalResult.analysisResult?.accuracy).toBeCloseTo(2 / 3);
    expect(evalResult.statusAlert).toBeNull();
    expect(evalResult.statusTitle).toContain("通过");
  });

  it("3 题全对时判定为测试通过且正确率为 100%", () => {
    const steps = buildMockSteps([true, true, true]);
    const evalResult = performCandyFinalEvaluation({
      steps,
      challenges: sampleChallenges,
      totalCount: 3,
      baseUrl: "https://api.example.com",
      apiKey: "sk-12345678",
      model: "gpt-4o",
    });

    expect(evalResult.analysisResult?.passed).toBe(true);
    expect(evalResult.analysisResult?.correctCount).toBe(3);
    expect(evalResult.analysisResult?.accuracy).toBe(1);
  });

  it("3 题仅对 1 题或全错时判定为测试未通过 (passed = false)", () => {
    const steps = buildMockSteps([true, false, false]);
    const evalResult = performCandyFinalEvaluation({
      steps,
      challenges: sampleChallenges,
      totalCount: 3,
      baseUrl: "https://api.example.com",
      apiKey: "sk-12345678",
      model: "gpt-4o",
    });

    expect(evalResult.analysisResult?.passed).toBe(false);
    expect(evalResult.analysisResult?.correctCount).toBe(1);
    expect(evalResult.statusTitle).toContain("未通过");
  });
});

describe("useCandyTestStore 状态管理、换一换与历史记录", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("初始化时默认生成连续 3 道糖果题并支持整组换一换与单题换一换", () => {
    const store = useCandyTestStore();
    expect(store.steps).toHaveLength(3);
    expect(store.currentChallenges).toHaveLength(3);
    expect(store.totalCount).toBe(3);

    const prevPrompt0 = store.steps[0].prompt;
    store.refreshSingleQuestion(0);
    expect(store.steps[0].state).toBe("pending");
    expect(store.steps[0].expectedAnswer).toBe(store.currentChallenges[0].expectedAnswer);
    expect(store.steps[0].prompt).toBe(store.currentChallenges[0].prompt);
    expect(typeof prevPrompt0).toBe("string");

    store.refreshQuestions();
    expect(store.steps).toHaveLength(3);
    expect(store.hasResult).toBe(false);
  });

  it("支持打开与关闭单题详情弹窗，方便复用 ProbeDetailModal 查看题目、标准答案与回复", () => {
    const store = useCandyTestStore();
    expect(store.isDetailModalOpen).toBe(false);

    store.openDetailModal(1);
    expect(store.isDetailModalOpen).toBe(true);
    expect(store.selectedDetailIndex).toBe(1);

    store.closeDetailModal();
    expect(store.isDetailModalOpen).toBe(false);
  });

  it("支持应用、删除与清空糖果测试历史记录", () => {
    const store = useCandyTestStore();
    const challenges = generateCandyChallengesSync(3);

    const mockHistoryItem: CandyHistoryItem = {
      id: "candy_hist_1",
      createdAt: Date.now(),
      configName: "测试配置",
      baseUrl: "https://api.example.com",
      apiKey: "sk-***",
      modelName: "deepseek-r1",
      reasoningEffort: "high",
      passed: true,
      correctCount: 2,
      totalCount: 3,
      accuracy: 2 / 3,
      avgDurationMs: 1500,
      totalDurationMs: 4500,
      diagnostics: challenges.map((ch, idx) => ({
        index: idx,
        prompt: ch.prompt,
        circleApple: ch.circleApple,
        circlePeach: ch.circlePeach,
        circleWatermelon: ch.circleWatermelon,
        starApple: ch.starApple,
        starPeach: ch.starPeach,
        starWatermelon: ch.starWatermelon,
        expectedAnswer: ch.expectedAnswer,
        optimalCircle: ch.optimalCircle,
        optimalStar: ch.optimalStar,
        modelAnswer: idx < 2 ? ch.expectedAnswer : 29,
        isCorrect: idx < 2,
        answer: `推理过程【答案：${idx < 2 ? ch.expectedAnswer : 29}】`,
        durationMs: 1500,
      })),
    };

    store.candyHistoryList = [mockHistoryItem];
    store.applyHistoryItem(mockHistoryItem);

    expect(store.hasResult).toBe(true);
    expect(store.analysisResult?.passed).toBe(true);
    expect(store.analysisResult?.correctCount).toBe(2);
    expect(store.testedModel).toBe("deepseek-r1");
    expect(store.steps[0].state).toBe("done");
    expect(store.steps[2].state).toBe("error");

    store.deleteCandyHistoryItem("candy_hist_1");
    expect(store.candyHistoryList).toHaveLength(0);
  });

  it("在 configStore 中切换到 candy 模式时正确继承或隔离配置", () => {
    const configStore = useConfigStore();
    const candyStore = useCandyTestStore();

    configStore.probeConfig.baseUrl = "https://api.candy-test.com";
    configStore.probeConfig.apiKey = "sk-candy-key";
    configStore.probeConfig.modelName = "o3-mini";
    configStore.probeConfig.reasoningEffort = "high";

    configStore.setActiveMode("candy");
    expect(configStore.activeMode).toBe("candy");
    expect(configStore.candyConfig.baseUrl).toBe("https://api.candy-test.com");
    expect(configStore.candyConfig.modelName).toBe("o3-mini");

    // 当糖果测试正在运行时，从其他模式切回 candy 不会覆盖正在运行的配置
    candyStore.isRunning = true;
    configStore.setActiveMode("pelican");
    configStore.pelicanConfig.modelName = "other-model";
    configStore.setActiveMode("candy");
    expect(configStore.candyConfig.modelName).toBe("o3-mini");
  });
});
