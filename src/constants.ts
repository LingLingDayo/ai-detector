import pkg from "../package.json" with { type: "json" };

export const APP_VERSION = `v${pkg.version}`;
export const GITHUB_REPO_URL = "https://github.com/LingLingDayo/ai-detector";

export const STORAGE_KEY = "modeltrace_client_config";
export const CONFIG_LIST_STORAGE_KEY = "modeltrace_config_list";
export const ACTIVE_CONFIG_ID_KEY = "modeltrace_active_config_id";
export const PELICAN_PROMPT_STORAGE_KEY = "modeltrace_pelican_prompt";
export const PELICAN_HISTORY_STORAGE_KEY = "modeltrace_pelican_history";
export const PROBE_HISTORY_STORAGE_KEY = "modeltrace_probe_history";

export const DEFAULT_REQUEST_RETRY_COUNT = 3;
export const DEFAULT_REQUEST_RETRY_DELAY_MS = 5000;

export {
  ALL_REASONING_EFFORT_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  MODEL_REASONING_RULES,
  findModelReasoningRule,
  getSupportedReasoningEfforts,
  getReasoningOptionsForModel,
  resolveValidReasoningEffort,
  isAdaptiveThinkingModel,
  isClaudeFamilyModel,
} from "./data/modelReasoningRules";
export type {
  ReasoningEffortLevel,
  ModelReasoningRule,
  ReasoningEffortOptionItem,
} from "./data/modelReasoningRules";