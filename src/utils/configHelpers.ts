import type { ClientConfig, ConfigItem } from "../types";

/**
 * 生成配置项的唯一 ID
 */
export function generateConfigId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 判断两个配置凭据（Base URL 与 API Key）是否属于同一身份
 */
export function isSameConfigIdentity(
  urlA: string | undefined,
  keyA: string | undefined,
  urlB: string | undefined,
  keyB: string | undefined
): boolean {
  const normUrlA = (urlA || "").trim();
  const normKeyA = (keyA || "").trim();
  const normUrlB = (urlB || "").trim();
  const normKeyB = (keyB || "").trim();
  return Boolean(normUrlA && normKeyA && normUrlA === normUrlB && normKeyA === normKeyB);
}

/**
 * 严格比对两个配置项的所有字段是否完全等价
 */
export function isConfigEqual(current: ClientConfig, item: ConfigItem): boolean {
  const normCurrentBaseUrl = (current.baseUrl || "").trim();
  const normItemBaseUrl = (item.baseUrl || "").trim();
  const normCurrentApiKey = (current.apiKey || "").trim();
  const normItemApiKey = (item.apiKey || "").trim();
  const normCurrentModel = (current.modelName || "").trim();
  const normItemModel = (item.modelName || "").trim();
  const normCurrentFormat = current.apiFormat || "chat_completions";
  const normItemFormat = item.apiFormat || "chat_completions";
  const normCurrentEffort = current.reasoningEffort || "high";
  const normItemEffort = item.reasoningEffort || "high";
  const normCurrentStream = current.stream !== false;
  const normItemStream = item.stream !== false;

  return (
    normCurrentBaseUrl === normItemBaseUrl &&
    normCurrentApiKey === normItemApiKey &&
    normCurrentModel === normItemModel &&
    normCurrentFormat === normItemFormat &&
    normCurrentEffort === normItemEffort &&
    normCurrentStream === normItemStream
  );
}

/**
 * 格式化高级参数的展示文案（接口协议、传输模式）
 */
export function formatSettingsSummary(config: ClientConfig): string {
  let formatName = "/v1/chat/completions";
  if (config.apiFormat === "responses") {
    formatName = "/v1/responses";
  } else if (config.apiFormat === "anthropic") {
    formatName = "/v1/messages";
  }

  const streamLabel = config.stream !== false ? "流式" : "同步";

  return `${formatName} · ${streamLabel}`;
}
