export interface ClientConfig {
  baseUrl: string;
  apiKey: string;
  apiFormat: string;
  modelName: string;
  temperature: string;
  timeout: string;
}

export interface SendProbeOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  apiFormat: string;
  temperature: number | null;
  timeoutSeconds: number;
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
