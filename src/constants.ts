import pkg from "../package.json" with { type: "json" };

export const APP_VERSION = `v${pkg.version}`;
export const GITHUB_REPO_URL = "https://github.com/LingLingDayo/ai-detector";
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;

export const STORAGE_KEY = "modeltrace_client_config";
export const CONFIG_LIST_STORAGE_KEY = "modeltrace_config_list";
export const CONFIG_GROUPS_STORAGE_KEY = "modeltrace_config_groups";
export const ACTIVE_CONFIG_ID_KEY = "modeltrace_active_config_id";
export const PELICAN_PROMPT_STORAGE_KEY = "modeltrace_pelican_prompt";
export const PELICAN_CUSTOM_PROMPT_STORAGE_KEY = "modeltrace_pelican_custom_prompt";
export const PELICAN_HISTORY_STORAGE_KEY = "modeltrace_pelican_history";
export const PROBE_HISTORY_STORAGE_KEY = "modeltrace_probe_history";
export const CANDY_HISTORY_STORAGE_KEY = "modeltrace_candy_history";
export const CONNECTION_HISTORY_STORAGE_KEY = "modeltrace_connection_history";
export const CONNECTION_MODE_STORAGE_KEY = "modeltrace_connection_mode";
export const UPDATE_LAST_CHECK_STORAGE_KEY = "modeltrace_update_last_check";
export const UPDATE_SKIPPED_VERSION_STORAGE_KEY = "modeltrace_update_skipped_version";
export {
  FINGERPRINT_UPDATE_AVAILABLE_KEY,
  CUSTOM_UNIFIED_BANK_KEY,
} from "./services/fingerprintSync";

export const DEFAULT_REQUEST_RETRY_COUNT = 3;
export const DEFAULT_REQUEST_RETRY_DELAY_MS = 5000;

export {
  ALL_REASONING_EFFORT_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  MODEL_REASONING_RULES,
  SERIES_REASONING_RULES,
  MODEL_REASONING_OVERRIDES,
  findModelReasoningRule,
  getSupportedReasoningEfforts,
  getReasoningOptionsForModel,
  resolveValidReasoningEffort,
  isAdaptiveThinkingRequired,
  isAdaptiveThinkingModel,
  isClaudeFamilyModel,
  isThinkingSwitchModel,
} from "./data/modelReasoningRules";
export type {
  ReasoningEffortLevel,
  ModelReasoningRule,
  SeriesReasoningRule,
  ModelReasoningOverride,
  ReasoningEffortOptionItem,
} from "./data/modelReasoningRules";