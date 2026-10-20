import test from "node:test";
import assert from "node:assert/strict";
import { setActivePinia, createPinia } from "pinia";

// Mock localStorage for node environment
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

import {
  PELICAN_PROMPT_STORAGE_KEY,
  PELICAN_CUSTOM_PROMPT_STORAGE_KEY,
} from "../../src/constants.ts";
import { PELICAN_PRESETS } from "../../src/data/pelicanPresets.ts";
import {
  usePelicanTestStore,
  DEFAULT_PELICAN_PROMPT,
} from "../../src/stores/pelicanTest.ts";

const CUSTOM_PROMPT = "Generate an SVG of a pelican riding a skateboard.";

function newStore() {
  setActivePinia(createPinia());
  return usePelicanTestStore();
}

test("鹈鹕测试自定义提示词预设测试套件", async (t) => {
  await t.test("默认提示词属于预设时，自定义项初始为空", () => {
    storage.clear();
    const store = newStore();
    assert.equal(store.pelicanCustomPrompt, "");
  });

  await t.test("保存与任何预设都不一致的提示词时写入自定义项", () => {
    storage.clear();
    const store = newStore();
    store.setPelicanPrompt(CUSTOM_PROMPT);

    assert.equal(store.pelicanCustomPrompt, CUSTOM_PROMPT);
    assert.equal(
      storage.get(PELICAN_CUSTOM_PROMPT_STORAGE_KEY),
      CUSTOM_PROMPT
    );
  });

  await t.test("保存预设提示词不会覆盖已有的自定义内容", () => {
    storage.clear();
    const store = newStore();
    store.setPelicanPrompt(CUSTOM_PROMPT);
    store.setPelicanPrompt(PELICAN_PRESETS[1].prompt);

    assert.equal(store.pelicanPrompt, PELICAN_PRESETS[1].prompt);
    assert.equal(store.pelicanCustomPrompt, CUSTOM_PROMPT);
  });

  await t.test("自定义内容在重新加载后仍可复用", () => {
    storage.clear();
    const first = newStore();
    first.setPelicanPrompt(CUSTOM_PROMPT);
    first.setPelicanPrompt(DEFAULT_PELICAN_PROMPT);

    const reloaded = newStore();
    assert.equal(reloaded.pelicanCustomPrompt, CUSTOM_PROMPT);
    reloaded.applyHistoryItem({
      id: "hist_1",
      createdAt: Date.now(),
      baseUrl: "https://api.test.com",
      apiKey: "sk-***",
      modelName: "test-model",
      reasoningEffort: "high",
      contentType: "svg",
      content: "<svg></svg>",
      prompt: reloaded.pelicanCustomPrompt,
    });
    assert.equal(reloaded.pelicanPrompt, CUSTOM_PROMPT);
  });

  await t.test("旧版仅持久化了非预设提示词时初始化为其自定义内容", () => {
    storage.clear();
    storage.set(PELICAN_PROMPT_STORAGE_KEY, CUSTOM_PROMPT);
    const store = newStore();
    assert.equal(store.pelicanCustomPrompt, CUSTOM_PROMPT);
  });
});
