import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import {
  cancelProbeRequest,
  fetchRemoteModels,
  getActiveUserAgent,
  initTauri,
  sendProbe,
} from "./api";
import {
  CLAUDE_CODE_USER_AGENT,
  CODEX_USER_AGENT,
  OPENCODE_USER_AGENT,
} from "../data/userAgentPresets";
import { useSettingsStore } from "../stores/settings";

describe("api 服务模块取消与中断测试套件", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockInvoke.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("当 signal 已处于 aborted 状态时，sendProbe 立即抛出 AbortError", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      sendProbe({
        baseUrl: "https://api.test.com",
        apiKey: "sk-test",
        model: "test-model",
        prompt: "hello",
        apiFormat: "openai",
        signal: controller.signal,
      })
    ).rejects.toThrowError("The user aborted a request.");
  });

  it("当 Tauri 环境下运行中途触发 abort 时，主动调用 cancel_probe_request 并抛出 AbortError", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "send_probe_request") {
        return new Promise((resolve) => setTimeout(resolve, 5000));
      }
      return Promise.resolve();
    });

    vi.stubGlobal("window", {
      isTauri: true,
      __TAURI_INTERNALS__: {},
    });

    await initTauri();

    const controller = new AbortController();
    const probePromise = sendProbe({
      baseUrl: "https://api.test.com",
      apiKey: "sk-test",
      model: "test-model",
      prompt: "hello",
      apiFormat: "openai",
      signal: controller.signal,
    });

    setTimeout(() => {
      controller.abort();
    }, 50);

    await expect(probePromise).rejects.toThrowError("The user aborted a request.");

    expect(mockInvoke).toHaveBeenCalledWith(
      "cancel_probe_request",
      expect.objectContaining({
        requestId: expect.stringMatching(/^probe_/),
      })
    );
  });

  it("cancelProbeRequest 会向 Tauri 下发 cancel_probe_request 命令", async () => {
    mockInvoke.mockResolvedValue(undefined);

    vi.stubGlobal("window", {
      isTauri: true,
      __TAURI_INTERNALS__: {},
    });

    await initTauri();

    await cancelProbeRequest("probe_test_req_123");
    expect(mockInvoke).toHaveBeenCalledWith("cancel_probe_request", {
      requestId: "probe_test_req_123",
    });
  });

  it("Tauri 环境下 sendProbe 与 fetchRemoteModels 会传递设置中配置的 user_agent", async () => {
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

    setActivePinia(createPinia());
    const settingsStore = useSettingsStore();
    settingsStore.setValue("userAgentPreset", "claude");

    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "send_probe_request") {
        return { text: "ok", raw_status: 200, duration_ms: 12 };
      }
      if (command === "fetch_models_list") {
        return ["claude-sonnet-4-5"];
      }
      return undefined;
    });

    vi.stubGlobal("window", {
      isTauri: true,
      __TAURI_INTERNALS__: {},
    });

    await initTauri();

    await sendProbe({
      baseUrl: "https://api.test.com",
      apiKey: "sk-test",
      model: "claude-sonnet-4-5",
      prompt: "hello",
      apiFormat: "anthropic",
      stream: false,
    });

    expect(mockInvoke).toHaveBeenCalledWith("send_probe_request", {
      req: expect.objectContaining({
        user_agent: CLAUDE_CODE_USER_AGENT,
      }),
    });

    settingsStore.setValue("userAgentPreset", "custom");
    settingsStore.setValue("customUserAgent", "custom-probe-client/9.9");

    await fetchRemoteModels("https://api.test.com", "sk-test", "openai");
    expect(mockInvoke).toHaveBeenCalledWith("fetch_models_list", {
      baseUrl: "https://api.test.com",
      apiKey: "sk-test",
      apiFormat: "openai",
      userAgent: "custom-probe-client/9.9",
    });

    expect(getActiveUserAgent(OPENCODE_USER_AGENT)).toBe(OPENCODE_USER_AGENT);
  });

  it("Web 回退模式下 sendProbe 请求头携带当前生效的 User-Agent", async () => {
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
    setActivePinia(createPinia());

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "hi" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {});
    await initTauri();

    await sendProbe({
      baseUrl: "https://api.test.com",
      apiKey: "sk-test",
      model: "gpt-4o",
      prompt: "hello",
      apiFormat: "openai",
      stream: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": CODEX_USER_AGENT,
        }),
      })
    );
  });

  it("Web 回退模式下首包直接含正文时标记 hasText 且不产生伪思考耗时", async () => {
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
    setActivePinia(createPinia());

    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('data: {"choices":[{"delta":{"content":"<svg>"}}]}\n\n'),
      encoder.encode('data: {"choices":[{"delta":{"content":"</svg>"}}]}\n\ndata: [DONE]\n\n'),
    ];
    let index = 0;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (index < chunks.length) {
              return { value: chunks[index++], done: false };
            }
            return { value: undefined, done: true };
          },
        }),
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {});
    await initTauri();

    const startMetaList: Array<{ hasText?: boolean; hasReasoning?: boolean } | undefined> = [];
    const progressList: Array<{ text: string; thinkingMs?: number | null }> = [];

    const res = await sendProbe({
      baseUrl: "https://api.test.com",
      apiKey: "sk-test",
      model: "gpt-4o",
      prompt: "hello",
      apiFormat: "openai",
      stream: true,
      onStreamStart: (meta) => {
        startMetaList.push(meta);
      },
      onStreamProgress: (text, meta) => {
        progressList.push({ text, thinkingMs: meta?.thinkingMs });
      },
    });

    expect(startMetaList).toEqual([{ hasText: true, hasReasoning: false }]);
    expect(progressList[0]).toEqual({ text: "<svg>", thinkingMs: null });
    expect(res.text).toBe("<svg></svg>");
    expect(res.thinking_ms).toBeNull();
  });
});
