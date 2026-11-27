/**
 * 系统预设的全部思考强度档位信息
 */
export const ALL_REASONING_EFFORT_OPTIONS = [
  { label: "none", value: "none", description: "关闭" },
  { label: "minimal", value: "minimal", description: "极低" },
  { label: "low", value: "low", description: "轻度" },
  { label: "medium", value: "medium", description: "中度" },
  { label: "high", value: "high", description: "深度" },
  { label: "xhigh", value: "xhigh", description: "极高" },
  { label: "max", value: "max", description: "最高" },
] as const;

/**
 * 思考强度档位类型定义
 */
export type ReasoningEffortLevel =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/**
 * 思考强度选项展示对象
 */
export interface ReasoningEffortOptionItem {
  label: string;
  value: ReasoningEffortLevel;
  description: string;
  isDefault?: boolean;
}

/**
 * 按模型系列配置思考强度规则
 */
export interface SeriesReasoningRule {
  /** 厂商名称 (如 OpenAI GPT-6.1、Anthropic Claude) */
  vendor: string;
  /** 系列名称 (如 GPT-6.1、GLM-5.3、Claude 5.5) */
  series: string;
  /** 系列支持的思考强度列表 (有序) */
  supportedEfforts: readonly ReasoningEffortLevel[];
  /** 系列默认思考强度 */
  defaultEffort: ReasoningEffortLevel;
  /** 是否可关闭思考 (未显式指定时按 supportedEfforts 是否包含 "none" 自动推导) */
  allowDisableReasoning?: boolean;
  /** 是否强制要求自适应思考 (即 API 拒绝 budget_tokens 且强制要求 type: "adaptive") */
  requiresAdaptiveThinking?: boolean;
  /** 是否仅支持 thinking.type 开关 (enabled/disabled)，不支持 reasoning_effort */
  thinkingSwitchOnly?: boolean;
  /** 备注说明 */
  notes?: string;
  /**
   * 系列匹配标识或正则模式 (可选)。
   * 若未提供，将基于 series 名称进行智能归一化前缀匹配。
   */
  patterns?: readonly (string | RegExp)[];
}

/**
 * 具体模型的覆盖配置（基于所属系列按需覆盖字段，也可省略 series 独立配置）
 */
export interface ModelReasoningOverride {
  /** 所属系列名称 (对应 SERIES_REASONING_RULES 中的 series，用于继承系列配置) */
  series?: string;
  /** 厂商名称 (未关联 series 时必填，关联 series 时默认继承) */
  vendor?: string;
  /** 具体模型标准名称 (如 GPT-6 Astra、Claude 5.5 Opus) */
  model: string;
  /** 覆盖支持的思考强度列表 (可选，不填则继承系列) */
  supportedEfforts?: readonly ReasoningEffortLevel[];
  /** 覆盖默认思考强度 (可选，不填则继承系列) */
  defaultEffort?: ReasoningEffortLevel;
  /** 覆盖是否可关闭思考 (可选；若覆盖了 supportedEfforts 且未显式指定，则按是否含 "none" 自动推导) */
  allowDisableReasoning?: boolean;
  /** 覆盖是否强制要求自适应思考 (可选，不填则继承系列) */
  requiresAdaptiveThinking?: boolean;
  /** 覆盖是否仅支持 thinking.type 开关 (可选，不填则继承系列) */
  thinkingSwitchOnly?: boolean;
  /** 覆盖备注说明 (可选，不填则继承系列) */
  notes?: string;
  /**
   * 显式匹配标识或正则模式 (可选)。
   * 若未提供，将基于 model 标准名称进行智能归一化匹配。
   */
  patterns?: readonly (string | RegExp)[];
}

/**
 * 解析后的模型思考强度限定配置规则 (兼容原有调用方)
 */
export interface ModelReasoningRule {
  /** 厂商 / 系列 */
  vendor: string;
  /** 所属系列名称 */
  series?: string;
  /** 匹配到的标准名称 (具体覆盖模型名，或系列展示名) */
  model: string;
  /** 是否为单模型覆盖规则 */
  isOverride?: boolean;
  /** 支持的思考强度列表 (有序) */
  supportedEfforts: readonly ReasoningEffortLevel[];
  /** 默认思考强度 */
  defaultEffort: ReasoningEffortLevel;
  /** 是否可关闭思考 (即是否支持 none) */
  allowDisableReasoning: boolean;
  /** 是否强制要求自适应思考 (即 API 拒绝 budget_tokens 且强制要求 type: "adaptive") */
  requiresAdaptiveThinking?: boolean;
  /** 是否仅支持 thinking.type 开关 (enabled/disabled)，不支持 reasoning_effort */
  thinkingSwitchOnly?: boolean;
  /** 备注说明 */
  notes?: string;
  /** 匹配标识或正则模式 */
  patterns?: readonly (string | RegExp)[];
}

/**
 * 第一层：按模型系列配置思考强度规则表
 * 后续新增同系列模型时无需逐个登记，会自动命中对应系列规则。
 */
export const SERIES_REASONING_RULES: readonly SeriesReasoningRule[] = [
  // ==================== OpenAI GPT ====================
  {
    vendor: "OpenAI GPT-5.6",
    series: "GPT-5.6",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
  },
  {
    vendor: "OpenAI GPT-6",
    series: "GPT-6",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
  },
  {
    vendor: "OpenAI GPT-6.1",
    series: "GPT-6.1",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
  },
  {
    vendor: "OpenAI GPT-6.2",
    series: "GPT-6.2",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
  },

  // ==================== Zhipu GLM ====================
  {
    vendor: "Zhipu GLM-5.3",
    series: "GLM-5.3",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
  },

  // ==================== Moonshot Kimi ====================
  {
    vendor: "Moonshot Kimi",
    series: "Kimi K3.1",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
  },
  {
    vendor: "Moonshot Kimi",
    series: "Kimi K3",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
  },
  {
    vendor: "Moonshot Kimi",
    series: "Kimi K2.8",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
  },

  // ==================== Alibaba Qwen ====================
  {
    vendor: "Alibaba Qwen",
    series: "Qwen3.8",
    supportedEfforts: ["none", "low", "medium", "xhigh"],
    defaultEffort: "xhigh",
    patterns: ["qwen3.8", "qwen-3.8"],
  },

  // ==================== Xiaomi MiMo ====================
  {
    vendor: "Xiaomi MiMo",
    series: "MiMo V2.6",
    supportedEfforts: ["none", "high"],
    defaultEffort: "high",
    thinkingSwitchOnly: true,
    notes: "仅支持 thinking 开关，high 表示开启思考",
  },

  // ==================== DeepSeek ====================
  {
    vendor: "DeepSeek",
    series: "DeepSeek V4",
    supportedEfforts: ["none", "low", "high", "max"],
    defaultEffort: "high",
  },
  {
    vendor: "DeepSeek",
    series: "DeepSeek V4.1",
    supportedEfforts: ["none", "low", "high", "max"],
    defaultEffort: "high",
    notes: "官方别名 deepseek-flash",
    patterns: ["deepseek-v4.1", "deepseek-flash"],
  },

  // ==================== xAI Grok ====================
  {
    vendor: "xAI Grok",
    series: "Grok 4.6",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
  },
  {
    vendor: "xAI Grok",
    series: "Grok 4.7",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
  },

  // ==================== Anthropic Claude ====================
  {
    vendor: "Anthropic Claude",
    series: "Claude 5",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "high",
    requiresAdaptiveThinking: true,
    // 排除 5-5 / 5.5 等次版本，同时保留 5-20260514 类日期快照后缀的匹配
    patterns: [
      /^claude-(?:sonnet|opus|haiku|mythos)-5(?![.\-]\d(?:$|[-_:]))(?:$|[-_:])/,
      /^claude-5(?![.\-]\d(?:$|[-_:]))(?:$|[-_:])/,
    ],
  },
  {
    vendor: "Anthropic Claude",
    series: "Claude 5.5",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "high",
    requiresAdaptiveThinking: true,
    patterns: [
      /^claude-(?:sonnet|opus|haiku|mythos)-(?:5-5|5\.5)(?:$|[-_:])/,
      /^claude-(?:5-5|5\.5)(?:$|[-_:])/,
    ],
  },
  {
    vendor: "Anthropic Claude",
    series: "Claude Fable 5",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "high",
    requiresAdaptiveThinking: true,
    // 覆盖 Fable 5 / 5.1 / 5.2 及同代后续 5.x 型号（自适应思考始终开启，不支持关闭）
    patterns: [
      /^(?:claude-)?fable-5(?:[.\-]\d+)?(?:$|[-_:])/,
      /^claude-5(?:[.\-]\d+)?-fable(?:$|[-_:])/,
    ],
  },

  // ==================== Google Gemini ====================
  {
    vendor: "Google Gemini",
    series: "Gemini 4",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    vendor: "Google Gemini",
    series: "Gemini 3.8",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    vendor: "Google Gemini",
    series: "Gemini 3.7",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    vendor: "Google Gemini",
    series: "Gemini 3.6",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    vendor: "Google Gemini",
    series: "Gemini 3.1",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
] as const;

/**
 * 第二层：具体模型覆盖配置表
 * 当某个具体模型的思考强度列表、默认值或能力开关与所属系列不同，仅需在此覆盖差异项。
 */
export const MODEL_REASONING_OVERRIDES: readonly ModelReasoningOverride[] = [
  {
    series: "GPT-6",
    model: "GPT-6 Astra",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    series: "Claude 5.5",
    model: "Claude 5.5 Opus",
    defaultEffort: "medium",
    patterns: ["claude-opus-5-5", "claude-5.5-opus", "claude-5-5-opus"],
  },
] as const;

/**
 * 规范化模型名称字符串，用于容错模糊匹配
 * - 剥离前置供应商路径 (如 openai/gpt-5.6-sol -> gpt-5.6-sol)
 * - 转小写、统一空格与下划线为连字符
 */
export function normalizeModelName(name?: string): string {
  if (!name) return "";
  const trimmed = name.trim();
  const lastSlashIndex = trimmed.lastIndexOf("/");
  const baseName = lastSlashIndex !== -1 ? trimmed.slice(lastSlashIndex + 1) : trimmed;
  return baseName
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .trim();
}

function buildSeriesRule(seriesRule: SeriesReasoningRule): ModelReasoningRule {
  return {
    vendor: seriesRule.vendor,
    series: seriesRule.series,
    model: `${seriesRule.series} 系列`,
    isOverride: false,
    supportedEfforts: seriesRule.supportedEfforts,
    defaultEffort: seriesRule.defaultEffort,
    allowDisableReasoning:
      seriesRule.allowDisableReasoning ?? seriesRule.supportedEfforts.includes("none"),
    requiresAdaptiveThinking: seriesRule.requiresAdaptiveThinking,
    thinkingSwitchOnly: seriesRule.thinkingSwitchOnly,
    notes: seriesRule.notes,
    patterns: seriesRule.patterns,
  };
}

function resolveOverrideRule(
  override: ModelReasoningOverride,
  seriesMap: ReadonlyMap<string, SeriesReasoningRule>
): ModelReasoningRule {
  const baseSeries = override.series ? seriesMap.get(override.series) : undefined;
  if (override.series && !baseSeries) {
    throw new Error(
      `模型覆盖配置 "${override.model}" 引用了不存在的系列 "${override.series}"`
    );
  }

  const vendor = override.vendor ?? baseSeries?.vendor;
  const supportedEfforts = override.supportedEfforts ?? baseSeries?.supportedEfforts;
  const rawDefaultEffort = override.defaultEffort ?? baseSeries?.defaultEffort;

  if (!vendor || !supportedEfforts || !rawDefaultEffort) {
    throw new Error(
      `独立模型覆盖配置 "${override.model}" 缺少 vendor / supportedEfforts / defaultEffort`
    );
  }

  const defaultEffort = supportedEfforts.includes(rawDefaultEffort)
    ? rawDefaultEffort
    : supportedEfforts[0];

  const allowDisableReasoning =
    override.allowDisableReasoning ??
    (override.supportedEfforts !== undefined
      ? supportedEfforts.includes("none")
      : baseSeries?.allowDisableReasoning ?? supportedEfforts.includes("none"));

  return {
    vendor,
    series: baseSeries?.series ?? override.series,
    model: override.model,
    isOverride: true,
    supportedEfforts,
    defaultEffort,
    allowDisableReasoning,
    requiresAdaptiveThinking:
      override.requiresAdaptiveThinking ?? baseSeries?.requiresAdaptiveThinking,
    thinkingSwitchOnly: override.thinkingSwitchOnly ?? baseSeries?.thinkingSwitchOnly,
    notes: override.notes ?? baseSeries?.notes,
    patterns: override.patterns,
  };
}

function getRuleSpecificity(rule: ModelReasoningRule, fallbackName: string): number {
  const baseLength = normalizeModelName(fallbackName).length;
  if (!rule.patterns || rule.patterns.length === 0) {
    return baseLength;
  }
  let maxLength = baseLength;
  for (const pattern of rule.patterns) {
    if (typeof pattern === "string") {
      maxLength = Math.max(maxLength, normalizeModelName(pattern).length);
    }
  }
  return maxLength;
}

const SERIES_RULE_MAP = new Map<string, SeriesReasoningRule>(
  SERIES_REASONING_RULES.map((rule) => [rule.series, rule])
);

const RESOLVED_OVERRIDE_RULES: readonly ModelReasoningRule[] = MODEL_REASONING_OVERRIDES.map(
  (override) => resolveOverrideRule(override, SERIES_RULE_MAP)
).sort((a, b) => getRuleSpecificity(b, b.model) - getRuleSpecificity(a, a.model));

const RESOLVED_SERIES_RULES: readonly ModelReasoningRule[] = SERIES_REASONING_RULES.map(
  buildSeriesRule
).sort(
  (a, b) =>
    getRuleSpecificity(b, b.series ?? b.model) -
    getRuleSpecificity(a, a.series ?? a.model)
);

/**
 * 汇总后的模型思考强度规则表 (单模型覆盖规则优先于系列规则)
 */
export const MODEL_REASONING_RULES: readonly ModelReasoningRule[] = [
  ...RESOLVED_OVERRIDE_RULES,
  ...RESOLVED_SERIES_RULES,
];

function matchesRule(
  rule: ModelReasoningRule,
  rawModelName: string,
  normalizedModelName: string,
  defaultTargetName: string
): boolean {
  // 1. 若配置了显式 patterns，仅按显式 patterns 匹配，避免宽松前缀误触衍生/兄弟系列
  if (rule.patterns && rule.patterns.length > 0) {
    for (const pattern of rule.patterns) {
      if (typeof pattern === "string") {
        const normPattern = normalizeModelName(pattern);
        if (
          normalizedModelName === normPattern ||
          normalizedModelName.startsWith(`${normPattern}-`) ||
          normalizedModelName.startsWith(`${normPattern}_`) ||
          normalizedModelName.startsWith(`${normPattern}:`)
        ) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(rawModelName) || pattern.test(normalizedModelName)) {
          return true;
        }
      }
    }
    return false;
  }

  // 2. 未显式提供 patterns 时，基于系列名/模型名进行归一化精确或前缀匹配
  const normTarget = normalizeModelName(defaultTargetName);
  if (!normTarget) return false;

  return (
    normalizedModelName === normTarget ||
    normalizedModelName.startsWith(`${normTarget}-`) ||
    normalizedModelName.startsWith(`${normTarget}_`) ||
    normalizedModelName.startsWith(`${normTarget}:`)
  );
}

/**
 * 根据输入的模型名称寻找匹配的思考强度规则
 * 匹配优先级：具体模型覆盖 (MODEL_REASONING_OVERRIDES) > 系列规则 (SERIES_REASONING_RULES)
 * @param modelName 用户输入或接口返回的模型名称
 * @returns 匹配的规则对象，若未匹配则返回 undefined
 */
export function findModelReasoningRule(modelName?: string): ModelReasoningRule | undefined {
  if (!modelName) return undefined;
  const normalized = normalizeModelName(modelName);
  if (!normalized) return undefined;

  for (const overrideRule of RESOLVED_OVERRIDE_RULES) {
    if (matchesRule(overrideRule, modelName, normalized, overrideRule.model)) {
      return overrideRule;
    }
  }

  for (const seriesRule of RESOLVED_SERIES_RULES) {
    if (
      matchesRule(
        seriesRule,
        modelName,
        normalized,
        seriesRule.series ?? seriesRule.model
      )
    ) {
      return seriesRule;
    }
  }

  return undefined;
}

export const REASONING_EFFORT_OPTIONS = ALL_REASONING_EFFORT_OPTIONS;

/**
 * 判定模型是否仅支持 thinking.type 开关（不支持 reasoning_effort）
 */
export function isThinkingSwitchModel(modelName?: string): boolean {
  return findModelReasoningRule(modelName)?.thinkingSwitchOnly === true;
}

/**
 * 判定模型是否为 Claude 家族模型
 */
export function isClaudeFamilyModel(modelName?: string): boolean {
  if (!modelName) return false;
  const normalized = normalizeModelName(modelName);
  return normalized.includes("claude");
}

/**
 * 判定模型是否强制要求自适应思考 (即不支持 manual budget_tokens，仅支持 thinking.type: "adaptive")
 * 依据 Anthropic 官方文档：
 * - Claude 4.7, 4.8 及 5.x+ (Sonnet 5/5.5, Opus 5/5.5, Haiku 5.5, Fable, Mythos 等) 强制拒绝 type: "enabled" 并要求自适应思考；
 * - Claude 4.6 (Sonnet 4.6, Opus 4.6) 及更早模型虽然支持或部分支持自适应，但并未强制，使用 budget_tokens 仍然成功，不得强制配置 adaptive。
 */
export function isAdaptiveThinkingRequired(modelName?: string): boolean {
  if (!modelName) return false;
  const rule = findModelReasoningRule(modelName);
  if (rule?.requiresAdaptiveThinking !== undefined) {
    return rule.requiresAdaptiveThinking;
  }
  const normalized = normalizeModelName(modelName);
  if (normalized.includes("claude")) {
    // 强制要求自适应思考的模型：Claude 4.7, 4.8 以及 5 系列及更高版本
    // 排除 4.6 及更低 (4.6, 4.5, 3.7 等)
    if (
      /(?:sonnet|opus|haiku|fable|mythos)-(?:[5-9]|\d{2,}|4-[7-9])/.test(normalized) ||
      /(?:sonnet|opus|haiku|fable|mythos)-5/.test(normalized) ||
      /\b4\.[7-9]\b/.test(normalized) ||
      /\b[5-9]\.\d+\b/.test(normalized)
    ) {
      return true;
    }
  }
  return false;
}

/** 别名兼容 */
export const isAdaptiveThinkingModel = isAdaptiveThinkingRequired;

/**
 * 获取指定模型支持的思考强度档位列表
 * 若匹配到模型规则，则返回限定的思考强度数组；若未匹配，返回系统全部预设档位。
 */
export function getSupportedReasoningEfforts(
  modelName?: string
): readonly ReasoningEffortLevel[] {
  const rule = findModelReasoningRule(modelName);
  if (rule) {
    return rule.supportedEfforts;
  }
  return ALL_REASONING_EFFORT_OPTIONS.map((opt) => opt.value as ReasoningEffortLevel);
}

/**
 * 获取指定模型对应的所有可选思考强度对象列表（带中文描述与默认标识）
 */
export function getReasoningOptionsForModel(
  modelName?: string
): ReasoningEffortOptionItem[] {
  const rule = findModelReasoningRule(modelName);
  const defaultEffort = rule ? rule.defaultEffort : "high";

  if (rule) {
    return rule.supportedEfforts.map((effort) => {
      const match = ALL_REASONING_EFFORT_OPTIONS.find((opt) => opt.value === effort);
      return {
        label: effort,
        value: effort,
        description: match?.description || effort,
        isDefault: effort === defaultEffort,
      };
    });
  }

  return ALL_REASONING_EFFORT_OPTIONS.map((opt) => ({
    label: opt.label,
    value: opt.value as ReasoningEffortLevel,
    description: opt.description,
    isDefault: opt.value === defaultEffort,
  }));
}

/**
 * 校验并修正当前思考强度
 * 若当前值不被指定模型支持，则平滑修正为该模型的默认值
 */
export function resolveValidReasoningEffort(
  modelName?: string,
  currentEffort?: string
): ReasoningEffortLevel {
  const rule = findModelReasoningRule(modelName);
  const supported = getSupportedReasoningEfforts(modelName);

  if (currentEffort && supported.includes(currentEffort as ReasoningEffortLevel)) {
    return currentEffort as ReasoningEffortLevel;
  }

  if (rule) {
    return rule.defaultEffort;
  }

  // 默认回退到 high
  return "high";
}
