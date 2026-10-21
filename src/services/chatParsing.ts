import type { ChatUsageMeta } from "../types";

export interface ChatResponseState {
  text: string;
  responseModel?: string;
  usage: ChatUsageMeta;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" ? (value as Record<string, any>) : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function pickNumber(
  source: Record<string, any> | undefined,
  ...keys: string[]
): number | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = asNumber(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function mergeUsage(
  base: ChatUsageMeta,
  next: ChatUsageMeta
): ChatUsageMeta {
  return {
    inputTokens: next.inputTokens ?? base.inputTokens,
    outputTokens: next.outputTokens ?? base.outputTokens,
    cachedTokens: next.cachedTokens ?? base.cachedTokens,
    cacheWriteTokens: next.cacheWriteTokens ?? base.cacheWriteTokens,
  };
}

export function extractUsage(json: any, apiFormat: string): ChatUsageMeta {
  if (!json || typeof json !== "object") return {};

  if (apiFormat === "anthropic") {
    const usage =
      asRecord(json.usage) ||
      asRecord(json.message?.usage) ||
      asRecord(json.delta?.usage) ||
      asRecord(json.message_delta?.usage);
    if (!usage) return {};
    const input = pickNumber(usage, "input_tokens");
    const cacheRead = pickNumber(usage, "cache_read_input_tokens");
    const cacheWrite = pickNumber(usage, "cache_creation_input_tokens");
    const hasInputParts =
      input !== undefined || cacheRead !== undefined || cacheWrite !== undefined;
    return {
      inputTokens: hasInputParts
        ? (input ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0)
        : undefined,
      outputTokens: pickNumber(usage, "output_tokens"),
      cachedTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    };
  }

  if (apiFormat === "responses" || apiFormat === "openai_responses") {
    const usage = asRecord(json.usage) || asRecord(json.response?.usage);
    if (!usage) return {};
    const details =
      asRecord(usage.input_tokens_details) ||
      asRecord(usage.prompt_tokens_details);
    return {
      inputTokens: pickNumber(usage, "input_tokens", "prompt_tokens"),
      outputTokens: pickNumber(usage, "output_tokens", "completion_tokens"),
      cachedTokens: pickNumber(details, "cached_tokens"),
      cacheWriteTokens: pickNumber(usage, "cache_creation_input_tokens"),
    };
  }

  const usage = asRecord(json.usage) || asRecord(json.usageMetadata);
  if (!usage) return {};
  const details =
    asRecord(usage.prompt_tokens_details) ||
    asRecord(usage.input_tokens_details);
  return {
    inputTokens: pickNumber(usage, "prompt_tokens", "input_tokens"),
    outputTokens: pickNumber(usage, "completion_tokens", "output_tokens"),
    cachedTokens: pickNumber(
      details,
      "cached_tokens",
      "cache_read_tokens"
    ) ??
      pickNumber(usage, "cached_tokens", "prompt_cache_hit_tokens"),
    cacheWriteTokens: pickNumber(
      usage,
      "cache_creation_input_tokens",
      "prompt_cache_miss_tokens"
    ),
  };
}

export function extractResponseModel(
  json: any,
  apiFormat: string
): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  let model: unknown;
  if (apiFormat === "anthropic") {
    model = json.message?.model ?? json.model;
  } else if (apiFormat === "responses" || apiFormat === "openai_responses") {
    model = json.response?.model ?? json.model;
  } else {
    model = json.model ?? json.response?.model;
  }
  return typeof model === "string" && model.trim() ? model.trim() : undefined;
}

function extractContentBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    if (typeof part === "string") {
      text += part;
    } else if (part && typeof part.text === "string") {
      const type = typeof part.type === "string" ? part.type : "";
      if (type === "thinking" || type === "redacted_thinking") continue;
      text += part.text;
    }
  }
  return text;
}

export function extractNonStreamingText(json: any, apiFormat: string): string {
  if (!json || typeof json !== "object") return "";

  if (json.error?.message) {
    throw new Error(String(json.error.message));
  }

  if (apiFormat === "anthropic") {
    return extractContentBlocks(json.content);
  }

  if (apiFormat === "responses" || apiFormat === "openai_responses") {
    if (typeof json.output_text === "string" && json.output_text) {
      return json.output_text;
    }
    if (Array.isArray(json.output)) {
      let text = "";
      for (const item of json.output) {
        if (!item || typeof item !== "object") continue;
        const type = typeof item.type === "string" ? item.type : "";
        if (type === "reasoning" || type === "function_call" || type === "compaction_summary") {
          continue;
        }
        if (typeof item.text === "string") {
          text += item.text;
          continue;
        }
        text += extractContentBlocks(item.content);
      }
      if (text) return text;
    }
    if (json.content !== undefined) return extractContentBlocks(json.content);
    return extractContentBlocks(json.choices?.[0]?.message?.content);
  }

  const message = json.choices?.[0]?.message;
  if (message) {
    return extractContentBlocks(message.content);
  }
  return extractContentBlocks(json.content);
}

export function parseChatNonStreamingJson(
  json: any,
  apiFormat: string
): ChatResponseState {
  return {
    text: extractNonStreamingText(json, apiFormat),
    responseModel: extractResponseModel(json, apiFormat),
    usage: extractUsage(json, apiFormat),
  };
}

function extractStreamDeltaText(value: any, apiFormat: string): string {
  if (!value || typeof value !== "object") return "";

  if (apiFormat === "anthropic") {
    if (
      value.type === "content_block_delta" &&
      value.delta?.type === "text_delta" &&
      typeof value.delta.text === "string"
    ) {
      return value.delta.text;
    }
    return "";
  }

  if (apiFormat === "responses" || apiFormat === "openai_responses") {
    if (value.type === "response.output_text.delta" && typeof value.delta === "string") {
      return value.delta;
    }
    if (typeof value.delta === "string") return value.delta;
    if (typeof value.output_text === "string") return value.output_text;
    if (typeof value.text === "string") return value.text;
    const choice = value.choices?.[0];
    return extractContentBlocks(choice?.delta?.content);
  }

  const choice = value.choices?.[0];
  if (choice?.delta) {
    const deltaText = extractContentBlocks(choice.delta.content);
    if (deltaText) return deltaText;
  }
  return "";
}

export function parseChatStreamingBody(
  body: string,
  apiFormat: string
): ChatResponseState {
  let text = "";
  let responseModel: string | undefined;
  let usage: ChatUsageMeta = {};
  let sawSseData = false;
  let streamError: string | undefined;

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
      continue;
    }
    const dataStr = trimmed.slice(5).trim();
    if (!dataStr || dataStr === "[DONE]") continue;
    sawSseData = true;

    let value: any;
    try {
      value = JSON.parse(dataStr);
    } catch {
      // 中间分片可能尚未完整，忽略后继续等待后续数据
      continue;
    }

    if (value?.error?.message) {
      streamError = String(value.error.message);
      continue;
    }

    const model = extractResponseModel(value, apiFormat);
    if (model) responseModel = model;

    const nextUsage = extractUsage(value, apiFormat);
    if (Object.values(nextUsage).some((item) => item !== undefined)) {
      usage = mergeUsage(usage, nextUsage);
    }

    const deltaText = extractStreamDeltaText(value, apiFormat);
    if (deltaText) {
      text += deltaText;
      continue;
    }

    // 兼容只发送 done 事件的少数中转实现
    if (!text) {
      if (
        apiFormat === "responses" ||
        apiFormat === "openai_responses"
      ) {
        if (
          value?.type === "response.output_text.done" &&
          typeof value.text === "string"
        ) {
          text = value.text;
        }
      } else if (apiFormat !== "anthropic") {
        const fullContent = value?.choices?.[0]?.message?.content;
        if (typeof fullContent === "string") {
          text = fullContent;
        }
      }
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }

  if (!sawSseData || !text) {
    try {
      const parsed = JSON.parse(body);
      const fallback = parseChatNonStreamingJson(parsed, apiFormat);
      if (fallback.text) return fallback;
    } catch {
      // 不是完整 JSON，交由下面的错误提示
    }
    if (!text) {
      throw new Error("流式响应未包含有效文本内容");
    }
  }

  return { text, responseModel, usage };
}
