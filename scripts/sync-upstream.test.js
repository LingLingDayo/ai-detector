import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeText,
  compareBankModels,
  compareBankFile,
  validateBank,
  checkFallbackDiff,
} from "./sync-upstream.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("normalizeText 能正确消除 CRLF 与换行空白差异", () => {
  const inputWithCrlf = "  {\r\n  \"test\": 123\r\n}  \r\n";
  const expected = "{\n  \"test\": 123\n}";
  assert.strictEqual(normalizeText(inputWithCrlf), expected);
  assert.strictEqual(normalizeText(""), "");
  assert.strictEqual(normalizeText(null), "");
});

test("compareBankModels 能精准对比模型变动", () => {
  const oldModels = [{ id: "model-a" }, { id: "model-b" }, { id: "model-c" }];

  // 1. 完全一致
  const sameResult = compareBankModels(oldModels, [{ id: "model-a" }, { id: "model-b" }, { id: "model-c" }]);
  assert.strictEqual(sameResult.isModelListEqual, true);
  assert.strictEqual(sameResult.added.length, 0);
  assert.strictEqual(sameResult.removed.length, 0);

  // 2. 新增模型
  const addedResult = compareBankModels(oldModels, [
    { id: "model-a" },
    { id: "model-b" },
    { id: "model-c" },
    { id: "model-d" },
  ]);
  assert.strictEqual(addedResult.isModelListEqual, false);
  assert.deepStrictEqual(addedResult.added, ["model-d"]);
  assert.strictEqual(addedResult.removed.length, 0);

  // 3. 移除并新增模型
  const diffResult = compareBankModels(oldModels, [
    { id: "model-b" },
    { id: "model-c" },
    { id: "model-e" },
  ]);
  assert.strictEqual(diffResult.isModelListEqual, false);
  assert.deepStrictEqual(diffResult.added, ["model-e"]);
  assert.deepStrictEqual(diffResult.removed, ["model-a"]);
});

test("compareBankFile 能正确区分未变更、已变更与新增状态", () => {
  const sampleBankA = JSON.stringify({
    models: [{ id: "m1" }],
    calibration: { k: 1 },
    robust: {},
  });
  const sampleBankB = JSON.stringify({
    models: [{ id: "m1" }, { id: "m2" }],
    calibration: { k: 1 },
    robust: {},
  });
  const sampleBankC = JSON.stringify({
    models: [{ id: "m1" }],
    calibration: { k: 2 },
    robust: {},
  });

  // 1. 本地缺失文件 (新增)
  const addRes = compareBankFile(null, sampleBankA, true);
  assert.strictEqual(addRes.status, "added");
  assert.ok(addRes.summary.includes("本地缺失"));

  // 2. 内容完全一致 (未变)
  const unchangedRes = compareBankFile(sampleBankA, sampleBankA + "\r\n", true);
  assert.strictEqual(unchangedRes.status, "unchanged");
  assert.ok(unchangedRes.summary.includes("完全一致"));

  // 3. 模型清单更新
  const modelDiffRes = compareBankFile(sampleBankA, sampleBankB, true);
  assert.strictEqual(modelDiffRes.status, "modified");
  assert.ok(modelDiffRes.summary.includes("模型清单变动"));
  assert.ok(modelDiffRes.details.some((d) => d.includes("新增模型 (1): m2")));

  // 4. 模型清单相同但参数变动
  const paramDiffRes = compareBankFile(sampleBankA, sampleBankC, true);
  assert.strictEqual(paramDiffRes.status, "modified");
  assert.ok(paramDiffRes.summary.includes("特征参数更新"));

  // 5. 普通文件（非 unified_bank）变更
  const textDiffRes = compareBankFile("abc", "abcdef", false);
  assert.strictEqual(textDiffRes.status, "modified");
  assert.ok(textDiffRes.summary.includes("内容更新"));
});

test("validateBank 能防御非法指纹库结构", () => {
  assert.throws(() => validateBank(null), /不是有效的 JSON 对象/);
  assert.throws(() => validateBank({ models: [] }), /未找到有效的 models 列表/);
  assert.throws(() => validateBank({ models: [{ id: "m1" }] }), /缺少 calibration/);
  assert.throws(() => validateBank({ models: [{ id: "m1" }], calibration: {} }), /缺少 robust/);

  assert.doesNotThrow(() => {
    validateBank({
      models: [{ id: "m1" }],
      calibration: { k: 1 },
      robust: { r: 1 },
    });
  });
});

test("checkFallbackDiff 能正确识别默认模型数量差异", () => {
  const tempFile = path.resolve(__dirname, "../.temp/test-store-fallback.ts");
  if (!fs.existsSync(path.dirname(tempFile))) {
    fs.mkdirSync(path.dirname(tempFile), { recursive: true });
  }

  fs.writeFileSync(
    tempFile,
    "const totalBankModelsCount = unifiedBank?.models?.length || 18;\n",
    "utf-8"
  );

  try {
    // 目标仍为 18，无差异
    const noDiff = checkFallbackDiff(18, [tempFile]);
    assert.strictEqual(noDiff.length, 0);

    // 目标变为 20，检测到差异
    const hasDiff = checkFallbackDiff(20, [tempFile]);
    assert.strictEqual(hasDiff.length, 1);
    assert.strictEqual(hasDiff[0].current, 18);
    assert.strictEqual(hasDiff[0].target, 20);
  } finally {
    // 移入 .temp/trash 或删除测试文件
    const trashDir = path.resolve(__dirname, "../.temp/trash");
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }
    fs.renameSync(tempFile, path.resolve(trashDir, `test-store-fallback-${Date.now()}.ts`));
  }
});
