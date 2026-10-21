import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeText,
  compareBankModels,
  compareBankFile,
  validateBank,
  checkFallbackDiff,
} from "./sync-upstream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("sync-upstream", () => {
  it("normalizeText 能正确消除 CRLF 与换行空白差异", () => {
    const inputWithCrlf = "  {\r\n  \"test\": 123\r\n}  \r\n";
    const expected = "{\n  \"test\": 123\n}";
    expect(normalizeText(inputWithCrlf)).toBe(expected);
    expect(normalizeText("")).toBe("");
    expect(normalizeText(null as unknown as string)).toBe("");
  });

  it("compareBankModels 能精准对比模型变动", () => {
    const oldModels = [{ id: "model-a" }, { id: "model-b" }, { id: "model-c" }];

    // 1. 完全一致
    const sameResult = compareBankModels(oldModels, [
      { id: "model-a" },
      { id: "model-b" },
      { id: "model-c" },
    ]);
    expect(sameResult.isModelListEqual).toBe(true);
    expect(sameResult.added).toHaveLength(0);
    expect(sameResult.removed).toHaveLength(0);

    // 2. 新增模型
    const addedResult = compareBankModels(oldModels, [
      { id: "model-a" },
      { id: "model-b" },
      { id: "model-c" },
      { id: "model-d" },
    ]);
    expect(addedResult.isModelListEqual).toBe(false);
    expect(addedResult.added).toEqual(["model-d"]);
    expect(addedResult.removed).toHaveLength(0);

    // 3. 移除并新增模型
    const diffResult = compareBankModels(oldModels, [
      { id: "model-b" },
      { id: "model-c" },
      { id: "model-e" },
    ]);
    expect(diffResult.isModelListEqual).toBe(false);
    expect(diffResult.added).toEqual(["model-e"]);
    expect(diffResult.removed).toEqual(["model-a"]);
  });

  it("compareBankFile 能正确区分未变更、已变更与新增状态", () => {
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
    expect(addRes.status).toBe("added");
    expect(addRes.summary).toContain("本地缺失");

    // 2. 内容完全一致 (未变)
    const unchangedRes = compareBankFile(sampleBankA, sampleBankA + "\r\n", true);
    expect(unchangedRes.status).toBe("unchanged");
    expect(unchangedRes.summary).toContain("完全一致");

    // 3. 模型清单更新
    const modelDiffRes = compareBankFile(sampleBankA, sampleBankB, true);
    expect(modelDiffRes.status).toBe("modified");
    expect(modelDiffRes.summary).toContain("模型清单变动");
    expect(modelDiffRes.details.some((d: string) => d.includes("新增模型 (1): m2"))).toBe(true);

    // 4. 模型清单相同但参数变动
    const paramDiffRes = compareBankFile(sampleBankA, sampleBankC, true);
    expect(paramDiffRes.status).toBe("modified");
    expect(paramDiffRes.summary).toContain("特征参数更新");

    // 5. 普通文件（非 unified_bank）变更
    const textDiffRes = compareBankFile("abc", "abcdef", false);
    expect(textDiffRes.status).toBe("modified");
    expect(textDiffRes.summary).toContain("内容更新");
  });

  it("validateBank 能防御非法指纹库结构", () => {
    expect(() => validateBank(null)).toThrow(/不是有效的 JSON 对象/);
    expect(() => validateBank({ models: [] })).toThrow(/未找到有效的 models 列表/);
    expect(() => validateBank({ models: [{ id: "m1" }] })).toThrow(/缺少 calibration/);
    expect(() => validateBank({ models: [{ id: "m1" }], calibration: {} })).toThrow(/缺少 robust/);

    expect(() =>
      validateBank({
        models: [{ id: "m1" }],
        calibration: { k: 1 },
        robust: { r: 1 },
      })
    ).not.toThrow();
  });

  it("checkFallbackDiff 能正确识别默认模型数量差异", () => {
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
      expect(noDiff).toHaveLength(0);

      // 目标变为 20，检测到差异
      const hasDiff = checkFallbackDiff(20, [tempFile]);
      expect(hasDiff).toHaveLength(1);
      expect(hasDiff[0].current).toBe(18);
      expect(hasDiff[0].target).toBe(20);
    } finally {
      // 移入 .temp/trash 或删除测试文件
      const trashDir = path.resolve(__dirname, "../.temp/trash");
      if (!fs.existsSync(trashDir)) {
        fs.mkdirSync(trashDir, { recursive: true });
      }
      fs.renameSync(tempFile, path.resolve(trashDir, `test-store-fallback-${Date.now()}.ts`));
    }
  });
});
