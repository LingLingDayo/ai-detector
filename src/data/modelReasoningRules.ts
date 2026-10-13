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
  { label: "ultra", value: "ultra", description: "极致思考" },
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
  | "max"
  | "ultra";

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
    supportedEfforts: ["none", "low", "medium", "high", "xhigh", "max", "ultra"],
    defaultEffort: "medium",
    allowDisableReasoning: true,
    notes: "多Agent并行模式（独立于effort）",
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
    notes: "强制思考",
  },
  {
    vendor: "Zhipu GLM-5.3",
    model: "GLM-5.3-FLASH",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
    allowDisableReasoning: false,
    notes: "强制思考",
  },

  // ==================== Moonshot Kimi ====================
  {
    vendor: "Moonshot Kimi",
    model: "Kimi K3",
    supportedEfforts: ["low", "high", "max"],
    defaultEffort: "max",
    allowDisableReasoning: false,
    notes: "强制思考",
  },

  // ==================== DeepSeek ====================
  {
    vendor: "DeepSeek",
    model: "DeepSeek-V4-Pro",
    supportedEfforts: ["none", "low", "high", "max"],
    defaultEffort: "high",
    allowDisableReasoning: true,
  },
  {
    vendor: "DeepSeek",
    model: "DeepSeek-V4.1-Flash",
    supportedEfforts: ["none", "low", "high", "max"],
    defaultEffort: "high",
    allowDisableReasoning: true,
    notes: "官方别名 deepseek-flash",
    patterns: ["deepseek-flash"],
  },

  // ==================== xAI Grok ====================
  {
    vendor: "xAI Grok",
    model: "Grok-4.6",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
    allowDisableReasoning: false,
  },
  {
    vendor: "xAI Grok",
    model: "Grok-4.7",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
    allowDisableReasoning: false,
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

  // 保证按照预设顺序或规则指定顺序输出
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
