import test from "node:test";
import assert from "node:assert/strict";
import {
  validateUnifiedBank,
  normalizeBankText,
  areBanksDifferent,
  loadActiveUnifiedBank,
  getPersistedUpdateStatus,
  setPersistedUpdateStatus,
} from "../../src/services/fingerprintSync.ts";

test("validateUnifiedBank: 正确校验指纹库结构合法性", () => {
  assert.equal(validateUnifiedBank(null), false);
  assert.equal(validateUnifiedBank(undefined), false);
  assert.equal(validateUnifiedBank("string"), false);
  assert.equal(validateUnifiedBank({}), false);
  assert.equal(validateUnifiedBank({ models: [] }), false);
  assert.equal(validateUnifiedBank({ models: [{ id: "m1" }] }), false);
  assert.equal(validateUnifiedBank({ models: [{ id: "m1" }], calibration: {} }), false);

  assert.equal(
    validateUnifiedBank({
      models: [{ id: "m1" }],
      calibration: { test: 1 },
      robust: { r: 1 },
    }),
    true
  );
});

test("normalizeBankText: 归一化 CRLF 与首尾空白", () => {
  const text = "  line1\r\nline2\r\n  ";
  assert.equal(normalizeBankText(text), "line1\nline2");
  assert.equal(normalizeBankText(""), "");
  assert.equal(normalizeBankText(null), "");
});

test("areBanksDifferent: 精准识别题库差异", () => {
  const bankA = {
    models: [{ id: "model-1" }, { id: "model-2" }],
    calibration: { slope: 1.2 },
    robust: { feature: "abc" },
  };

  const bankSame = {
    models: [{ id: "model-1" }, { id: "model-2" }],
    calibration: { slope: 1.2 },
    robust: { feature: "abc" },
  };

  const bankDifferentCount = {
    models: [{ id: "model-1" }],
    calibration: { slope: 1.2 },
    robust: { feature: "abc" },
  };

  const bankDifferentIds = {
    models: [{ id: "model-1" }, { id: "model-3" }],
    calibration: { slope: 1.2 },
    robust: { feature: "abc" },
  };

  const bankDifferentParam = {
    models: [{ id: "model-1" }, { id: "model-2" }],
    calibration: { slope: 2.0 },
    robust: { feature: "abc" },
  };

  // 相同指纹库不报差异
  assert.equal(areBanksDifferent(bankA, bankSame), false);

  // 数量不同
  assert.equal(areBanksDifferent(bankA, bankDifferentCount), true);

  // ID 不同
  assert.equal(areBanksDifferent(bankA, bankDifferentIds), true);

  // 参数更新
  assert.equal(areBanksDifferent(bankA, bankDifferentParam), true);
});

test("持久化更新标记读写与题库降级加载", () => {
  const mockStorage = {};
  const originalLocalStorage = globalThis.localStorage;

  globalThis.localStorage = {
    getItem: (k) => mockStorage[k] ?? null,
    setItem: (k, v) => {
      mockStorage[k] = String(v);
    },
    removeItem: (k) => {
      delete mockStorage[k];
    },
    clear: () => {
      for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    },
  };

  try {
    // 初始状态应为 false
    assert.equal(getPersistedUpdateStatus(), false);

    // 写入 true 并持久化
    setPersistedUpdateStatus(true);
    assert.equal(getPersistedUpdateStatus(), true);

    // 写入 false
    setPersistedUpdateStatus(false);
    assert.equal(getPersistedUpdateStatus(), false);

    // 无缓存时应安全加载内置打包题库
    const fallbackBank = loadActiveUnifiedBank();
    assert.ok(Array.isArray(fallbackBank.models));
    assert.ok(fallbackBank.models.length >= 18);

    // 写入自定义缓存题库后应优先加载缓存
    const customBank = {
      models: [{ id: "custom-test-model" }],
      calibration: { ok: true },
      robust: { val: 1 },
    };
    globalThis.localStorage.setItem(
      "modeltrace_custom_unified_bank",
      JSON.stringify(customBank)
    );

    const activeBank = loadActiveUnifiedBank();
    assert.equal(activeBank.models.length, 1);
    assert.equal(activeBank.models[0].id, "custom-test-model");
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});
