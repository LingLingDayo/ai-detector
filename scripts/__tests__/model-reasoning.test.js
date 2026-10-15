import test from "node:test";
import assert from "node:assert/strict";

// 由于是 ts 模块，我们可以通过 node 动态执行测试，或者简单验证配置规则的纯逻辑。
// 先构建一个简单的 node 运行脚本进行断言。
import {
  ALL_REASONING_EFFORT_OPTIONS,
  MODEL_REASONING_RULES,
  normalizeModelName,
  findModelReasoningRule,
  getSupportedReasoningEfforts,
  getReasoningOptionsForModel,
  resolveValidReasoningEffort,
} from "../../src/data/modelReasoningRules.ts";

test("MODEL_REASONING_RULES 包含了全部 18 个模型规则", () => {
  assert.equal(MODEL_REASONING_RULES.length, 18);

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
    "GLM-5.3-FLASH",
    "Kimi K3",
    "DeepSeek-V4-Pro",
    "DeepSeek-V4.1-Flash",
    "Grok-4.6",
    "Grok-4.7",
    "claude-sonnet-5",
    "claude-sonnet-5-5",
    "claude-opus-5",
    "claude-opus-5-5",
  ];

  for (const expected of expectedModels) {
    assert.ok(modelNames.includes(expected), `必须包含模型规则: ${expected}`);
  }
});

test("精确匹配与前缀匹配", () => {
  // GLM-5.3-FLASH 与 GLM-5.3 优先级测试
  const flashRule = findModelReasoningRule("glm-5.3-flash");
  assert.equal(flashRule?.model, "GLM-5.3-FLASH");
  assert.deepEqual(flashRule?.supportedEfforts, ["low", "high", "max"]);
  assert.equal(flashRule?.defaultEffort, "max");
  assert.equal(flashRule?.allowDisableReasoning, false);

  const baseGlm = findModelReasoningRule("glm-5.3");
  assert.equal(baseGlm?.model, "GLM-5.3");

  // OpenAI 模型测试
  const solRule = findModelReasoningRule("gpt-5.6-sol");
  assert.equal(solRule?.model, "GPT-5.6 Sol");
  assert.deepEqual(solRule?.supportedEfforts, ["none", "low", "medium", "high", "xhigh", "max"]);
  assert.equal(solRule?.defaultEffort, "medium");

  const astraRule = findModelReasoningRule("openai/gpt-6-astra-preview");
  assert.equal(astraRule?.model, "GPT-6 Astra");
  assert.equal(astraRule?.allowDisableReasoning, false);
  assert.equal(astraRule?.defaultEffort, "medium");

  // Grok 测试
  const grokRule = findModelReasoningRule("grok-4.6");
  assert.equal(grokRule?.model, "Grok-4.6");
  assert.equal(grokRule?.defaultEffort, "high");
  assert.deepEqual(grokRule?.supportedEfforts, ["low", "medium", "high", "xhigh"]);

  // DeepSeek 别名测试 (deepseek-flash 与 DeepSeek-V4.1-Flash 等价)
  const flashAliasRule = findModelReasoningRule("deepseek-flash");
  assert.equal(flashAliasRule?.model, "DeepSeek-V4.1-Flash");
  assert.equal(flashAliasRule?.defaultEffort, "high");
  assert.deepEqual(flashAliasRule?.supportedEfforts, ["none", "low", "high", "max"]);

  const slashFlashRule = findModelReasoningRule("deepseek/deepseek-flash");
  assert.equal(slashFlashRule?.model, "DeepSeek-V4.1-Flash");

  // Anthropic Claude 官方模型标识与前缀测试
  const sonnet5Rule = findModelReasoningRule("claude-sonnet-5");
  assert.equal(sonnet5Rule?.model, "claude-sonnet-5");
  assert.equal(sonnet5Rule?.defaultEffort, "high");
  assert.equal(sonnet5Rule?.allowDisableReasoning, true);

  const sonnet55Rule = findModelReasoningRule("claude-sonnet-5-5");
  assert.equal(sonnet55Rule?.model, "claude-sonnet-5-5");

  const opus5Rule = findModelReasoningRule("claude-opus-5");
  assert.equal(opus5Rule?.model, "claude-opus-5");

  const slashOpusRule = findModelReasoningRule("anthropic/claude-opus-5");
  assert.equal(slashOpusRule?.model, "claude-opus-5");

  const opus55Rule = findModelReasoningRule("claude-opus-5-5");
  assert.equal(opus55Rule?.model, "claude-opus-5-5");
});

test("表格全部 18 个模型的思考强度与默认值完全对齐需求表", () => {
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
      model: "GLM-5.3-FLASH",
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
      model: "DeepSeek-V4-Pro",
      supported: ["none", "low", "high", "max"],
      defaultEffort: "high",
      allowDisable: true,
    },
    {
      vendor: "DeepSeek",
      model: "DeepSeek-V4.1-Flash",
      supported: ["none", "low", "high", "max"],
      defaultEffort: "high",
      allowDisable: true,
    },
    {
      vendor: "xAI Grok",
      model: "Grok-4.6",
      supported: ["low", "medium", "high", "xhigh"],
      defaultEffort: "high",
      allowDisable: false,
    },
    {
      vendor: "xAI Grok",
      model: "Grok-4.7",
      supported: ["low", "medium", "high", "xhigh"],
      defaultEffort: "high",
      allowDisable: false,
    },
    {
      vendor: "Anthropic Claude",
      model: "claude-sonnet-5",
      supported: ["none", "low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
      allowDisable: true,
    },
    {
      vendor: "Anthropic Claude",
      model: "claude-sonnet-5-5",
      supported: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
      allowDisable: false,
    },
    {
      vendor: "Anthropic Claude",
      model: "claude-opus-5",
      supported: ["none", "low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
      allowDisable: true,
    },
    {
      vendor: "Anthropic Claude",
      model: "claude-opus-5-5",
      supported: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "medium",
      allowDisable: false,
    },
  ];

  for (const item of tableData) {
    const rule = findModelReasoningRule(item.model);
    assert.ok(rule, `必须能够查找到模型规则: ${item.model}`);
    assert.equal(rule.vendor, item.vendor);
    assert.deepEqual(rule.supportedEfforts, item.supported, `${item.model} 支持的思考强度不一致`);
    assert.equal(rule.defaultEffort, item.defaultEffort, `${item.model} 默认思考强度不一致`);
    assert.equal(rule.allowDisableReasoning, item.allowDisable, `${item.model} 是否允许关闭思考不一致`);

    // 检查 options 生成函数
    const options = getReasoningOptionsForModel(item.model);
    assert.equal(options.length, item.supported.length);
    const defaultOpt = options.find((o) => o.isDefault);
    assert.equal(defaultOpt?.value, item.defaultEffort);
  }
});

test("resolveValidReasoningEffort 正确修正思考强度", () => {
  // GLM-5.3 不支持 none，应修正为默认值 max
  const effort1 = resolveValidReasoningEffort("glm-5.3", "none");
  assert.equal(effort1, "max");

  // GLM-5.3 支持 high，应保留 high
  const effort2 = resolveValidReasoningEffort("glm-5.3", "high");
  assert.equal(effort2, "high");

  // Grok-4.6 不支持 max，应修正为 high
  const effort3 = resolveValidReasoningEffort("grok-4.6", "max");
  assert.equal(effort3, "high");

  // 未匹配模型，保留原值或默认 high
  const effort4 = resolveValidReasoningEffort("unknown-model", "minimal");
  assert.equal(effort4, "minimal");

  // 已移除的 ultra 等级，对于未匹配模型平滑回退至默认 high
  const effort5 = resolveValidReasoningEffort("unknown-model", "ultra");
  assert.equal(effort5, "high");

  // 已移除的 ultra 等级，对于匹配特定规则模型平滑回退至其默认值
  const effort6 = resolveValidReasoningEffort("gpt-5.6-sol", "ultra");
  assert.equal(effort6, "medium");
});

test("ALL_REASONING_EFFORT_OPTIONS 不再包含已移除的 ultra 档位", () => {
  const values = ALL_REASONING_EFFORT_OPTIONS.map((opt) => opt.value);
  assert.equal(values.includes("ultra"), false, "预设档位中不应包含 ultra");
  assert.deepEqual(values, ["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
});



