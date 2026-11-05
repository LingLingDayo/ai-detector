import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// Mock timer.sleep 避免单测执行时真实休眠 5000ms
vi.mock("../utils/timer", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { useSettingsStore } from "./settings";
import { generalPage } from "../settings/general";
import { executeSingleProbe } from "../services/probeRunner";
import { executeSingleCandy } from "../services/candyRunner";
import * as api from "../services/api";
import type { Challenge } from "../utils/challenge";
import type { CandyChallenge } from "../types";

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

describe("失败自动重试全链路实机与集成验证", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("【实测1】设置项结构与选项内容精确校验", () => {
    const field = generalPage.sections
      .flatMap((s) => s.fields)
      .find((f) => f.key === "requestRetryCount");

    expect(field).toBeDefined();
    expect(field?.defaultValue).toBe("3");
    if (field?.type === "segmented") {
      expect(field.options).toEqual([
        { value: "0", label: "0 次" },
        { value: "1", label: "1 次" },
        { value: "3", label: "3 次" },
        { value: "5", label: "5 次" },
      ]);
    }
  });

  it("【实测2】验证 0/1/3/5 各档位在模型测试(probe)与糖果测试(candy)失败时真实重试次数", async () => {
    const store = useSettingsStore();

    const testCases = [
      { setting: "0", expectedAttempts: 1, expectedRetries: 0 },
      { setting: "1", expectedAttempts: 2, expectedRetries: 1 },
      { setting: "3", expectedAttempts: 4, expectedRetries: 3 },
      { setting: "5", expectedAttempts: 6, expectedRetries: 5 },
    ];

    for (const tc of testCases) {
      store.setValue("requestRetryCount", tc.setting);
      expect(store.requestRetryCount).toBe(Number(tc.setting));

      // 1. 验证 probeRunner
      let probeCalls = 0;
      vi.spyOn(api, "sendProbe").mockImplementation(async () => {
        probeCalls++;
        throw new Error("HTTP 500: Internal Server Error");
      });

      const fakeChallenge: Challenge = {
        id: "test",
        prompt: "test probe",
        expected_count: 100,
      };

      await executeSingleProbe({
        index: 0,
        baseUrl: "https://mock.api",
        apiKey: "test-key",
        model: "mock-model",
        stream: false,
        timeoutSeconds: 5,
        retryCount: store.requestRetryCount,
        challenge: fakeChallenge,
      });

      expect(probeCalls).toBe(tc.expectedAttempts);

      // 2. 验证 candyRunner
      let candyCalls = 0;
      vi.spyOn(api, "sendProbe").mockImplementation(async () => {
        candyCalls++;
        throw new Error("HTTP 502: Bad Gateway");
      });

      const fakeCandy: CandyChallenge = {
        id: "c1",
        prompt: "test candy prompt",
        question: "test candy question",
        items: [],
        expectedCounts: {},
      } as unknown as CandyChallenge;

      await executeSingleCandy({
        index: 0,
        baseUrl: "https://mock.api",
        apiKey: "test-key",
        model: "mock-model",
        stream: false,
        timeoutSeconds: 5,
        retryCount: store.requestRetryCount,
        challenge: fakeCandy,
      });

      expect(candyCalls).toBe(tc.expectedAttempts);
    }
  });

  it("【实测3】验证超时异常立即熔断，哪怕设置为 5 次也坚决不重试", async () => {
    const store = useSettingsStore();
    store.setValue("requestRetryCount", "5");

    let probeCalls = 0;
    vi.spyOn(api, "sendProbe").mockImplementation(async () => {
      probeCalls++;
      throw new Error("流式请求首次响应超时（90 秒内未收到上游响应）");
    });

    const fakeChallenge: Challenge = {
      id: "test-timeout",
      prompt: "test",
      expected_count: 100,
    };

    await executeSingleProbe({
      index: 0,
      baseUrl: "https://mock.api",
      apiKey: "test-key",
      model: "mock-model",
      stream: true,
      timeoutSeconds: 90,
      retryCount: store.requestRetryCount,
      challenge: fakeChallenge,
    });

    expect(probeCalls).toBe(1);
  });

  it("【实测4】验证历史旧数据 '2' 自动纠正为默认值 '3'", () => {
    localStorage.setItem("modeltrace_settings", JSON.stringify({ requestRetryCount: "2" }));
    const store = useSettingsStore();
    expect(store.requestRetryCount).toBe(3);
    expect(store.getValue("requestRetryCount")).toBe("3");
    expect(JSON.parse(localStorage.getItem("modeltrace_settings") ?? "{}").requestRetryCount).toBe("3");
  });
});
