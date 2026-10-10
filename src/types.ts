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
