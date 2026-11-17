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

describe("自定义模型在列表刷新后的保留规则", () => {
  it("手动输入的模型即使不在新列表中也保持不变", () => {
    expect(
      resolveModelAfterCredentialChange(
        "my-private-model",
        ["gpt-4o", "claude-sonnet-5"],
        false,
        true
      )
    ).toEqual({ action: "keep" });
  });

  it("手动输入的模型在拉取失败时不被清空", () => {
    expect(
      resolveModelAfterCredentialChange("my-private-model", ["gpt-4o"], true, true)
    ).toEqual({ action: "keep" });
  });

  it("手动输入的模型在返回空列表时保持不变", () => {
    expect(resolveModelAfterCredentialChange("my-private-model", [], false, true)).toEqual({
      action: "keep",
    });
  });

  it("列表选中的模型不在新列表时仍切换到首个模型", () => {
    expect(
      resolveModelAfterCredentialChange(
        "gpt-4o",
        ["claude-sonnet-5", "gpt-4o-mini"],
        false,
        false
      )
    ).toEqual({ action: "select", model: "claude-sonnet-5" });
  });

  it("自定义标记下当前模型为空时仍按原规则选择首个模型", () => {
    expect(resolveModelAfterCredentialChange("  ", ["gemini-4-argon"], false, true)).toEqual({
      action: "select",
      model: "gemini-4-argon",
    });
  });
});
