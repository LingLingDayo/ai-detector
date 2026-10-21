import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  PELICAN_PROMPT_STORAGE_KEY,
  PELICAN_CUSTOM_PROMPT_STORAGE_KEY,
} from "../constants";
import { PELICAN_PRESETS } from "../data/pelicanPresets";
import { DEFAULT_PELICAN_PROMPT, usePelicanTestStore } from "./pelicanTest";
import * as api from "../services/api";

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

afterEach(() => {
  vi.restoreAllMocks();
});

const CUSTOM_PROMPT = "Generate an SVG of a pelican riding a skateboard.";

function newStore() {
  setActivePinia(createPinia());
  return usePelicanTestStore();
}

describe("鹈鹕测试自定义提示词预设测试套件", () => {
  it("默认提示词属于预设时，自定义项初始为空", () => {
    storage.clear();
    const store = newStore();
    expect(store.pelicanCustomPrompt).toBe("");
  });

  it("保存与任何预设都不一致的提示词时写入自定义项", () => {
    storage.clear();
    const store = newStore();
    store.setPelicanPrompt(CUSTOM_PROMPT);

    expect(store.pelicanCustomPrompt).toBe(CUSTOM_PROMPT);
    expect(storage.get(PELICAN_CUSTOM_PROMPT_STORAGE_KEY)).toBe(CUSTOM_PROMPT);
  });

  it("保存预设提示词不会覆盖已有的自定义内容", () => {
    storage.clear();
    const store = newStore();
    store.setPelicanPrompt(CUSTOM_PROMPT);
    store.setPelicanPrompt(PELICAN_PRESETS[1].prompt);

    expect(store.pelicanPrompt).toBe(PELICAN_PRESETS[1].prompt);
    expect(store.pelicanCustomPrompt).toBe(CUSTOM_PROMPT);
  });

  it("自定义内容在重新加载后仍可复用", () => {
    storage.clear();
    const first = newStore();
    first.setPelicanPrompt(CUSTOM_PROMPT);
    first.setPelicanPrompt(DEFAULT_PELICAN_PROMPT);

    const reloaded = newStore();
    expect(reloaded.pelicanCustomPrompt).toBe(CUSTOM_PROMPT);
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
    expect(reloaded.pelicanPrompt).toBe(CUSTOM_PROMPT);
  });

  it("旧版仅持久化了非预设提示词时初始化为其自定义内容", () => {
    storage.clear();
    storage.set(PELICAN_PROMPT_STORAGE_KEY, CUSTOM_PROMPT);
    const store = newStore();
    expect(store.pelicanCustomPrompt).toBe(CUSTOM_PROMPT);
  });
});

describe("鹈鹕测试流式输出进度测试套件", () => {
  it("流式回调会更新实时字符数与输出尾段", async () => {
    storage.clear();
    const store = newStore();
    const firstPreview = "<svg><rect ";
    const lastPreview = '<svg><rect width="10" />';

    vi.spyOn(api, "sendProbe").mockImplementation(async (options) => {
      options.onStreamStart?.();
      options.onStreamProgress?.(firstPreview);
      options.onStreamProgress?.(lastPreview);
      return {
        text: '<svg><rect width="10" /></svg>',
        raw_status: 200,
        duration_ms: 10,
      };
    });

    await store.startPelicanTest({
      baseUrl: "https://api.test.com",
      apiKey: "sk-test",
      apiFormat: "openai",
      modelName: "test-model",
      reasoningEffort: "high",
      stream: true,
    });

    expect(store.streamedCharCount).toBe(lastPreview.length);
    expect(store.streamedTextTail).toBe(lastPreview);
    expect(store.isPelicanGenerating).toBe(false);
  });
});
