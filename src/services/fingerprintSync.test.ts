import { afterAll, describe, expect, it, vi } from "vitest";
import {
  validateUnifiedBank,
  normalizeBankText,
  areBanksDifferent,
  loadActiveUnifiedBank,
  getPersistedUpdateStatus,
  setPersistedUpdateStatus,
  CUSTOM_UNIFIED_BANK_KEY,
} from "./fingerprintSync";
import type { UnifiedBank } from "../utils/fingerprint";

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
    ).toBe(true);
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
    const customBank = {
      models: [{ id: "custom-test-model" }],
      calibration: { ok: true },
      robust: { val: 1 },
    };
    localStorage.setItem(CUSTOM_UNIFIED_BANK_KEY, JSON.stringify(customBank));

    const activeBank = loadActiveUnifiedBank();
    expect(activeBank.models).toHaveLength(1);
    expect(activeBank.models[0].id).toBe("custom-test-model");
  });
});
