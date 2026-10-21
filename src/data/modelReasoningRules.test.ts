import { describe, expect, it } from "vitest";
import {
  ALL_REASONING_EFFORT_OPTIONS,
  MODEL_REASONING_RULES,
  findModelReasoningRule,
  getReasoningOptionsForModel,
  resolveValidReasoningEffort,
  isAdaptiveThinkingRequired,
} from "./modelReasoningRules";

describe("modelReasoningRules", () => {
  it("MODEL_REASONING_RULES 包含了全部 20 个模型规则", () => {
    expect(MODEL_REASONING_RULES).toHaveLength(20);

    const modelNames = MODEL_REASONING_RULES.map((r) => r.model);
    const expectedModels = [
      "GPT-5.6 Sol",
      "GPT-5.6 Terra",
      "GPT-5.6 Luna",
      "GPT-6 Astra",
      "GPT-6 Sol",
      "GPT-6 Luna",
      "GPT-6.1 Sol",
      "GLM-5.3",
      "GLM-5.3 Flash",
      "Kimi K3",
      "DeepSeek V4 Pro",
      "DeepSeek V4.1 Flash",
      "Grok 4.6",
      "Grok 4.7",
      "Claude 5 Sonnet",
      "Claude 5.5 Sonnet",
      "Claude 5 Opus",
      "Claude 5.5 Opus",
      "Gemini 4 Argon",
      "Gemini 3.8 Flash",
    ];

    for (const expected of expectedModels) {
      expect(modelNames, `必须包含模型规则: ${expected}`).toContain(expected);
    }
  });

  it("精确匹配与前缀匹配", () => {
    // GLM-5.3 Flash 与 GLM-5.3 优先级测试
    const flashRule = findModelReasoningRule("glm-5.3-flash");
    expect(flashRule?.model).toBe("GLM-5.3 Flash");
    expect(flashRule?.supportedEfforts).toEqual(["low", "high", "max"]);
    expect(flashRule?.defaultEffort).toBe("max");
    expect(flashRule?.allowDisableReasoning).toBe(false);

    const baseGlm = findModelReasoningRule("glm-5.3");
    expect(baseGlm?.model).toBe("GLM-5.3");

    // OpenAI 模型测试
    const solRule = findModelReasoningRule("gpt-5.6-sol");
    expect(solRule?.model).toBe("GPT-5.6 Sol");
    expect(solRule?.supportedEfforts).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(solRule?.defaultEffort).toBe("medium");

    const astraRule = findModelReasoningRule("openai/gpt-6-astra-preview");
    expect(astraRule?.model).toBe("GPT-6 Astra");
    expect(astraRule?.allowDisableReasoning).toBe(false);
    expect(astraRule?.defaultEffort).toBe("medium");

    // Grok 测试
    const grokRule = findModelReasoningRule("grok-4.6");
    expect(grokRule?.model).toBe("Grok 4.6");
    expect(grokRule?.defaultEffort).toBe("high");
    expect(grokRule?.supportedEfforts).toEqual(["low", "medium", "high", "xhigh"]);

    // DeepSeek 别名与标准名测试
    const flashAliasRule = findModelReasoningRule("deepseek-flash");
    expect(flashAliasRule?.model).toBe("DeepSeek V4.1 Flash");
    expect(flashAliasRule?.defaultEffort).toBe("high");
    expect(flashAliasRule?.supportedEfforts).toEqual(["none", "low", "high", "max"]);

    const slashFlashRule = findModelReasoningRule("deepseek/deepseek-flash");
    expect(slashFlashRule?.model).toBe("DeepSeek V4.1 Flash");

    const deepseekProRule = findModelReasoningRule("deepseek-v4-pro");
    expect(deepseekProRule?.model).toBe("DeepSeek V4 Pro");

    const deepseekProSnapshotRule = findModelReasoningRule("deepseek-v4-pro-0813");
    expect(deepseekProSnapshotRule?.model).toBe("DeepSeek V4 Pro");

    // Anthropic Claude 官方模型标识与标准名称双向测试
    const sonnet5Rule = findModelReasoningRule("claude-sonnet-5");
    expect(sonnet5Rule?.model).toBe("Claude 5 Sonnet");
    expect(sonnet5Rule?.defaultEffort).toBe("high");
    expect(sonnet5Rule?.allowDisableReasoning).toBe(true);

    const sonnet5NameRule = findModelReasoningRule("Claude 5 Sonnet");
    expect(sonnet5NameRule?.model).toBe("Claude 5 Sonnet");

    const sonnet55Rule = findModelReasoningRule("claude-sonnet-5-5");
    expect(sonnet55Rule?.model).toBe("Claude 5.5 Sonnet");

    const opus5Rule = findModelReasoningRule("claude-opus-5");
    expect(opus5Rule?.model).toBe("Claude 5 Opus");

    const slashOpusRule = findModelReasoningRule("anthropic/claude-opus-5");
    expect(slashOpusRule?.model).toBe("Claude 5 Opus");

    const opus55Rule = findModelReasoningRule("claude-opus-5-5");
    expect(opus55Rule?.model).toBe("Claude 5.5 Opus");

    // Google Gemini 官方模型标识与精确前缀测试
    const gemini4ArgonRule = findModelReasoningRule("gemini-4-argon");
    expect(gemini4ArgonRule?.model).toBe("Gemini 4 Argon");
    expect(gemini4ArgonRule?.allowDisableReasoning).toBe(false);
    expect(gemini4ArgonRule?.defaultEffort).toBe("medium");
    expect(gemini4ArgonRule?.supportedEfforts).toEqual(["low", "medium", "high"]);

    const slashGemini4Rule = findModelReasoningRule("google/gemini-4-argon");
    expect(slashGemini4Rule?.model).toBe("Gemini 4 Argon");

    const gemini38FlashRule = findModelReasoningRule("gemini-3.8-flash");
    expect(gemini38FlashRule?.model).toBe("Gemini 3.8 Flash");
    expect(gemini38FlashRule?.allowDisableReasoning).toBe(false);
    expect(gemini38FlashRule?.defaultEffort).toBe("medium");
    expect(gemini38FlashRule?.supportedEfforts).toEqual(["low", "medium", "high"]);

    const slashGemini38Rule = findModelReasoningRule("google/gemini-3.8-flash");
    expect(slashGemini38Rule?.model).toBe("Gemini 3.8 Flash");

    // 防误触断言：泛系列前缀（gemini-4, gemini-3.8）不得匹配，避免劫持未来衍生型号（如 gemini-4-flash, gemini-3.8-pro）
    expect(findModelReasoningRule("gemini-4")).toBeUndefined();
    expect(findModelReasoningRule("gemini-4-flash")).toBeUndefined();
    expect(findModelReasoningRule("gemini-3.8")).toBeUndefined();
    expect(findModelReasoningRule("gemini-3.8-pro")).toBeUndefined();
  });

  it("表格全部 20 个模型的思考强度与默认值完全对齐需求表", () => {
    const tableData = [
      {
        vendor: "OpenAI GPT-5.6",
        model: "GPT-5.6 Sol",
        supported: ["none", "low", "medium", "high", "xhigh", "max"],
        defaultEffort: "medium",
        allowDisable: true,
      },
      {
        vendor: "OpenAI GPT-5.6",
        model: "GPT-5.6 Terra",
        supported: ["none", "low", "medium", "high", "xhigh", "max"],
        defaultEffort: "medium",
        allowDisable: true,
      },
      {
        vendor: "OpenAI GPT-5.6",
        model: "GPT-5.6 Luna",
        supported: ["none", "low", "medium", "high", "xhigh", "max"],
        defaultEffort: "medium",
        allowDisable: true,
      },
      {
        vendor: "OpenAI GPT-6",
        model: "GPT-6 Astra",
        supported: ["low", "medium", "high", "xhigh", "max"],
        defaultEffort: "medium",
        allowDisable: false,
      },
      {
        vendor: "OpenAI GPT-6",
        model: "GPT-6 Sol",
        supported: ["none", "low", "medium", "high", "xhigh", "max"],
        defaultEffort: "medium",
        allowDisable: true,
      },
      {
        vendor: "OpenAI GPT-6",
        model: "GPT-6 Luna",
        supported: ["none", "low", "medium", "high", "xhigh", "max"],
        defaultEffort: "medium",
        allowDisable: true,
      },
      {
        vendor: "OpenAI GPT-6.1",
        model: "GPT-6.1 Sol",
        supported: ["low", "medium", "high", "xhigh", "max"],
        defaultEffort: "medium",
        allowDisable: false,
      },
      {
        vendor: "Zhipu GLM-5.3",
        model: "GLM-5.3",
        supported: ["low", "high", "max"],
        defaultEffort: "max",
        allowDisable: false,
      },
      {
        vendor: "Zhipu GLM-5.3",
        model: "GLM-5.3 Flash",
        supported: ["low", "high", "max"],
        defaultEffort: "max",
        allowDisable: false,
      },
      {
        vendor: "Moonshot Kimi",
        model: "Kimi K3",
        supported: ["low", "high", "max"],
        defaultEffort: "max",
        allowDisable: false,
      },
      {
        vendor: "DeepSeek",
        model: "DeepSeek V4 Pro",
        supported: ["none", "low", "high", "max"],
        defaultEffort: "high",
        allowDisable: true,
      },
      {
        vendor: "DeepSeek",
        model: "DeepSeek V4.1 Flash",
        supported: ["none", "low", "high", "max"],
        defaultEffort: "high",
        allowDisable: true,
      },
      {
        vendor: "xAI Grok",
        model: "Grok 4.6",
        supported: ["low", "medium", "high", "xhigh"],
        defaultEffort: "high",
        allowDisable: false,
      },
      {
        vendor: "xAI Grok",
        model: "Grok 4.7",
        supported: ["low", "medium", "high", "xhigh"],
        defaultEffort: "high",
        allowDisable: false,
      },
      {
        vendor: "Anthropic Claude",
        model: "Claude 5 Sonnet",
        supported: ["none", "low", "medium", "high", "xhigh", "max"],
        defaultEffort: "high",
        allowDisable: true,
      },
      {
        vendor: "Anthropic Claude",
        model: "Claude 5.5 Sonnet",
        supported: ["low", "medium", "high", "xhigh", "max"],
        defaultEffort: "high",
        allowDisable: false,
      },
      {
        vendor: "Anthropic Claude",
        model: "Claude 5 Opus",
        supported: ["none", "low", "medium", "high", "xhigh", "max"],
        defaultEffort: "high",
        allowDisable: true,
      },
      {
        vendor: "Anthropic Claude",
        model: "Claude 5.5 Opus",
        supported: ["low", "medium", "high", "xhigh", "max"],
        defaultEffort: "medium",
        allowDisable: false,
      },
      {
        vendor: "Google Gemini",
        model: "Gemini 4 Argon",
        supported: ["low", "medium", "high"],
        defaultEffort: "medium",
        allowDisable: false,
      },
      {
        vendor: "Google Gemini",
        model: "Gemini 3.8 Flash",
        supported: ["low", "medium", "high"],
        defaultEffort: "medium",
        allowDisable: false,
      },
    ];

    for (const item of tableData) {
      const rule = findModelReasoningRule(item.model);
      expect(rule, `必须能够查找到模型规则: ${item.model}`).toBeDefined();
      expect(rule!.vendor).toBe(item.vendor);
      expect(rule!.supportedEfforts, `${item.model} 支持的思考强度不一致`).toEqual(item.supported);
      expect(rule!.defaultEffort, `${item.model} 默认思考强度不一致`).toBe(item.defaultEffort);
      expect(rule!.allowDisableReasoning, `${item.model} 是否允许关闭思考不一致`).toBe(
        item.allowDisable
      );

      // 检查 options 生成函数
      const options = getReasoningOptionsForModel(item.model);
      expect(options).toHaveLength(item.supported.length);
      const defaultOpt = options.find((o) => o.isDefault);
      expect(defaultOpt?.value).toBe(item.defaultEffort);
    }
  });

  it("resolveValidReasoningEffort 正确修正思考强度", () => {
    // GLM-5.3 不支持 none，应修正为默认值 max
    expect(resolveValidReasoningEffort("glm-5.3", "none")).toBe("max");

    // GLM-5.3 支持 high，应保留 high
    expect(resolveValidReasoningEffort("glm-5.3", "high")).toBe("high");

    // Grok-4.6 不支持 max，应修正为 high
    expect(resolveValidReasoningEffort("grok-4.6", "max")).toBe("high");

    // 未匹配模型，保留原值或默认 high
    expect(resolveValidReasoningEffort("unknown-model", "minimal")).toBe("minimal");

    // 已移除的 ultra 等级，对于未匹配模型平滑回退至默认 high
    expect(resolveValidReasoningEffort("unknown-model", "ultra")).toBe("high");

    // 已移除的 ultra 等级，对于匹配特定规则模型平滑回退至其默认值
    expect(resolveValidReasoningEffort("gpt-5.6-sol", "ultra")).toBe("medium");

    // Gemini 4 Argon 不支持 none，应平滑修正为默认值 medium
    expect(resolveValidReasoningEffort("gemini-4-argon", "none")).toBe("medium");

    // Gemini 4 Argon 不支持 max，应平滑修正为默认值 medium
    expect(resolveValidReasoningEffort("gemini-4-argon", "max")).toBe("medium");

    // Gemini 3.8 Flash 不支持 none，应平滑修正为默认值 medium
    expect(resolveValidReasoningEffort("gemini-3.8-flash", "none")).toBe("medium");

    // Gemini 3.8 Flash 不支持 max，应平滑修正为默认值 medium
    expect(resolveValidReasoningEffort("gemini-3.8-flash", "max")).toBe("medium");

    // Gemini 3.8 Flash 支持 high，应正常保留 high
    expect(resolveValidReasoningEffort("gemini-3.8-flash", "high")).toBe("high");
  });

  it("ALL_REASONING_EFFORT_OPTIONS 不再包含已移除的 ultra 档位", () => {
    const values = ALL_REASONING_EFFORT_OPTIONS.map((opt) => opt.value);
    expect((values as string[]).includes("ultra"), "预设档位中不应包含 ultra").toBe(false);
    expect(values).toEqual(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
  });

  it("Claude 模型强制自适应思考精准判定与禁止数字预算", () => {
    // 规则配置中 Claude 5 / 5.5 新模型具备 requiresAdaptiveThinking 属性
    const sonnet55Rule = findModelReasoningRule("claude-sonnet-5-5");
    expect(sonnet55Rule?.requiresAdaptiveThinking).toBe(true);

    const opus5Rule = findModelReasoningRule("claude-opus-5");
    expect(opus5Rule?.requiresAdaptiveThinking).toBe(true);

    // 官方强制要求自适应思考的模型 (即传 enabled 会报 400 的模型)：4.7, 4.8 及 5.x+ 系列
    expect(isAdaptiveThinkingRequired("claude-sonnet-5-5")).toBe(true);
    expect(isAdaptiveThinkingRequired("claude-opus-5-5")).toBe(true);
    expect(isAdaptiveThinkingRequired("anthropic/claude-sonnet-5")).toBe(true);
    expect(isAdaptiveThinkingRequired("claude-opus-4-7")).toBe(true);
    expect(isAdaptiveThinkingRequired("claude-opus-4-8")).toBe(true);

    // 关键：官方支持但不强制自适应思考的模型 (如 Claude 4.6 系列)，使用 budget_tokens 仍然正常成功，绝对不得强制配置 adaptive
    expect(isAdaptiveThinkingRequired("claude-sonnet-4-6")).toBe(false);
    expect(isAdaptiveThinkingRequired("claude-opus-4-6")).toBe(false);

    // 不支持自适应思考的模型 (如 Claude 4.5、3.7 及更早)，传 adaptive 会报 400，严禁配置
    expect(isAdaptiveThinkingRequired("claude-opus-4-5")).toBe(false);
    expect(isAdaptiveThinkingRequired("claude-3-7-sonnet")).toBe(false);
    expect(isAdaptiveThinkingRequired("gpt-5.6-sol")).toBe(false);

    // 项目中任何模型都不允许直接设置数字思考额度，必须平滑回退到默认档位
    expect(resolveValidReasoningEffort("claude-sonnet-5-5", "4000")).toBe("high");
    expect(resolveValidReasoningEffort("claude-opus-5-5", "10000")).toBe("medium");
    expect(resolveValidReasoningEffort("gpt-5.6-sol", "4000")).toBe("medium");
  });
});
