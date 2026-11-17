import type { ChatUsageMeta } from "../types";

export interface ChatResponseState {
  text: string;
  responseModel?: string;
  usage: ChatUsageMeta;
}

export interface ChatScanState extends ChatResponseState {
  hasSemanticOutput: boolean;
  sawSseData: boolean;
  errorMessage?: string;
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
    // done/completed 事件包含完整文本，不能再次累加
    if (typeof value.type === "string" && value.type.startsWith("response.")) {
      return "";
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

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function hasNonEmptyTextArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((part) => {
    if (typeof part === "string") return part.length > 0;
    if (!part || typeof part !== "object") return false;
    const record = part as Record<string, unknown>;
    return (
      isNonEmptyString(record.text) ||
      isNonEmptyString(record.summary) ||
      isNonEmptyString(record.data)
    );
  });
}

/** 判断流式分片是否包含语义输出（含文本、思考/推理与工具调用增量），用于准确计算首字延迟。 */
function hasStreamSemanticOutput(value: any, apiFormat: string): boolean {
  if (!value || typeof value !== "object") return false;

  if (apiFormat === "anthropic") {
    if (value.type !== "content_block_delta" || !value.delta) return false;
    const deltaType = value.delta.type;
    if (deltaType === "text_delta") return isNonEmptyString(value.delta.text);
    if (deltaType === "thinking_delta") return isNonEmptyString(value.delta.thinking);
    if (deltaType === "input_json_delta") {
      return isNonEmptyString(value.delta.partial_json);
    }
    return false;
  }

  if (apiFormat === "responses" || apiFormat === "openai_responses") {
    const type = typeof value.type === "string" ? value.type : "";
    if (
      type === "response.output_text.delta" ||
      type === "response.reasoning_summary_text.delta" ||
      type === "response.reasoning_text.delta" ||
      type === "response.reasoning.delta" ||
      type === "response.reasoning_summary.delta" ||
      type === "response.function_call_arguments.delta"
    ) {
      return (
        isNonEmptyString(value.delta) ||
        isNonEmptyString(value.delta?.text) ||
        isNonEmptyString(value.text)
      );
    }
    if (type === "response.output_text.done") {
      return isNonEmptyString(value.text);
    }
    if (type.startsWith("response.")) {
      return false;
    }
    if (
      isNonEmptyString(value.delta) ||
      isNonEmptyString(value.output_text) ||
      isNonEmptyString(value.text)
    ) {
      return true;
    }
  }

  const choice = value.choices?.[0];
  if (!choice || typeof choice !== "object") return false;
  const delta = choice.delta;
  if (delta && typeof delta === "object") {
    if (
      isNonEmptyString(delta.content) ||
      hasNonEmptyTextArray(delta.content) ||
      isNonEmptyString(delta.reasoning_content) ||
      isNonEmptyString(delta.reasoning) ||
      isNonEmptyString(delta.thinking) ||
      hasNonEmptyTextArray(delta.reasoning_details) ||
      (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0)
    ) {
      return true;
    }
  }
  const message = choice.message;
  if (message && typeof message === "object") {
    return (
      isNonEmptyString(message.content) ||
      hasNonEmptyTextArray(message.content) ||
      isNonEmptyString(message.reasoning_content) ||
      isNonEmptyString(message.reasoning)
    );
  }
  return false;
}

/** 宽松扫描 SSE 流：供实时进度与首字延迟识别使用，不在尚未出现文本时抛错。 */
export function scanChatStream(
  body: string,
  apiFormat: string
): ChatScanState {
  let text = "";
  let responseModel: string | undefined;
  let usage: ChatUsageMeta = {};
  let sawSseData = false;
  let hasSemanticOutput = false;
  let errorMessage: string | undefined;

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
      if (!errorMessage) {
        errorMessage = String(value.error.message);
      }
      continue;
    }

    const model = extractResponseModel(value, apiFormat);
    if (model) responseModel = model;

    const nextUsage = extractUsage(value, apiFormat);
    if (Object.values(nextUsage).some((item) => item !== undefined)) {
      usage = mergeUsage(usage, nextUsage);
    }

    if (!hasSemanticOutput && hasStreamSemanticOutput(value, apiFormat)) {
      hasSemanticOutput = true;
    }

    const deltaText = extractStreamDeltaText(value, apiFormat);
    if (deltaText) {
      hasSemanticOutput = true;
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
          if (value.text) hasSemanticOutput = true;
          text = value.text;
        }
      } else if (apiFormat !== "anthropic") {
        const fullContent = value?.choices?.[0]?.message?.content;
        if (typeof fullContent === "string") {
          if (fullContent) hasSemanticOutput = true;
          text = fullContent;
        }
      }
    }
  }

  return {
    text,
    responseModel,
    usage,
    hasSemanticOutput,
    sawSseData,
    errorMessage,
  };
}

export function parseChatStreamingBody(
  body: string,
  apiFormat: string
): ChatResponseState {
  const scanned = scanChatStream(body, apiFormat);

  if (scanned.errorMessage) {
    throw new Error(scanned.errorMessage);
  }

  if (!scanned.sawSseData || !scanned.text) {
    try {
      const parsed = JSON.parse(body);
      const fallback = parseChatNonStreamingJson(parsed, apiFormat);
      if (fallback.text) return fallback;
    } catch {
      // 不是完整 JSON，交由下面的错误提示
    }
    if (!scanned.text) {
      throw new Error("流式响应未包含有效文本内容");
    }
  }

  return {
    text: scanned.text,
    responseModel: scanned.responseModel,
    usage: scanned.usage,
  };
}
