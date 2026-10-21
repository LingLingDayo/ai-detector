import type {
  ChatRequestMessage,
  ChatUsageMeta,
  SendChatOptions,
  SendChatResult,
} from "../types";
import {
  isAdaptiveThinkingRequired,
  isThinkingSwitchModel,
} from "../data/modelReasoningRules";
import {
  getTauriInvoke,
  isTauriApp,
  resolveApiEndpoint,
} from "./api";
import {
  parseChatNonStreamingJson,
  parseChatStreamingBody,
  type ChatResponseState,
} from "./chatParsing";

export const CONNECTION_STREAM_START_EVENT = "connection-stream-start";
export const CONNECTION_STREAM_PROGRESS_EVENT = "connection-stream-progress";

const MAX_OUTPUT_TOKENS = 8192;

interface ChatStreamStartPayload {
  requestId: string;
}

interface ChatStreamProgressPayload {
  requestId: string;
  text: string;
  responseModel?: string;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function mergeAdjacentMessages(messages: ChatRequestMessage[]): ChatRequestMessage[] {
  const merged: ChatRequestMessage[] = [];
  for (const message of messages) {
    if (message.role === "assistant" && !message.content.trim()) continue;
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      merged[merged.length - 1] = {
        role: previous.role,
        content: [previous.content, message.content].filter((item) => item.trim()).join("\n\n"),
        images: [...(previous.images ?? []), ...(message.images ?? [])],
      };
      continue;
    }
    merged.push({
      role: message.role,
      content: message.content,
      images: message.images ? [...message.images] : undefined,
    });
  }
  return merged;
}

function buildChatContent(message: ChatRequestMessage): unknown {
  const images = message.images ?? [];
  if (images.length === 0) return message.content;
  const parts: Array<Record<string, unknown>> = [];
  if (message.content.trim()) {
    parts.push({ type: "text", text: message.content });
  }
  for (const image of images) {
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${image.data}`,
      },
    });
  }
  return parts;
}

function buildAnthropicContent(message: ChatRequestMessage): unknown {
  const images = message.images ?? [];
  if (images.length === 0) return message.content;
  const parts: Array<Record<string, unknown>> = images.map((image) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: image.mimeType,
      data: image.data,
    },
  }));
  if (message.content.trim()) {
    parts.push({ type: "text", text: message.content });
  }
  return parts;
}

function buildResponsesContent(message: ChatRequestMessage): unknown {
  const images = message.images ?? [];
  if (images.length === 0) {
    return message.content;
  }
  const parts: Array<Record<string, unknown>> = [];
  if (message.content.trim()) {
    parts.push({ type: "input_text", text: message.content });
  }
  for (const image of images) {
    parts.push({
      type: "input_image",
      image_url: `data:${image.mimeType};base64,${image.data}`,
    });
  }
  return parts;
}

function buildReasoningParams(
  body: Record<string, unknown>,
  model: string,
  apiFormat: string,
  reasoningEffort?: string
): void {
  const effort = reasoningEffort?.trim();
  if (!effort || effort === "none") return;

  if (apiFormat === "anthropic") {
    if (isAdaptiveThinkingRequired(model)) {
      body.thinking = { type: "adaptive" };
      body.output_config = { effort };
      body.max_tokens = Math.max(MAX_OUTPUT_TOKENS, 16384);
      return;
    }
    const budgetMap: Record<string, number> = {
      minimal: 1024,
      low: 2048,
      medium: 4096,
      high: 8192,
      xhigh: 16384,
      max: 32768,
    };
    const budget = budgetMap[effort] || 8192;
    body.thinking = { type: "enabled", budget_tokens: budget };
    body.max_tokens = Math.max(MAX_OUTPUT_TOKENS, budget + 2048);
    return;
  }

  if (apiFormat === "responses" || apiFormat === "openai_responses") {
    body.reasoning = { effort };
    return;
  }

  if (isThinkingSwitchModel(model)) {
    body.thinking = { type: "enabled" };
    return;
  }

  if (/^\d+$/.test(effort)) {
    delete body.max_tokens;
    body.max_completion_tokens = Number.parseInt(effort, 10);
    return;
  }
  body.reasoning_effort = effort;
}

export function buildChatRequestBody(
  options: SendChatOptions,
  isStream: boolean
): Record<string, unknown> {
  const { model, apiFormat, reasoningEffort } = options;
  const messages = mergeAdjacentMessages(options.messages);
  let body: Record<string, unknown>;

  if (apiFormat === "anthropic") {
    body = {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: messages.map((message) => ({
        role: message.role,
        content: buildAnthropicContent(message),
      })),
      ...(isStream ? { stream: true } : {}),
    };
    buildReasoningParams(body, model, apiFormat, reasoningEffort);
    return body;
  }

  if (apiFormat === "responses" || apiFormat === "openai_responses") {
    body = {
      model,
      input: messages.map((message) => ({
        type: "message",
        role: message.role,
        content: buildResponsesContent(message),
      })),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      ...(isStream ? { stream: true } : {}),
    };
    buildReasoningParams(body, model, apiFormat, reasoningEffort);
    return body;
  }

  const normalizedModel = model.trim().toLowerCase();
  const isOSeries =
    normalizedModel.startsWith("o1") ||
    normalizedModel.startsWith("o3") ||
    normalizedModel.startsWith("o4");
  const isThinkingSwitch = isThinkingSwitchModel(model);

  body = {
    model,
    messages: messages.map((message) => ({
      role: message.role,
      content: buildChatContent(message),
    })),
    ...(isStream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
  if (isOSeries || isThinkingSwitch) {
    body.max_completion_tokens = MAX_OUTPUT_TOKENS;
  } else {
    body.max_tokens = MAX_OUTPUT_TOKENS;
  }
  if (isThinkingSwitch) {
    body.thinking = {
      type: reasoningEffort?.trim() === "none" ? "disabled" : "enabled",
    };
    return body;
  }
  buildReasoningParams(body, model, apiFormat, reasoningEffort);
  return body;
}

function buildHeaders(apiKey: string, apiFormat: string, isStream: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: isStream ? "text/event-stream, application/json" : "application/json",
  };
  if (apiFormat === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

async function sendChatViaTauri(
  options: SendChatOptions,
  isStream: boolean,
  timeoutSeconds: number
): Promise<SendChatResult> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    throw new Error("Tauri 接口未初始化");
  }

  const requestId = createRequestId();
  let unlistenStart: (() => void) | null = null;
  let unlistenProgress: (() => void) | null = null;

  if (isStream) {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenStart = await listen<ChatStreamStartPayload>(
        CONNECTION_STREAM_START_EVENT,
        (event) => {
          if (event.payload?.requestId === requestId) {
            options.onStreamStart?.();
          }
        }
      );
      unlistenProgress = await listen<ChatStreamProgressPayload>(
        CONNECTION_STREAM_PROGRESS_EVENT,
        (event) => {
          const payload = event.payload;
          if (!payload || payload.requestId !== requestId) return;
          if (payload.text) {
            options.onStreamProgress?.(payload.text);
          }
          if (payload.responseModel) {
            options.onResponseModel?.(payload.responseModel);
          }
        }
      );
    } catch (err) {
      console.warn("监听连接测试流式事件失败:", err);
    }
  }

  if (options.signal?.aborted) {
    unlistenStart?.();
    unlistenProgress?.();
    throw new DOMException("The user aborted a request.", "AbortError");
  }

  const invokePromise = invoke<SendChatResult>("send_chat_request", {
    req: {
      request_id: requestId,
      base_url: options.baseUrl,
      api_key: options.apiKey,
      model: options.model,
      messages: mergeAdjacentMessages(options.messages).map((message) => ({
        role: message.role,
        content: message.content,
        images: (message.images ?? []).map((image) => ({
          mime_type: image.mimeType,
          data: image.data,
        })),
      })),
      api_format: options.apiFormat,
      reasoning_effort: options.reasoningEffort,
      stream: isStream,
      timeout_seconds: timeoutSeconds,
    },
  });

  const abortPromise = new Promise<never>((_resolve, reject) => {
    options.signal?.addEventListener(
      "abort",
      () => reject(new DOMException("The user aborted a request.", "AbortError")),
      { once: true }
    );
  });

  try {
    const result = await Promise.race([invokePromise, abortPromise]);

    if (result.responseModel) {
      options.onResponseModel?.(result.responseModel);
    }
    if (result.text) {
      options.onStreamProgress?.(result.text);
    }
    return {
      ...result,
      usage: result.usage ?? {},
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      await invoke("cancel_chat_request", { requestId }).catch(() => undefined);
    }
    throw err;
  } finally {
    unlistenStart?.();
    unlistenProgress?.();
  }
}

export async function cancelChatRequest(requestId: string): Promise<void> {
  if (!isTauriApp()) return;
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke("cancel_chat_request", { requestId });
  } catch (err) {
    console.warn("取消连接测试请求失败:", err);
  }
}

async function sendChatViaWeb(
  options: SendChatOptions,
  isStream: boolean,
  timeoutSeconds: number
): Promise<SendChatResult> {
  const endpoint = resolveApiEndpoint(options.baseUrl, options.apiFormat);
  const startTime = Date.now();
  const body = buildChatRequestBody(options, isStream);
  const controller = new AbortController();

  if (options.signal) {
    if (options.signal.aborted) {
      throw new DOMException("The user aborted a request.", "AbortError");
    }
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let responseReceived = false;
  const timeoutTimer = setTimeout(() => {
    if (!responseReceived) {
      controller.abort(
        new Error(
          isStream
            ? `流式请求首次响应超时（${timeoutSeconds} 秒内未收到上游响应）`
            : `同步请求超时（${timeoutSeconds} 秒内未收到上游响应）`
        )
      );
    }
  }, timeoutSeconds * 1000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(options.apiKey, options.apiFormat, isStream),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `上游接口返回错误 (HTTP ${response.status}): ${errorText.slice(0, 300)}`
      );
    }

    responseReceived = true;
    clearTimeout(timeoutTimer);

    if (!isStream || !response.body) {
      const json = await response.json();
      const state = parseChatNonStreamingJson(json, options.apiFormat);
      if (state.responseModel) options.onResponseModel?.(state.responseModel);
      return {
        text: state.text,
        responseModel: state.responseModel,
        usage: state.usage,
        rawStatus: response.status,
        durationMs: Date.now() - startTime,
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastEmittedText = "";
    let lastEmittedModel = "";
    let lastProgressAt = 0;
    let firstTokenMs: number | undefined;
    let streamStarted = false;

    const emitProgress = (force = false): void => {
      let state: ChatResponseState;
      try {
        state = parseChatStreamingBody(buffer, options.apiFormat);
      } catch {
        return;
      }
      if (!firstTokenMs && state.text) {
        firstTokenMs = Date.now() - startTime;
      }
      if (state.responseModel && state.responseModel !== lastEmittedModel) {
        lastEmittedModel = state.responseModel;
        options.onResponseModel?.(state.responseModel);
      }
      const now = Date.now();
      if (!force && now - lastProgressAt < 80) return;
      lastProgressAt = now;
      if (state.text && state.text !== lastEmittedText) {
        lastEmittedText = state.text;
        options.onStreamProgress?.(state.text);
      }
    };

    const firstChunk = await reader.read();
    if (firstChunk.value) {
      if (!streamStarted) {
        streamStarted = true;
        options.onStreamStart?.();
      }
      buffer += decoder.decode(firstChunk.value, { stream: true });
      emitProgress(true);
    }

    while (!firstChunk.done) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        emitProgress();
      }
    }
    buffer += decoder.decode();
    emitProgress(true);

    const finalState = parseChatStreamingBody(buffer, options.apiFormat);
    if (finalState.responseModel) {
      options.onResponseModel?.(finalState.responseModel);
    }
    if (finalState.text && finalState.text !== lastEmittedText) {
      options.onStreamProgress?.(finalState.text);
    }

    return {
      text: finalState.text,
      responseModel: finalState.responseModel,
      usage: finalState.usage,
      rawStatus: response.status,
      durationMs: Date.now() - startTime,
      firstTokenMs,
    };
  } catch (err) {
    if (controller.signal.aborted && !options.signal?.aborted) {
      const reason = controller.signal.reason;
      if (reason instanceof Error) throw reason;
      throw new Error(
        isStream
          ? `流式请求首次响应超时（${timeoutSeconds} 秒内未收到上游响应）`
          : `同步请求超时（${timeoutSeconds} 秒内未收到上游响应）`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutTimer);
  }
}

export async function sendChat(options: SendChatOptions): Promise<SendChatResult> {
  const isStream = options.stream !== false;
  const timeoutSeconds = options.timeoutSeconds ?? (isStream ? 90 : 240);

  if (isTauriApp() && getTauriInvoke()) {
    const result = await sendChatViaTauri(options, isStream, timeoutSeconds);
    return result;
  }

  return sendChatViaWeb(options, isStream, timeoutSeconds);
}

export type { ChatUsageMeta };
