import { describe, expect, it } from "vitest";
import { resolveModelAfterCredentialChange, selectDefaultModel } from "./useModelFetch";

describe("selectDefaultModel", () => {
  it("空列表返回 null", () => {
    expect(selectDefaultModel([])).toBeNull();
  });

  it("优先选择标识数字最大的模型（如 gpt-5.6-sol 与 gpt-6-sol 选中 gpt-6-sol）", () => {
    expect(selectDefaultModel(["gpt-5.6-sol", "gpt-6-sol"])).toBe("gpt-6-sol");
  });

  it("多模型含并列最大值与无数字项时选中最大数字的第一个", () => {
    expect(
      selectDefaultModel([
        "gpt-6-astra",
        "gpt-6-sol",
        "gpt-6.1-sol",
        "gpt-6.2-astra",
        "gpt-6.2-sol",
        "codex-auto-review",
      ])
    ).toBe("gpt-6.2-astra");
  });

  it("无数字模型排在前面时优先级低于有数字模型", () => {
    expect(selectDefaultModel(["codex-auto-review", "model-0"])).toBe("model-0");
  });

  it("全部无数字标识时兜底返回列表第一个模型", () => {
    expect(selectDefaultModel(["codex-auto-review", "yi-large"])).toBe("codex-auto-review");
  });

  it("多位次版本按数值大小比较且等价版本并列选首个", () => {
    expect(selectDefaultModel(["gpt-6.2-sol", "gpt-6.10-sol"])).toBe("gpt-6.10-sol");
    expect(selectDefaultModel(["gpt-6.0-sol", "gpt-6-astra"])).toBe("gpt-6.0-sol");
  });

  it("支持连字符主次版本比较（如 claude-opus-5-5 高于 claude-sonnet-5-20260514 与 claude-3-7-sonnet）", () => {
    expect(
      selectDefaultModel(["claude-3-7-sonnet", "claude-sonnet-5-20260514", "claude-opus-5-5"])
    ).toBe("claude-opus-5-5");
  });

  it("日期后缀不会被误判为超大版本号", () => {
    expect(
      selectDefaultModel(["codex-20250501", "gpt-4o-2024-11-20", "gpt-6-sol"])
    ).toBe("gpt-6-sol");
  });

  it("比较前剥离厂商路径前缀", () => {
    expect(
      selectDefaultModel(["01-ai/yi-large", "openai/gpt-5.6-sol", "openai/gpt-6-sol"])
    ).toBe("openai/gpt-6-sol");
  });
});

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

  it("旧模型不在新列表时切换到标识数字最大的模型", () => {
    expect(
      resolveModelAfterCredentialChange("gpt-4o", ["claude-sonnet-5", "gpt-4o-mini"], false)
    ).toEqual({
      action: "select",
      model: "claude-sonnet-5",
    });
  });

  it("当前模型为空时切换到标识数字最大的模型", () => {
    expect(resolveModelAfterCredentialChange("  ", ["gemini-4-argon", "grok-4.6"], false)).toEqual({
      action: "select",
      model: "grok-4.6",
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

  it("列表选中的模型不在新列表时仍切换到默认模型", () => {
    expect(
      resolveModelAfterCredentialChange(
        "gpt-4o",
        ["claude-sonnet-5", "gpt-4o-mini"],
        false,
        false
      )
    ).toEqual({ action: "select", model: "claude-sonnet-5" });
  });

  it("自定义标记下当前模型为空时仍按默认规则选择模型", () => {
    expect(resolveModelAfterCredentialChange("  ", ["gemini-4-argon"], false, true)).toEqual({
      action: "select",
      model: "gemini-4-argon",
    });
  });
});
