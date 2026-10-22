export type ActiveTestMode = "probe" | "pelican" | "connection";
export type HistoryTab = ActiveTestMode;
export type ConnectionTestMode = "chat" | "quick";

export interface ClientConfig {
  baseUrl: string;
  apiKey: string;
  apiFormat: string;
  modelName: string;
  reasoningEffort: string;
  stream?: boolean;
}

export interface ConfigItem {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiFormat?: string;
  modelName?: string;
  reasoningEffort?: string;
  stream?: boolean;
  createdAt?: number;
  updatedAt?: number;
}


export interface SendProbeOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  apiFormat: string;
  reasoningEffort?: string;
  stream?: boolean;
  timeoutSeconds?: number;
  signal?: AbortSignal;
  onStreamStart?: () => void;
  /** 流式输出过程中回调当前累计的模型文本 */
  onStreamProgress?: (text: string) => void;
}

export interface ProbeResponse {
  text: string;
  raw_status: number;
  duration_ms: number;
}

export type TauriInvokeFn = <T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
) => Promise<T>;

export type StepStatus = "pending" | "working" | "done" | "error" | "cancelled";

export interface ProbeStepItem {
  id: number;
  state: StepStatus;
  stateText: string;
  statText: string;
  prompt?: string;
  answer?: string;
  expectedCount?: number;
  parsedNumbers?: number[];
  error?: string;
}

export interface StatusAlertInfo {
  message: string;
  type: "error" | "warning";
}

export interface PelicanHistoryItem {
  id: string;
  createdAt: number;
  configName?: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  reasoningEffort: string;
  contentType: "svg" | "html";
  content: string;
  durationMs?: number;
  prompt?: string;
}

export interface ProbeHistoryCandidate {
  model: string;
  displayName: string;
  probability: number;
  familyName: string;
}

export interface ProbeHistoryItem {
  id: string;
  createdAt: number;
  configName?: string;
  baseUrl: string;
  apiKey: string; // 存储时已脱敏
  modelName: string;
  reasoningEffort: string;
  prediction: string;
  predictionName: string;
  probability: number;
  familyPredictionName: string;
  familyProbability: number;
  usedOutputs: number;
  candidates: ProbeHistoryCandidate[];
  fullAnalysis?: unknown;
}

export interface ChatUsageMeta {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
}

export interface ChatMessageImage {
  mimeType: string;
  data: string;
}

export interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
  images?: ChatMessageImage[];
}

export interface SendChatOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatRequestMessage[];
  apiFormat: string;
  reasoningEffort?: string;
  stream?: boolean;
  timeoutSeconds?: number;
  signal?: AbortSignal;
  onStreamStart?: () => void;
  /** 流式输出过程中回调当前累计的模型文本 */
  onStreamProgress?: (text: string) => void;
  /** 上游首次返回实际模型名称时触发 */
  onResponseModel?: (model: string) => void;
}

export interface SendChatResult {
  text: string;
  responseModel?: string;
  usage: ChatUsageMeta;
  rawStatus: number;
  durationMs: number;
  firstTokenMs?: number;
}

export interface ConnectionImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  /** base64 数据（不含 data URL 前缀） */
  data: string;
  size: number;
  previewUrl: string;
}

export interface ConnectionChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images: ConnectionImageAttachment[];
  createdAt: number;
  streaming?: boolean;
  stopped?: boolean;
  error?: string;
  requestedModel?: string;
  responseModel?: string;
  durationMs?: number;
  firstTokenMs?: number;
  usage?: ChatUsageMeta;
}

export interface ConnectionModelCount {
  model: string;
  count: number;
}

export interface ConnectionSessionStats {
  requestCount: number;
  successCount: number;
  errorCount: number;
  stoppedCount: number;
  successRate: number | null;
  mismatchCount: number;
  requestModelStats: ConnectionModelCount[];
  responseModelStats: ConnectionModelCount[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  totalDurationMs: number;
  outputSpeed: number | null;
  cacheRate: number | null;
  avgFirstTokenMs: number | null;
  usageEstimated: boolean;
}

export interface ConnectionHistoryItem {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  mode?: ConnectionTestMode;
  configName?: string;
  baseUrl: string;
  apiKey: string; // 存储时已脱敏
  apiFormat: string;
  stream: boolean;
  userMessageCount: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
  stoppedCount?: number;
  successRate?: number;
  mismatchCount: number;
  requestModelStats: ConnectionModelCount[];
  responseModelStats: ConnectionModelCount[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  totalDurationMs: number;
  avgFirstTokenMs?: number;
  outputSpeed?: number;
  cacheRate?: number;
  usageEstimated: boolean;
  lastRequestedModel?: string;
  lastResponseModel?: string;
  lastError?: string;
}
