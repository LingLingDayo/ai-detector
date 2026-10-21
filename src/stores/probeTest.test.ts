import { describe, expect, it } from "vitest";
import probeTestSource from "./probeTest.ts?raw";
import probeRunnerSource from "../services/probeRunner.ts?raw";
import probeEvaluationSource from "../utils/probeEvaluation.ts?raw";
import probeHistorySource from "../utils/probeHistory.ts?raw";

describe("probeTest 模块结构", () => {
  it("probeTest.ts 保证 sync-upstream.js 正则兼容性", () => {
    const regex =
      /(const\s+totalBankModelsCount\s*=\s*unifiedBank\?\.models\?\.length\s*\|\|\s*)\d+;/;
    expect(
      regex.test(probeTestSource),
      "必须保留 totalBankModelsCount 的正则匹配模式供 sync-upstream.js 使用"
    ).toBe(true);
  });

  it("probeTest.ts 拆分后代码量大幅精简至 500 行以内（原 812 行）", () => {
    const lineCount = probeTestSource.split("\n").length;
    expect(lineCount, `probeTest.ts 期望在 500 行以内，当前行数: ${lineCount}`).toBeLessThan(500);
  });

  it("拆分文件均已存在且包含核心导出", () => {
    expect(probeRunnerSource).toContain("export async function executeSingleProbe");
    expect(probeEvaluationSource).toContain("export function createInitialSteps");
    expect(probeEvaluationSource).toContain("export function formatProbeStepResult");
    expect(probeEvaluationSource).toContain("export function performFinalEvaluation");
    expect(probeHistorySource).toContain("export function loadInitialProbeHistory");
    expect(probeHistorySource).toContain("export function persistProbeHistory");
  });

  it("useProbeTestStore 包含所有既有导出方法与状态属性", () => {
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
      "currentProbeHistoryItem",
      "totalBankModelsCount",
      "probeHistoryList",
      "testedModel",
      "startTest",
      "cancelTest",
      "resetTest",
      "refreshQuestions",
      "refreshSingleQuestion",
      "retrySingleQuestion",
      "deleteProbeHistoryItem",
      "clearProbeHistory",
      "applyHistoryItem",
    ];

    for (const exp of requiredExports) {
      expect(probeTestSource, `useProbeTestStore 导出对象应包含 ${exp}`).toContain(exp);
    }
  });

  it("useProbeTestStore 包含详情弹窗管理状态与方法", () => {
    expect(probeTestSource).toContain("isDetailModalOpen");
    expect(probeTestSource).toContain("selectedDetailIndex");
    expect(probeTestSource).toContain("openDetailModal");
    expect(probeTestSource).toContain("closeDetailModal");
  });
});
