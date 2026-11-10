import { afterAll, describe, expect, it, vi } from "vitest";
import {
  validateUnifiedBank,
  normalizeBankText,
  areBanksDifferent,
  fetchRemoteUnifiedBank,
  loadActiveUnifiedBank,
  getPersistedUpdateStatus,
  setPersistedUpdateStatus,
  CUSTOM_UNIFIED_BANK_KEY,
} from "./fingerprintSync";
import type { UnifiedBank } from "../utils/fingerprint";
import rawBank from "../data/unified_bank.json";

function validBank(): UnifiedBank {
  return structuredClone(rawBank) as unknown as UnifiedBank;
}

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

describe("fingerprintSync", () => {
  it("validateUnifiedBank: 正确校验指纹库结构合法性", () => {
    expect(validateUnifiedBank(null)).toBe(false);
    expect(validateUnifiedBank(undefined)).toBe(false);
    expect(validateUnifiedBank("string")).toBe(false);
    expect(validateUnifiedBank({})).toBe(false);
    expect(validateUnifiedBank({ models: [] })).toBe(false);
    expect(validateUnifiedBank({ models: [{ id: "m1" }] })).toBe(false);
    expect(validateUnifiedBank({ models: [{ id: "m1" }], calibration: {} })).toBe(false);

    expect(
      validateUnifiedBank({
        models: [{ id: "m1" }],
        calibration: { test: 1 },
        robust: { r: 1 },
      })
    ).toBe(false);
    expect(validateUnifiedBank(validBank())).toBe(true);
  });

  it.each([
    ["缺少校准项", (b: UnifiedBank) => { delete b.calibration["2"]; }],
    ["非数值校准系数", (b: UnifiedBank) => { b.calibration["1"].beta = "NaN"; }],
    ["越界准确率", (b: UnifiedBank) => { b.calibration["1"].cv_accuracy = 2; }],
    ["重复模型 ID", (b: UnifiedBank) => { b.models[1].id = b.models[0].id; }],
    ["计数维度错误", (b: UnifiedBank) => { b.models[0].counts.pop(); }],
    ["负计数", (b: UnifiedBank) => { b.models[0].counts[0] = -1; }],
    ["缺少 Hellinger 参数", (b: UnifiedBank) => { delete (b.robust as Partial<UnifiedBank["robust"]>).hellinger; }],
    ["零缩放系数", (b: UnifiedBank) => { b.robust.hellinger.feature_scale[0] = 0; }],
    ["无限特征值", (b: UnifiedBank) => { b.robust.hellinger.feature_mean[0] = Infinity; }],
    ["中心数量不符", (b: UnifiedBank) => { b.robust.hellinger.centroids.pop(); }],
    ["干扰向量维度不符", (b: UnifiedBank) => { b.robust.hellinger.nuisance_basis![0].pop(); }],
    ["空环境中心", (b: UnifiedBank) => { b.robust.ordered_blocks!.environment_centroids = []; }],
    ["环境中心维度不符", (b: UnifiedBank) => { b.robust.ordered_blocks!.environment_centroids![0][0].pop(); }],
    ["混合权重越界", (b: UnifiedBank) => { b.robust.ordered_blocks!.weight = 2; }],
  ])("拒绝损坏的指纹库：%s", (_name, corrupt) => {
    const bank = validBank();
    corrupt(bank);
    expect(validateUnifiedBank(bank)).toBe(false);
  });

  it("允许没有分块特征的指纹库和字符串校准系数", () => {
    const bank = validBank();
    delete bank.robust.ordered_blocks;
    bank.calibration["1"].beta = "7.1";
    expect(validateUnifiedBank(bank)).toBe(true);
  });

  it("缓存结构损坏时回退内置库", () => {
    storage.clear();
    localStorage.setItem(CUSTOM_UNIFIED_BANK_KEY, JSON.stringify({
      models: [{ id: "broken" }], calibration: {}, robust: {},
    }));
    expect(loadActiveUnifiedBank()).toEqual(rawBank);
    storage.clear();
  });

  it("normalizeBankText: 归一化 CRLF 与首尾空白", () => {
    const text = "  line1\r\nline2\r\n  ";
    expect(normalizeBankText(text)).toBe("line1\nline2");
    expect(normalizeBankText("")).toBe("");
    expect(normalizeBankText(null as unknown as string)).toBe("");
  });

  it("areBanksDifferent: 精准识别题库差异", () => {
    const bankA = {
      models: [{ id: "model-1" }, { id: "model-2" }],
      calibration: { slope: 1.2 },
      robust: { feature: "abc" },
    } as unknown as UnifiedBank;

    const bankSame = {
      models: [{ id: "model-1" }, { id: "model-2" }],
      calibration: { slope: 1.2 },
      robust: { feature: "abc" },
    } as unknown as UnifiedBank;

    const bankDifferentCount = {
      models: [{ id: "model-1" }],
      calibration: { slope: 1.2 },
      robust: { feature: "abc" },
    } as unknown as UnifiedBank;

    const bankDifferentIds = {
      models: [{ id: "model-1" }, { id: "model-3" }],
      calibration: { slope: 1.2 },
      robust: { feature: "abc" },
    } as unknown as UnifiedBank;

    const bankDifferentParam = {
      models: [{ id: "model-1" }, { id: "model-2" }],
      calibration: { slope: 2.0 },
      robust: { feature: "abc" },
    } as unknown as UnifiedBank;

    // 相同指纹库不报差异
    expect(areBanksDifferent(bankA, bankSame)).toBe(false);

    // 数量不同
    expect(areBanksDifferent(bankA, bankDifferentCount)).toBe(true);

    // ID 不同
    expect(areBanksDifferent(bankA, bankDifferentIds)).toBe(true);

    // 参数更新
    expect(areBanksDifferent(bankA, bankDifferentParam)).toBe(true);
  });

  it("fetchRemoteUnifiedBank: 不使用会触发 CORS 预检的 Cache-Control 头", async () => {
    const bank = validBank();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(bank), { status: 200 })
    );

    try {
      const result = await fetchRemoteUnifiedBank();
      expect(result.parsedBank.models[0].id).toBe(bank.models[0].id);

      const options = fetchMock.mock.calls[0][1] as RequestInit;
      expect(options.headers).toEqual({ Accept: "application/json" });
      expect(options.cache).toBe("no-cache");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("持久化更新标记读写与题库降级加载", () => {
    storage.clear();

    // 初始状态应为 false
    expect(getPersistedUpdateStatus()).toBe(false);

    // 写入 true 并持久化
    setPersistedUpdateStatus(true);
    expect(getPersistedUpdateStatus()).toBe(true);

    // 写入 false
    setPersistedUpdateStatus(false);
    expect(getPersistedUpdateStatus()).toBe(false);

    // 无缓存时应安全加载内置打包题库
    const fallbackBank = loadActiveUnifiedBank();
    expect(Array.isArray(fallbackBank.models)).toBe(true);
    expect(fallbackBank.models.length).toBeGreaterThanOrEqual(18);

    // 写入自定义缓存题库后应优先加载缓存
    const customBank = validBank();
    customBank.models[0].id = "custom-test-model";
    localStorage.setItem(CUSTOM_UNIFIED_BANK_KEY, JSON.stringify(customBank));

    const activeBank = loadActiveUnifiedBank();
    expect(activeBank.models).toHaveLength(customBank.models.length);
    expect(activeBank.models[0].id).toBe("custom-test-model");
  });
});
