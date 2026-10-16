import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("probeTest.ts 保证 sync-upstream.js 正则兼容性", () => {
  const storeContent = fs.readFileSync(
    path.resolve(__dirname, "../../src/stores/probeTest.ts"),
    "utf-8"
  );
  const regex = /(const\s+totalBankModelsCount\s*=\s*unifiedBank\?\.models\?\.length\s*\|\|\s*)\d+;/;
  assert.ok(regex.test(storeContent), "必须保留 totalBankModelsCount 的正则匹配模式供 sync-upstream.js 使用");
});

test("probeTest.ts 拆分后代码量大幅精简至 500 行以内（原 812 行）", () => {
  const storeContent = fs.readFileSync(
    path.resolve(__dirname, "../../src/stores/probeTest.ts"),
    "utf-8"
  );
  const lineCount = storeContent.split("\n").length;
  assert.ok(
    lineCount < 500,
    `probeTest.ts 期望在 500 行以内，当前行数: ${lineCount}`
  );
});

test("拆分文件均已存在且包含核心导出", () => {
  const runnerFile = fs.readFileSync(
    path.resolve(__dirname, "../../src/services/probeRunner.ts"),
    "utf-8"
  );
  const evalFile = fs.readFileSync(
    path.resolve(__dirname, "../../src/utils/probeEvaluation.ts"),
    "utf-8"
  );
  const histFile = fs.readFileSync(
    path.resolve(__dirname, "../../src/utils/probeHistory.ts"),
    "utf-8"
  );

  assert.ok(runnerFile.includes("export async function executeSingleProbe"), "probeRunner 应导出 executeSingleProbe");
  assert.ok(evalFile.includes("export function createInitialSteps"), "probeEvaluation 应导出 createInitialSteps");
  assert.ok(evalFile.includes("export function formatProbeStepResult"), "probeEvaluation 应导出 formatProbeStepResult");
  assert.ok(evalFile.includes("export function performFinalEvaluation"), "probeEvaluation 应导出 performFinalEvaluation");
  assert.ok(histFile.includes("export function loadInitialProbeHistory"), "probeHistory 应导出 loadInitialProbeHistory");
  assert.ok(histFile.includes("export function persistProbeHistory"), "probeHistory 应导出 persistProbeHistory");
});

test("useProbeTestStore 包含所有既有导出方法与状态属性", () => {
  const storeContent = fs.readFileSync(
    path.resolve(__dirname, "../../src/stores/probeTest.ts"),
    "utf-8"
  );

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
    assert.ok(
      storeContent.includes(exp),
      `useProbeTestStore 导出对象应包含 ${exp}`
    );
  }
});
