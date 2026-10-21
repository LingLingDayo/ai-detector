import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import * as chat from "../services/chat";
import {
  CONNECTION_HISTORY_STORAGE_KEY,
  CONNECTION_MODE_STORAGE_KEY,
} from "../constants";
import type {
  ClientConfig,
  ConnectionImageAttachment,
  SendChatOptions,
} from "../types";
import { useConnectionTestStore } from "./connectionTest";

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

const config: ClientConfig = {
  baseUrl: "https://api.test.com",
  apiKey: "sk-test-key-123456",
  apiFormat: "chat_completions",
  modelName: "requested-model",
  reasoningEffort: "high",
  stream: true,
};

function newStore() {
  setActivePinia(createPinia());
  return useConnectionTestStore();
}

function mockSuccessfulReply() {
  return vi.spyOn(chat, "sendChat").mockImplementation(async (options) => {
    options.onStreamStart?.();
    options.onStreamProgress?.("你");
    options.onStreamProgress?.("你好");
    options.onResponseModel?.("upstream-model");
    return {
      text: "你好世界",
      responseModel: "upstream-model",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cachedTokens: 75,
      },
      rawStatus: 200,
      durationMs: 1000,
      firstTokenMs: 200,
    };
  });
}

describe("连接测试会话状态", () => {
  it("发送消息后更新消息、统计与同一个历史项", async () => {
    storage.clear();
    const store = newStore();
    mockSuccessfulReply();

    await store.sendConnectionMessage(
      { text: "第一轮消息", images: [] },
      config,
      "测试配置"
    );

    expect(store.messages).toHaveLength(2);
    expect(store.messages[0]).toMatchObject({
      role: "user",
      content: "第一轮消息",
    });
    expect(store.messages[1]).toMatchObject({
      role: "assistant",
      content: "你好世界",
      requestedModel: "requested-model",
      responseModel: "upstream-model",
      streaming: false,
    });
    expect(store.isConnectionRunning).toBe(false);
    expect(store.sessionStats).toMatchObject({
      requestCount: 1,
      successCount: 1,
      errorCount: 0,
      stoppedCount: 0,
      successRate: 1,
      mismatchCount: 1,
      inputTokens: 100,
      outputTokens: 20,
      cachedTokens: 75,
      usageEstimated: false,
    });
    expect(store.sessionStats.outputSpeed).toBeCloseTo(25, 4);
    expect(store.sessionStats.cacheRate).toBeCloseTo(0.75, 4);

    const historyId = store.activeSessionHistoryId;
    expect(historyId).toBeTruthy();
    expect(store.connectionHistoryList).toHaveLength(1);
    expect(store.connectionHistoryList[0]).toMatchObject({
      id: historyId,
      title: "第一轮消息",
      configName: "测试配置",
      userMessageCount: 1,
      requestCount: 1,
      successCount: 1,
      stoppedCount: 0,
      successRate: 1,
      mismatchCount: 1,
      outputSpeed: 25,
      cacheRate: 0.75,
      lastRequestedModel: "requested-model",
      lastResponseModel: "upstream-model",
    });
    expect(storage.get(CONNECTION_HISTORY_STORAGE_KEY)).toContain("第一轮消息");
  });

  it("连续对话携带完整上下文，并持续更新同一历史项", async () => {
    storage.clear();
    const store = newStore();
    const contexts: SendChatOptions["messages"][] = [];
    const spy = mockSuccessfulReply();
    spy.mockImplementation(async (options) => {
      contexts.push(options.messages);
      options.onStreamProgress?.("回复");
      return {
        text: "回复",
        responseModel: "upstream-model",
        usage: { inputTokens: 50, outputTokens: 10 },
        rawStatus: 200,
        durationMs: 500,
        firstTokenMs: 100,
      };
    });

    await store.sendConnectionMessage({ text: "第一轮", images: [] }, config);
    const historyId = store.activeSessionHistoryId;
    await store.sendConnectionMessage({ text: "第二轮", images: [] }, config);

    expect(contexts[0]).toHaveLength(1);
    expect(contexts[1]).toHaveLength(3);
    expect(contexts[1][0]).toMatchObject({ role: "user", content: "第一轮" });
    expect(contexts[1][1]).toMatchObject({ role: "assistant", content: "回复" });
    expect(contexts[1][2]).toMatchObject({ role: "user", content: "第二轮" });

    expect(store.connectionHistoryList).toHaveLength(1);
    expect(store.connectionHistoryList[0].id).toBe(historyId);
    expect(store.connectionHistoryList[0].userMessageCount).toBe(2);
    expect(store.connectionHistoryList[0].requestCount).toBe(2);
    expect(store.connectionHistoryList[0].responseModelStats).toEqual([
      { model: "upstream-model", count: 2 },
    ]);
    expect(store.connectionHistoryList[0].outputTokens).toBe(20);
  });

  it("图片附件会映射为请求图片并保留在用户消息中", async () => {
    storage.clear();
    const store = newStore();
    let captured: SendChatOptions["messages"] = [];
    const spy = mockSuccessfulReply();
    spy.mockImplementation(async (options) => {
      captured = options.messages;
      return {
        text: "看到了",
        responseModel: "upstream-model",
        usage: {},
        rawStatus: 200,
        durationMs: 300,
      };
    });

    const image: ConnectionImageAttachment = {
      id: "img_1",
      name: "cat.png",
      mimeType: "image/png",
      data: "aGVsbG8=",
      size: 5,
      previewUrl: "data:image/png;base64,aGVsbG8=",
    };

    await store.sendConnectionMessage(
      { text: "看看这张图", images: [image] },
      config
    );

    expect(store.messages[0].images).toHaveLength(1);
    expect(captured[0].images).toEqual([
      { mimeType: "image/png", data: "aGVsbG8=" },
    ]);
  });

  it("清空上下文后开启新的历史项", async () => {
    storage.clear();
    const store = newStore();
    mockSuccessfulReply();

    await store.sendConnectionMessage({ text: "旧会话", images: [] }, config);
    const oldHistoryId = store.activeSessionHistoryId;
    store.clearConnectionContext();

    expect(store.messages).toHaveLength(0);
    expect(store.activeSessionHistoryId).toBeNull();
    expect(store.connectionHistoryList).toHaveLength(1);
    expect(store.connectionHistoryList[0].id).toBe(oldHistoryId);

    await store.sendConnectionMessage({ text: "新会话", images: [] }, config);

    expect(store.connectionHistoryList).toHaveLength(2);
    expect(store.activeSessionHistoryId).not.toBe(oldHistoryId);
    expect(store.connectionHistoryList[0].title).toBe("新会话");
  });

  it("请求失败时记录错误并更新历史汇总", async () => {
    storage.clear();
    const store = newStore();
    vi.spyOn(chat, "sendChat").mockRejectedValue(new Error("上游接口返回错误 (HTTP 500)"));

    await store.sendConnectionMessage({ text: "会失败", images: [] }, config);

    expect(store.messages[1].error).toBe("上游接口返回错误 (HTTP 500)");
    expect(store.isConnectionRunning).toBe(false);
    expect(store.sessionStats.errorCount).toBe(1);
    expect(store.sessionStats.requestCount).toBe(1);
    expect(store.sessionStats.successRate).toBe(0);
    expect(store.connectionHistoryList[0]).toMatchObject({
      title: "会失败",
      errorCount: 1,
      successCount: 0,
      stoppedCount: 0,
      successRate: 0,
      lastError: "上游接口返回错误 (HTTP 500)",
    });
  });

  it("连接测试模式会持久化并在新建 store 后恢复", () => {
    storage.clear();
    let store = newStore();
    expect(store.connectionMode).toBe("chat");

    store.setConnectionMode("quick");
    expect(store.connectionMode).toBe("quick");
    expect(storage.get(CONNECTION_MODE_STORAGE_KEY)).toBe("quick");

    setActivePinia(createPinia());
    store = useConnectionTestStore();
    expect(store.connectionMode).toBe("quick");

    store.setConnectionMode("chat");
    expect(storage.get(CONNECTION_MODE_STORAGE_KEY)).toBe("chat");

    storage.set(CONNECTION_MODE_STORAGE_KEY, "unknown");
    setActivePinia(createPinia());
    store = useConnectionTestStore();
    expect(store.connectionMode).toBe("chat");
  });

  it("停止生成时保留已接收内容且不标记为错误", async () => {
    storage.clear();
    const store = newStore();
    vi.spyOn(chat, "sendChat").mockImplementation((options) => {
      options.onStreamStart?.();
      options.onStreamProgress?.("部分内容");
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const pending = store.sendConnectionMessage(
      { text: "开始生成长回复", images: [] },
      config
    );
    await Promise.resolve();
    store.stopConnectionReply();
    await pending;

    expect(store.messages[1]).toMatchObject({
      content: "部分内容",
      stopped: true,
      streaming: false,
    });
    expect(store.isConnectionRunning).toBe(false);
    expect(store.sessionStats.errorCount).toBe(0);
    expect(store.sessionStats.successCount).toBe(0);
    expect(store.sessionStats.stoppedCount).toBe(1);
    expect(store.sessionStats.successRate).toBe(0);
    expect(store.connectionHistoryList[0]).toMatchObject({
      requestCount: 1,
      stoppedCount: 1,
      successRate: 0,
    });
  });
});
