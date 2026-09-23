export interface ClientConfig {
  baseUrl: string;
  apiKey: string;
  apiFormat: string;
  modelName: string;
  reasoningEffort: string;
}

export interface SendProbeOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  apiFormat: string;
  reasoningEffort?: string;
  timeoutSeconds?: number;
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

export type StepStatus = "pending" | "working" | "done" | "error";

export interface ProbeStepItem {
  id: number;
  state: StepStatus;
  stateText: string;
  statText: string;
}

export interface StatusAlertInfo {
  message: string;
  type: "error" | "warning";
}
