import { describe, expect, it } from "vitest";
import {
  getModelLeafName,
  getModelRoutingStatus,
  modelsMatch,
  normalizeModelName,
} from "./modelRouting";

describe("模型路由名称一致性判断", () => {
  it("归一化大小写、路径前缀与分隔符", () => {
    expect(normalizeModelName(" Models/OpenAI.GPT-4O ")).toBe("openai-gpt-4o");
    expect(getModelLeafName("openrouter/google/gemini-4-argon")).toBe("gemini-4-argon");
  });

  it("完全一致或仅路径前缀不同时视为一致", () => {
    expect(modelsMatch("gpt-4o", "gpt-4o")).toBe(true);
    expect(modelsMatch("openai/gpt-4o", "gpt-4o")).toBe(true);
    expect(modelsMatch("claude-sonnet-4.5", "claude-sonnet-4-5")).toBe(true);
  });

  it("日期快照与常见路由变体后缀视为同一模型", () => {
    expect(modelsMatch("gpt-4o", "gpt-4o-2024-08-06")).toBe(true);
    expect(modelsMatch("claude-sonnet-4-5", "claude-sonnet-4-5-20250929")).toBe(true);
    expect(modelsMatch("gemini-4-argon", "gemini-4-argon-latest")).toBe(true);
    expect(modelsMatch("model", "model:free")).toBe(true);
  });

  it("不同型号即使共享前缀也不视为一致", () => {
    expect(modelsMatch("gpt-4o", "gpt-4o-mini")).toBe(false);
    expect(modelsMatch("gemini-4-argon", "gemini-4-pro")).toBe(false);
    expect(modelsMatch("deepseek-chat", "deepseek-reasoner")).toBe(false);
  });

  it("缺少实际模型时返回 unknown", () => {
    expect(getModelRoutingStatus("gpt-4o", "")).toBe("unknown");
    expect(getModelRoutingStatus("gpt-4o", "gpt-4o")).toBe("match");
    expect(getModelRoutingStatus("gpt-4o", "claude-sonnet-4-5")).toBe("mismatch");
  });
});
