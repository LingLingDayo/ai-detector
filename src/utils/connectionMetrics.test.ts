import { describe, expect, it } from "vitest";
import type { ConnectionChatMessage } from "../types";
import {
  aggregateConnectionMessages,
  estimateTokenCount,
  formatCacheRate,
  formatDurationMs,
  formatSpeed,
  formatTokenCount,
} from "./connectionMetrics";

function assistantMessage(
  overrides: Partial<ConnectionChatMessage>
): ConnectionChatMessage {
  return {
    id: Math.random().toString(36),
    role: "assistant",
    content: "",
    images: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("连接测试统计聚合", () => {
  it("分别统计请求模型与实际响应模型次数", () => {
    const stats = aggregateConnectionMessages([
      assistantMessage({
        requestedModel: "gemini-4-argon",
        responseModel: "gemini-4-argon",
        content: "你好",
        durationMs: 1200,
        firstTokenMs: 300,
      }),
      assistantMessage({
        requestedModel: "gemini-4-argon",
        responseModel: "claude-sonnet-4-5",
        content: "你好",
        durationMs: 1000,
        firstTokenMs: 200,
      }),
      assistantMessage({
        requestedModel: "gpt-4o",
        responseModel: "gpt-4o-2024-08-06",
        content: "hello",
        durationMs: 500,
      }),
    ]);

    expect(stats.requestCount).toBe(3);
    expect(stats.requestModelStats).toEqual([
      { model: "gemini-4-argon", count: 2 },
      { model: "gpt-4o", count: 1 },
    ]);
    expect(stats.responseModelStats).toEqual([
      { model: "claude-sonnet-4-5", count: 1 },
      { model: "gemini-4-argon", count: 1 },
      { model: "gpt-4o-2024-08-06", count: 1 },
    ]);
    expect(stats.mismatchCount).toBe(1);
  });

  it("汇总 usage、输出速度、首字延迟与缓存率", () => {
    const stats = aggregateConnectionMessages([
      assistantMessage({
        requestedModel: "gemini-4-argon",
        responseModel: "gemini-4-argon",
        content: "hello",
        durationMs: 2000,
        firstTokenMs: 400,
        usage: {
          inputTokens: 1000,
          outputTokens: 100,
          cachedTokens: 750,
        },
      }),
      assistantMessage({
        requestedModel: "gemini-4-argon",
        responseModel: "gemini-4-argon",
        content: "world",
        durationMs: 1000,
        firstTokenMs: 200,
        usage: {
          inputTokens: 500,
          outputTokens: 50,
          cachedTokens: 250,
        },
      }),
    ]);

    expect(stats.inputTokens).toBe(1500);
    expect(stats.outputTokens).toBe(150);
    expect(stats.cachedTokens).toBe(1000);
    expect(stats.totalDurationMs).toBe(3000);
    expect(stats.outputSpeed).toBeCloseTo(150 / 2.4, 4);
    expect(stats.avgFirstTokenMs).toBe(300);
    expect(stats.cacheRate).toBeCloseTo(2 / 3, 4);
    expect(stats.usageEstimated).toBe(false);
  });

  it("缺少 usage 时估算输出 token，并保留进行中的请求", () => {
    const stats = aggregateConnectionMessages([
      assistantMessage({
        requestedModel: "unknown-model",
        content: "你好世界 hello",
        streaming: true,
      }),
    ]);

    expect(stats.requestCount).toBe(1);
    expect(stats.successCount).toBe(0);
    expect(stats.outputTokens).toBe(estimateTokenCount("你好世界 hello"));
    expect(stats.usageEstimated).toBe(true);
    expect(stats.cacheRate).toBeNull();
    expect(stats.outputSpeed).toBeNull();
  });
});

describe("连接测试统计格式化", () => {
  it("token、速度、缓存率与耗时格式化", () => {
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1500)).toBe("1.5k");
    expect(formatTokenCount(1_250_000)).toBe("1.25M");
    expect(formatSpeed(42.34)).toBe("42.3 tok/s");
    expect(formatSpeed(null)).toBe("—");
    expect(formatCacheRate(0.785)).toBe("78.5%");
    expect(formatCacheRate(0.8)).toBe("80%");
    expect(formatDurationMs(350)).toBe("350ms");
    expect(formatDurationMs(2300)).toBe("2.3s");
    expect(formatDurationMs(65_000)).toBe("1m 5s");
  });
});
