/**
 * 系统预设的全部思考强度档位信息
 */
export const ALL_REASONING_EFFORT_OPTIONS = [
  { label: "none", value: "none", description: "关闭思考" },
  { label: "minimal", value: "minimal", description: "极低思考" },
  { label: "low", value: "low", description: "轻度思考" },
  { label: "medium", value: "medium", description: "中度思考" },
  { label: "high", value: "high", description: "深度思考" },
  { label: "xhigh", value: "xhigh", description: "极高思考" },
  { label: "max", value: "max", description: "最高思考" },
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
 * 模型思考强度限定配置规则
 */
export interface ModelReasoningRule {
  /** 厂商 / 系列 */
  vendor: string;
  /** 模型标准名称 (如 GPT-5.6 Sol) */
  model: string;
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
  /**
   * 显式匹配标识或正则模式 (可选)。
   * 若未提供，将基于模型标准名称进行智能归一化匹配。
   */
  patterns?: readonly (string | RegExp)[];
}

/**
 * 各厂商与系列模型的思考强度限定规则配置表
 * 后续修改现有模型或新增模型时，只需在此配置表中直接增改条目即可。
 */
export const MODEL_REASONING_RULES: readonly ModelReasoningRule[] = [
  // ==================== OpenAI GPT-5.6 ====================
  {
    vendor: "OpenAI GPT-5.6",
    model: "GPT-5.6 Sol",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
    allowDisableReasoning: true,
  },
  {
    vendor: "OpenAI GPT-5.6",
    model: "GPT-5.6 Terra",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
    allowDisableReasoning: true,
  },
  {
    vendor: "OpenAI GPT-5.6",
    model: "GPT-5.6 Luna",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
    allowDisableReasoning: true,
  },

  // ==================== OpenAI GPT-6 ====================
  {
    vendor: "OpenAI GPT-6",
    model: "GPT-6 Astra",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
    allowDisableReasoning: false,
  },
  {
    vendor: "OpenAI GPT-6",
    model: "GPT-6 Sol",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
    allowDisableReasoning: true,
  },
  {
    vendor: "OpenAI GPT-6",
    model: "GPT-6 Luna",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
    allowDisableReasoning: true,
  },

  // ==================== OpenAI GPT-6.1 ====================
  {
    vendor: "OpenAI GPT-6.1",
    model: "GPT-6.1 Sol",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
    allowDisableReasoning: false,
  },

  // ==================== Zhipu GLM-5.3 ====================
  {
    vendor: "Zhipu GLM-5.3",
    model: "GLM-5.3",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
    allowDisableReasoning: false,
  },
  {
    vendor: "Zhipu GLM-5.3",
    model: "GLM-5.3 Flash",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
    allowDisableReasoning: false,
    patterns: ["glm-5.3-flash"],
  },
  {
    vendor: "Zhipu GLM-5.3",
    model: "GLM-5.3 FlashX",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
    allowDisableReasoning: false,
    patterns: ["glm-5.3-flashx"],
  },

  // ==================== Moonshot Kimi ====================
  {
    vendor: "Moonshot Kimi",
    model: "Kimi K3.1 Pro",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
    allowDisableReasoning: false,
    patterns: ["kimi-k3.1-pro", "kimi-k3.1"],
  },
  {
    vendor: "Moonshot Kimi",
    model: "Kimi K3",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
    allowDisableReasoning: false,
  },
  {
    vendor: "Moonshot Kimi",
    model: "Kimi K2.8 Preview",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
    allowDisableReasoning: false,
    patterns: ["kimi-k2.8-preview", "kimi-k2.8"],
  },

  // ==================== Alibaba Qwen ====================
  {
    vendor: "Alibaba Qwen",
    model: "Qwen3.8 Max",
    supportedEfforts: ["none", "low", "medium", "xhigh"],
    defaultEffort: "xhigh",
    allowDisableReasoning: true,
    patterns: ["qwen3.8-max"],
  },
  {
    vendor: "Alibaba Qwen",
    model: "Qwen3.8 Flash",
    supportedEfforts: ["none", "low", "medium", "xhigh"],
    defaultEffort: "xhigh",
    allowDisableReasoning: true,
    patterns: ["qwen3.8-flash"],
  },

  // ==================== Xiaomi MiMo ====================
  {
    vendor: "Xiaomi MiMo",
    model: "MiMo V2.6 Pro",
    supportedEfforts: ["none", "high"],
    defaultEffort: "high",
    allowDisableReasoning: true,
    thinkingSwitchOnly: true,
    notes: "仅支持 thinking 开关，high 表示开启思考",
    patterns: ["mimo-v2.6-pro"],
  },
  {
    vendor: "Xiaomi MiMo",
    model: "MiMo V2.6 Flash",
    supportedEfforts: ["none", "high"],
    defaultEffort: "high",
    allowDisableReasoning: true,
    thinkingSwitchOnly: true,
    notes: "仅支持 thinking 开关，high 表示开启思考",
    patterns: ["mimo-v2.6-flash"],
  },
  {
    vendor: "Xiaomi MiMo",
    model: "MiMo V2.6 Pro-UltraSpeed",
    supportedEfforts: ["none", "high"],
    defaultEffort: "high",
    allowDisableReasoning: true,
    thinkingSwitchOnly: true,
    notes: "仅支持 thinking 开关，high 表示开启思考",
    patterns: ["mimo-v2.6-pro-ultraspeed"],
  },

  // ==================== DeepSeek ====================
  {
    vendor: "DeepSeek",
    model: "DeepSeek V4 Pro",
    supportedEfforts: ["none", "low", "high", "max"],
    defaultEffort: "high",
    allowDisableReasoning: true,
    patterns: ["deepseek-v4-pro", "deepseek-v4-pro-0813"],
  },
  {
    vendor: "DeepSeek",
    model: "DeepSeek V4.1 Flash",
    supportedEfforts: ["none", "low", "high", "max"],
    defaultEffort: "high",
    allowDisableReasoning: true,
    notes: "官方别名 deepseek-flash",
    patterns: ["deepseek-v4.1-flash", "deepseek-flash"],
  },

  // ==================== xAI Grok ====================
  {
    vendor: "xAI Grok",
    model: "Grok 4.6",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
    allowDisableReasoning: false,
    patterns: ["grok-4.6"],
  },
  {
    vendor: "xAI Grok",
    model: "Grok 4.7",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
    allowDisableReasoning: false,
    patterns: ["grok-4.7"],
  },

  // ==================== Anthropic Claude ====================
  {
    vendor: "Anthropic Claude",
    model: "Claude 5 Sonnet",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "high",
    allowDisableReasoning: true,
    requiresAdaptiveThinking: true,
    patterns: ["claude-sonnet-5", "claude-5-sonnet"],
  },
  {
    vendor: "Anthropic Claude",
    model: "Claude 5.5 Sonnet",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "high",
    allowDisableReasoning: false,
    requiresAdaptiveThinking: true,
    patterns: ["claude-sonnet-5-5", "claude-5.5-sonnet"],
  },
  {
    vendor: "Anthropic Claude",
    model: "Claude 5 Opus",
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "high",
    allowDisableReasoning: true,
    requiresAdaptiveThinking: true,
    patterns: ["claude-opus-5", "claude-5-opus"],
  },
  {
    vendor: "Anthropic Claude",
    model: "Claude 5.5 Opus",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
    allowDisableReasoning: false,
    requiresAdaptiveThinking: true,
    patterns: ["claude-opus-5-5", "claude-5.5-opus"],
  },

  // ==================== Google Gemini ====================
  {
    vendor: "Google Gemini",
    model: "Gemini 4 Argon",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
    allowDisableReasoning: false,
    patterns: ["gemini-4-argon"],
  },
  {
    vendor: "Google Gemini",
    model: "Gemini 3.8 Flash",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
    allowDisableReasoning: false,
    patterns: ["gemini-3.8-flash"],
  },
  {
    vendor: "Google Gemini",
    model: "Gemini 3.7 Flash",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
    allowDisableReasoning: false,
    patterns: ["gemini-3.7-flash"],
  },
  {
    vendor: "Google Gemini",
    model: "Gemini 3.6 Flash",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
    allowDisableReasoning: false,
    patterns: ["gemini-3.6-flash"],
  },
  {
    vendor: "Google Gemini",
    model: "Gemini 3.1 Pro",
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
    allowDisableReasoning: false,
    patterns: ["gemini-3.1-pro", "gemini-3.1-pro-preview"],
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

/**
 * 预处理：按规范化名称长度降序排列规则，确保更具体长词 (如 GLM-5.3-FLASH) 优先于短词 (GLM-5.3) 匹配
 */
const SORTED_RULES = [...MODEL_REASONING_RULES].sort((a, b) => {
  return normalizeModelName(b.model).length - normalizeModelName(a.model).length;
});

/**
 * 根据输入的模型名称寻找匹配的思考强度规则
 * @param modelName 用户输入或接口返回的模型名称
 * @returns 匹配的规则对象，若未匹配则返回 undefined
 */
export function findModelReasoningRule(modelName?: string): ModelReasoningRule | undefined {
  if (!modelName) return undefined;
  const normalized = normalizeModelName(modelName);
  if (!normalized) return undefined;

  for (const rule of SORTED_RULES) {
    // 1. 若配置了显式 patterns 规则，优先判定
    if (rule.patterns && rule.patterns.length > 0) {
      for (const pattern of rule.patterns) {
        if (typeof pattern === "string") {
          const normPattern = normalizeModelName(pattern);
          if (
            normalized === normPattern ||
            normalized.startsWith(`${normPattern}-`) ||
            normalized.startsWith(`${normPattern}:`)
          ) {
            return rule;
          }
        } else if (pattern instanceof RegExp) {
          if (pattern.test(modelName) || pattern.test(normalized)) {
            return rule;
          }
        }
      }
    }

    // 2. 默认智能匹配规则模型名
    const normRuleModel = normalizeModelName(rule.model);

    // 精确相等
    if (normalized === normRuleModel) {
      return rule;
    }

    // 前缀匹配 (带有子版本后缀或分支标签，如 gpt-5.6-sol-preview, kimi-k3-chat)
    if (
      normalized.startsWith(`${normRuleModel}-`) ||
      normalized.startsWith(`${normRuleModel}_`) ||
      normalized.startsWith(`${normRuleModel}:`)
    ) {
      return rule;
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
