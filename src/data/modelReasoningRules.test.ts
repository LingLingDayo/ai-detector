import { describe, expect, it } from "vitest";
import {
  ALL_REASONING_EFFORT_OPTIONS,
  MODEL_REASONING_OVERRIDES,
  MODEL_REASONING_RULES,
  SERIES_REASONING_RULES,
  findModelReasoningRule,
  getReasoningOptionsForModel,
  resolveValidReasoningEffort,
  isAdaptiveThinkingRequired,
  isThinkingSwitchModel,
} from "./modelReasoningRules";

describe("modelReasoningRules", () => {
  it("SERIES_REASONING_RULES 与 MODEL_REASONING_OVERRIDES 结构完整且自洽", () => {
    const seriesNames = new Set(SERIES_REASONING_RULES.map((s) => s.series));
    expect(seriesNames.size).toBe(SERIES_REASONING_RULES.length);

    for (const seriesRule of SERIES_REASONING_RULES) {
      expect(
        seriesRule.supportedEfforts.includes(seriesRule.defaultEffort),
        `系列 ${seriesRule.series} 的 defaultEffort 必须在 supportedEfforts 中`
      ).toBe(true);
    }

    for (const override of MODEL_REASONING_OVERRIDES) {
      if (override.series) {
        expect(
          seriesNames.has(override.series),
          `覆盖配置 ${override.model} 引用的系列 ${override.series} 必须存在`
        ).toBe(true);
      }
    }

    expect(MODEL_REASONING_RULES).toHaveLength(
      SERIES_REASONING_RULES.length + MODEL_REASONING_OVERRIDES.length
    );
  });

  it("按系列匹配并支持单模型覆盖及同系列未来型号自动兼容", () => {
    // GLM-5.3 系列及同系列不同变体
    const flashRule = findModelReasoningRule("glm-5.3-flash");
    expect(flashRule?.series).toBe("GLM-5.3");
    expect(flashRule?.isOverride).toBe(false);
    expect(flashRule?.supportedEfforts).toEqual(["low", "high", "max"]);
    expect(flashRule?.defaultEffort).toBe("max");
    expect(flashRule?.allowDisableReasoning).toBe(false);

    const baseGlm = findModelReasoningRule("glm-5.3");
    expect(baseGlm?.series).toBe("GLM-5.3");

    const flashxRule = findModelReasoningRule("glm-5.3-flashx");
    expect(flashxRule?.series).toBe("GLM-5.3");

    const futureGlmRule = findModelReasoningRule("glm-5.3-air");
    expect(futureGlmRule?.series).toBe("GLM-5.3");
    expect(futureGlmRule?.supportedEfforts).toEqual(["low", "high", "max"]);
    expect(futureGlmRule?.defaultEffort).toBe("max");

    // Moonshot Kimi 系列与子版本互不抢占
    const kimiK31ProRule = findModelReasoningRule("kimi-k3.1-pro");
    expect(kimiK31ProRule?.series).toBe("Kimi K3.1");
    expect(kimiK31ProRule?.supportedEfforts).toEqual(["low", "high", "max"]);
    expect(kimiK31ProRule?.defaultEffort).toBe("max");
    expect(kimiK31ProRule?.allowDisableReasoning).toBe(false);

    const kimiK31AliasRule = findModelReasoningRule("kimi-k3.1");
    expect(kimiK31AliasRule?.series).toBe("Kimi K3.1");

    const slashKimiK31Rule = findModelReasoningRule("moonshot/kimi-k3.1-pro");
    expect(slashKimiK31Rule?.series).toBe("Kimi K3.1");

    const futureKimiK31Rule = findModelReasoningRule("kimi-k3.1-turbo");
    expect(futureKimiK31Rule?.series).toBe("Kimi K3.1");

    const kimiK3Rule = findModelReasoningRule("kimi-k3");
    expect(kimiK3Rule?.series).toBe("Kimi K3");

    const kimiPreviewRule = findModelReasoningRule("kimi-k2.8-preview");
    expect(kimiPreviewRule?.series).toBe("Kimi K2.8");
    expect(kimiPreviewRule?.defaultEffort).toBe("max");

    // Qwen3.8 系列与快照/供应商前缀/新增型号兼容
    const qwenMaxRule = findModelReasoningRule("qwen3.8-max-0902");
    expect(qwenMaxRule?.series).toBe("Qwen3.8");
    expect(qwenMaxRule?.supportedEfforts).toEqual(["none", "low", "medium", "xhigh"]);
    expect(qwenMaxRule?.defaultEffort).toBe("xhigh");

    const qwenFlashRule = findModelReasoningRule("dashscope/qwen3.8-flash");
    expect(qwenFlashRule?.series).toBe("Qwen3.8");
    expect(qwenFlashRule?.defaultEffort).toBe("xhigh");

    const futureQwenRule = findModelReasoningRule("qwen3.8-coder");
    expect(futureQwenRule?.series).toBe("Qwen3.8");
    expect(futureQwenRule?.supportedEfforts).toEqual(["none", "low", "medium", "xhigh"]);

    // Xiaomi MiMo V2.6 系列仅支持 thinking 开关，新增同系列模型自动继承
    const mimoProRule = findModelReasoningRule("mimo-v2.6-pro");
    expect(mimoProRule?.series).toBe("MiMo V2.6");
    expect(mimoProRule?.supportedEfforts).toEqual(["none", "high"]);
    expect(mimoProRule?.defaultEffort).toBe("high");
    expect(mimoProRule?.thinkingSwitchOnly).toBe(true);

    const mimoFlashRule = findModelReasoningRule("xiaomi/mimo-v2.6-flash");
    expect(mimoFlashRule?.series).toBe("MiMo V2.6");
    expect(mimoFlashRule?.defaultEffort).toBe("high");

    const mimoUltraRule = findModelReasoningRule("mimo-v2.6-pro-ultraspeed");
    expect(mimoUltraRule?.series).toBe("MiMo V2.6");

    expect(isThinkingSwitchModel("mimo-v2.6-pro")).toBe(true);
    expect(isThinkingSwitchModel("mimo-v2.6-flash")).toBe(true);
    expect(isThinkingSwitchModel("mimo-v2.6-pro-ultraspeed")).toBe(true);
    expect(isThinkingSwitchModel("mimo-v2.6-lite")).toBe(true);
    expect(isThinkingSwitchModel("gpt-5.6-sol")).toBe(false);
    expect(isThinkingSwitchModel("glm-5.3")).toBe(false);

    // OpenAI 系列 + GPT-6 Astra 单模型覆盖 + GPT-6.1 系列不与 GPT-6 混淆
    const solRule = findModelReasoningRule("gpt-5.6-sol");
    expect(solRule?.series).toBe("GPT-5.6");
    expect(solRule?.supportedEfforts).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(solRule?.defaultEffort).toBe("medium");
    expect(findModelReasoningRule("gpt-5.6-mini")?.series).toBe("GPT-5.6");

    const gpt6MiniRule = findModelReasoningRule("gpt-6-mini");
    expect(gpt6MiniRule?.series).toBe("GPT-6");
    expect(gpt6MiniRule?.isOverride).toBe(false);
    expect(gpt6MiniRule?.allowDisableReasoning).toBe(true);

    const astraRule = findModelReasoningRule("openai/gpt-6-astra-preview");
    expect(astraRule?.model).toBe("GPT-6 Astra");
    expect(astraRule?.series).toBe("GPT-6");
    expect(astraRule?.isOverride).toBe(true);
    expect(astraRule?.allowDisableReasoning).toBe(false);
    expect(astraRule?.defaultEffort).toBe("medium");
    expect(astraRule?.supportedEfforts).toEqual(["low", "medium", "high", "xhigh", "max"]);

    const gpt61SolRule = findModelReasoningRule("gpt-6.1-sol");
    expect(gpt61SolRule?.series).toBe("GPT-6.1");
    expect(gpt61SolRule?.allowDisableReasoning).toBe(false);
    expect(gpt61SolRule?.supportedEfforts).toEqual(["low", "medium", "high", "xhigh", "max"]);

    const gpt61FutureRule = findModelReasoningRule("openai/gpt-6.1-luna");
    expect(gpt61FutureRule?.series).toBe("GPT-6.1");
    expect(gpt61FutureRule?.allowDisableReasoning).toBe(false);
    expect(gpt61FutureRule?.defaultEffort).toBe("medium");

    // Grok 系列测试
    const grokRule = findModelReasoningRule("grok-4.6");
    expect(grokRule?.series).toBe("Grok 4.6");
    expect(grokRule?.defaultEffort).toBe("high");
    expect(grokRule?.supportedEfforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(findModelReasoningRule("grok-4.7-mini")?.series).toBe("Grok 4.7");

    // DeepSeek 系列与别名测试
    const flashAliasRule = findModelReasoningRule("deepseek-flash");
    expect(flashAliasRule?.series).toBe("DeepSeek V4.1");
    expect(flashAliasRule?.defaultEffort).toBe("high");
    expect(flashAliasRule?.supportedEfforts).toEqual(["none", "low", "high", "max"]);

    const slashFlashRule = findModelReasoningRule("deepseek/deepseek-flash");
    expect(slashFlashRule?.series).toBe("DeepSeek V4.1");

    const deepseekProRule = findModelReasoningRule("deepseek-v4-pro");
    expect(deepseekProRule?.series).toBe("DeepSeek V4");

    const deepseekProSnapshotRule = findModelReasoningRule("deepseek-v4-pro-0813");
    expect(deepseekProSnapshotRule?.series).toBe("DeepSeek V4");

    // Anthropic Claude 系列 + Claude 5.5 Opus 默认值覆盖测试
    const sonnet5Rule = findModelReasoningRule("claude-sonnet-5");
    expect(sonnet5Rule?.series).toBe("Claude 5");
    expect(sonnet5Rule?.defaultEffort).toBe("high");
    expect(sonnet5Rule?.allowDisableReasoning).toBe(true);

    const sonnet5NameRule = findModelReasoningRule("Claude 5 Sonnet");
    expect(sonnet5NameRule?.series).toBe("Claude 5");

    const sonnet5SnapshotRule = findModelReasoningRule("claude-sonnet-5-20260514");
    expect(sonnet5SnapshotRule?.series).toBe("Claude 5");

    const haiku5Rule = findModelReasoningRule("claude-haiku-5");
    expect(haiku5Rule?.series).toBe("Claude 5");
    expect(haiku5Rule?.allowDisableReasoning).toBe(true);

    const sonnet55Rule = findModelReasoningRule("claude-sonnet-5-5");
    expect(sonnet55Rule?.series).toBe("Claude 5.5");
    expect(sonnet55Rule?.isOverride).toBe(false);
    expect(sonnet55Rule?.defaultEffort).toBe("high");
    expect(sonnet55Rule?.allowDisableReasoning).toBe(false);

    const haiku55Rule = findModelReasoningRule("claude-5.5-haiku");
    expect(haiku55Rule?.series).toBe("Claude 5.5");
    expect(haiku55Rule?.defaultEffort).toBe("high");

    const opus5Rule = findModelReasoningRule("claude-opus-5");
    expect(opus5Rule?.series).toBe("Claude 5");

    const slashOpusRule = findModelReasoningRule("anthropic/claude-opus-5");
    expect(slashOpusRule?.series).toBe("Claude 5");

    const opus55Rule = findModelReasoningRule("claude-opus-5-5");
    expect(opus55Rule?.model).toBe("Claude 5.5 Opus");
    expect(opus55Rule?.series).toBe("Claude 5.5");
    expect(opus55Rule?.isOverride).toBe(true);
    expect(opus55Rule?.defaultEffort).toBe("medium");
    expect(opus55Rule?.allowDisableReasoning).toBe(false);
    expect(findModelReasoningRule("Claude 5.5 Opus")?.model).toBe("Claude 5.5 Opus");

    // Anthropic Claude Fable 5 / 5.1 / 5.2 系列
    for (const fableId of [
      "claude-fable-5",
      "claude-fable-5-1",
      "claude-fable-5-2",
      "anthropic/claude-fable-5-2",
      "claude-fable-5-2-20261116",
      "Claude Fable 5.2",
      "Claude 5.2 Fable",
      "fable-5.1",
      "fable-5.2",
    ]) {
      const fableRule = findModelReasoningRule(fableId);
      expect(fableRule?.series, `${fableId} 应命中 Claude Fable 5 系列`).toBe("Claude Fable 5");
      expect(fableRule?.supportedEfforts).toEqual(["low", "medium", "high", "xhigh", "max"]);
      expect(fableRule?.defaultEffort).toBe("high");
      expect(fableRule?.allowDisableReasoning).toBe(false);
      expect(fableRule?.requiresAdaptiveThinking).toBe(true);
    }

    // Google Gemini 系列自动匹配当前型号与同系列新增型号
    const gemini4ArgonRule = findModelReasoningRule("gemini-4-argon");
    expect(gemini4ArgonRule?.series).toBe("Gemini 4");
    expect(gemini4ArgonRule?.allowDisableReasoning).toBe(false);
    expect(gemini4ArgonRule?.defaultEffort).toBe("medium");
    expect(gemini4ArgonRule?.supportedEfforts).toEqual(["low", "medium", "high"]);

    const slashGemini4Rule = findModelReasoningRule("google/gemini-4-argon");
    expect(slashGemini4Rule?.series).toBe("Gemini 4");

    const gemini38FlashRule = findModelReasoningRule("gemini-3.8-flash");
    expect(gemini38FlashRule?.series).toBe("Gemini 3.8");
    expect(gemini38FlashRule?.allowDisableReasoning).toBe(false);
    expect(gemini38FlashRule?.defaultEffort).toBe("medium");
    expect(gemini38FlashRule?.supportedEfforts).toEqual(["low", "medium", "high"]);

    const slashGemini38Rule = findModelReasoningRule("google/gemini-3.8-flash");
    expect(slashGemini38Rule?.series).toBe("Gemini 3.8");

    // 同系列新增型号自动兼容，而未配置的老版本系列保持 undefined
    expect(findModelReasoningRule("gemini-4")?.series).toBe("Gemini 4");
    expect(findModelReasoningRule("gemini-4-flash")?.series).toBe("Gemini 4");
    expect(findModelReasoningRule("gemini-3.8")?.series).toBe("Gemini 3.8");
    expect(findModelReasoningRule("gemini-3.8-pro")?.series).toBe("Gemini 3.8");
    expect(findModelReasoningRule("gemini-2.5-pro")).toBeUndefined();
  });

  it("表格全部 31 个模型的思考强度与默认值完全对齐需求表", () => {
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
        vendor: "Zhipu GLM-5.3",
        model: "GLM-5.3 FlashX",
        supported: ["low", "high", "max"],
        defaultEffort: "max",
        allowDisable: false,
      },
      {
        vendor: "Moonshot Kimi",
        model: "Kimi K3.1 Pro",
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
        vendor: "Moonshot Kimi",
        model: "Kimi K2.8 Preview",
        supported: ["low", "high", "max"],
        defaultEffort: "max",
        allowDisable: false,
      },
      {
        vendor: "Alibaba Qwen",
        model: "Qwen3.8 Max",
        supported: ["none", "low", "medium", "xhigh"],
        defaultEffort: "xhigh",
        allowDisable: true,
      },
      {
        vendor: "Alibaba Qwen",
        model: "Qwen3.8 Flash",
        supported: ["none", "low", "medium", "xhigh"],
        defaultEffort: "xhigh",
        allowDisable: true,
      },
      {
        vendor: "Xiaomi MiMo",
        model: "MiMo V2.6 Pro",
        supported: ["none", "high"],
        defaultEffort: "high",
        allowDisable: true,
      },
      {
        vendor: "Xiaomi MiMo",
        model: "MiMo V2.6 Flash",
        supported: ["none", "high"],
        defaultEffort: "high",
        allowDisable: true,
      },
      {
        vendor: "Xiaomi MiMo",
        model: "MiMo V2.6 Pro-UltraSpeed",
        supported: ["none", "high"],
        defaultEffort: "high",
        allowDisable: true,
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
      {
        vendor: "Google Gemini",
        model: "Gemini 3.7 Flash",
        supported: ["low", "medium", "high"],
        defaultEffort: "medium",
        allowDisable: false,
      },
      {
        vendor: "Google Gemini",
        model: "Gemini 3.6 Flash",
        supported: ["low", "medium", "high"],
        defaultEffort: "medium",
        allowDisable: false,
      },
      {
        vendor: "Google Gemini",
        model: "Gemini 3.1 Pro",
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

    // Qwen3.8 系列：max/high 收敛到 xhigh，low 保留，none 允许关闭思考
    expect(resolveValidReasoningEffort("qwen3.8-max", "max")).toBe("xhigh");
    expect(resolveValidReasoningEffort("qwen3.8-max", "high")).toBe("xhigh");
    expect(resolveValidReasoningEffort("qwen3.8-flash", "low")).toBe("low");
    expect(resolveValidReasoningEffort("qwen3.8-flash", "none")).toBe("none");

    // GLM-5.3 FlashX 不支持 medium，应修正为默认 max
    expect(resolveValidReasoningEffort("glm-5.3-flashx", "medium")).toBe("max");

    // Kimi K3.1 Pro 始终开启思考，不支持 none 与 medium，应修正为默认 max
    expect(resolveValidReasoningEffort("kimi-k3.1-pro", "none")).toBe("max");
    expect(resolveValidReasoningEffort("kimi-k3.1-pro", "medium")).toBe("max");
    expect(resolveValidReasoningEffort("kimi-k3.1-pro", "low")).toBe("low");
    expect(resolveValidReasoningEffort("kimi-k3.1-pro", "high")).toBe("high");
    expect(resolveValidReasoningEffort("kimi-k3.1-pro", "max")).toBe("max");

    // Kimi K2.8 Preview 不支持 medium，应修正为默认 max
    expect(resolveValidReasoningEffort("kimi-k2.8-preview", "medium")).toBe("max");

    // MiMo V2.6 仅支持开关：其他档位收敛为 high，none 保留用于关闭思考
    expect(resolveValidReasoningEffort("mimo-v2.6-pro", "medium")).toBe("high");
    expect(resolveValidReasoningEffort("mimo-v2.6-flash", "max")).toBe("high");
    expect(resolveValidReasoningEffort("mimo-v2.6-pro-ultraspeed", "none")).toBe("none");

    // GPT-6.1 系列新增型号自动应用系列限定
    expect(resolveValidReasoningEffort("gpt-6.1-luna", "none")).toBe("medium");
    expect(resolveValidReasoningEffort("gpt-6.1-luna", "xhigh")).toBe("xhigh");

    // Claude Fable 5 / 5.1 / 5.2 系列：始终开启思考，不支持 none，其余 5 档保留
    expect(resolveValidReasoningEffort("claude-fable-5", "none")).toBe("high");
    expect(resolveValidReasoningEffort("claude-fable-5-1", "none")).toBe("high");
    expect(resolveValidReasoningEffort("claude-fable-5-2", "none")).toBe("high");
    expect(resolveValidReasoningEffort("claude-fable-5-2", "minimal")).toBe("high");
    expect(resolveValidReasoningEffort("claude-fable-5-2", "xhigh")).toBe("xhigh");
    expect(resolveValidReasoningEffort("claude-fable-5-2", "max")).toBe("max");
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
    expect(isAdaptiveThinkingRequired("claude-fable-5")).toBe(true);
    expect(isAdaptiveThinkingRequired("claude-fable-5-1")).toBe(true);
    expect(isAdaptiveThinkingRequired("claude-fable-5-2")).toBe(true);
    expect(isAdaptiveThinkingRequired("fable-5.2")).toBe(true);
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
