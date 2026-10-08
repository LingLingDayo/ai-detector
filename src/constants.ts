export const STORAGE_KEY = "modeltrace_client_config";
export const CONFIG_LIST_STORAGE_KEY = "modeltrace_config_list";
export const ACTIVE_CONFIG_ID_KEY = "modeltrace_active_config_id";


export const REASONING_EFFORT_OPTIONS = [
  { label: "none", value: "none", description: "关闭思考" },
  { label: "minimal", value: "minimal", description: "极低思考" },
  { label: "low", value: "low", description: "轻度思考" },
  { label: "medium", value: "medium", description: "中度思考" },
  { label: "high", value: "high", description: "深度思考" },
  { label: "xhigh", value: "xhigh", description: "极高思考" },
  { label: "max", value: "max", description: "极限思考" },
  { label: "ultra", value: "ultra", description: "极致思考" },
] as const;
