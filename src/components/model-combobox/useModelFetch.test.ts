import { describe, expect, it } from "vitest";
import { resolveModelAfterCredentialChange } from "./useModelFetch";

describe("resolveModelAfterCredentialChange", () => {
  it("拉取失败时清空当前模型", () => {
    expect(resolveModelAfterCredentialChange("gpt-4o", ["gpt-4o"], true)).toEqual({
      action: "clear",
    });
  });

  it("拉取结果为空列表时清空当前模型", () => {
    expect(resolveModelAfterCredentialChange("gpt-4o", [], false)).toEqual({
      action: "clear",
    });
  });

  it("旧模型仍存在于新列表时保持不变", () => {
    expect(resolveModelAfterCredentialChange("gpt-4o", ["gpt-4o", "gpt-4o-mini"], false)).toEqual({
      action: "keep",
    });
  });

  it("旧模型不在新列表时切换到首个模型", () => {
    expect(
      resolveModelAfterCredentialChange("gpt-4o", ["claude-sonnet-5", "gpt-4o-mini"], false)
    ).toEqual(
      {
        action: "select",
        model: "claude-sonnet-5",
      }
    );
  });

  it("当前模型为空时切换到首个模型", () => {
    expect(resolveModelAfterCredentialChange("  ", ["gemini-4-argon", "grok-4.6"], false)).toEqual({
      action: "select",
      model: "gemini-4-argon",
    });
  });

  it("匹配前忽略当前模型首尾空白", () => {
    expect(resolveModelAfterCredentialChange("  gpt-4o  ", ["gpt-4o"], false)).toEqual({
      action: "keep",
    });
  });
});
