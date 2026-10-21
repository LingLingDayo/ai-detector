import type {
  ConnectionChatMessage,
  ConnectionModelCount,
  ConnectionSessionStats,
} from "../types";
import { modelsMatch } from "./modelRouting";

/** 无 usage 时的粗略估算：CJK 按 1 字符 1 token，其余按 4 字符 1 token。 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (/\s/.test(char)) continue;
    if (
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.ceil(cjk + other / 4);
}

export function addModelCount(
  list: ConnectionModelCount[],
  model?: string
): void {
  const trimmed = (model || "").trim();
  if (!trimmed) return;
  const existing = list.find((item) => item.model === trimmed);
  if (existing) {
    existing.count += 1;
  } else {
    list.push({ model: trimmed, count: 1 });
  }
}

export function sortModelCounts(list: ConnectionModelCount[]): ConnectionModelCount[] {
  return [...list].sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
}

export function aggregateConnectionMessages(
  messages: readonly ConnectionChatMessage[]
): ConnectionSessionStats {
  const requestModelStats: ConnectionModelCount[] = [];
  const responseModelStats: ConnectionModelCount[] = [];

  let requestCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let mismatchCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let cacheWriteTokens = 0;
  let hasInputUsage = false;
  let usageEstimated = false;
  let totalDurationMs = 0;
  let generationMs = 0;
  let completedOutputTokens = 0;
  let firstTokenSum = 0;
  let firstTokenCount = 0;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const requestedModel = message.requestedModel?.trim();
    if (!requestedModel) continue;

    requestCount += 1;
    addModelCount(requestModelStats, requestedModel);

    if (message.error) {
      errorCount += 1;
    } else if (!message.streaming && !message.stopped) {
      successCount += 1;
    }

    if (message.responseModel?.trim() && !message.error) {
      addModelCount(responseModelStats, message.responseModel);
      if (!modelsMatch(requestedModel, message.responseModel)) {
        mismatchCount += 1;
      }
    }

    const usage = message.usage;
    if (usage?.inputTokens !== undefined) {
      inputTokens += usage.inputTokens;
      hasInputUsage = true;
    }
    if (usage?.cachedTokens !== undefined) {
      cachedTokens += usage.cachedTokens;
    }
    if (usage?.cacheWriteTokens !== undefined) {
      cacheWriteTokens += usage.cacheWriteTokens;
    }
    if (usage?.outputTokens !== undefined) {
      outputTokens += usage.outputTokens;
      if (!message.streaming) completedOutputTokens += usage.outputTokens;
    } else if (message.content.trim()) {
      const estimated = estimateTokenCount(message.content);
      outputTokens += estimated;
      if (!message.streaming) completedOutputTokens += estimated;
      usageEstimated = true;
    }

    if (message.durationMs !== undefined) {
      totalDurationMs += message.durationMs;
      const firstToken = message.firstTokenMs;
      const generation =
        firstToken !== undefined && message.durationMs > firstToken
          ? message.durationMs - firstToken
          : message.durationMs;
      generationMs += generation;
    }
    if (message.firstTokenMs !== undefined) {
      firstTokenSum += message.firstTokenMs;
      firstTokenCount += 1;
    }
  }

  return {
    requestCount,
    successCount,
    errorCount,
    mismatchCount,
    requestModelStats: sortModelCounts(requestModelStats),
    responseModelStats: sortModelCounts(responseModelStats),
    inputTokens,
    outputTokens,
    cachedTokens,
    cacheWriteTokens,
    totalDurationMs,
    outputSpeed:
      generationMs > 0 ? completedOutputTokens / (generationMs / 1000) : null,
    cacheRate: hasInputUsage && inputTokens > 0 ? cachedTokens / inputTokens : null,
    avgFirstTokenMs: firstTokenCount > 0 ? firstTokenSum / firstTokenCount : null,
    usageEstimated,
  };
}

export function getMessageOutputTokens(message: ConnectionChatMessage): {
  count: number;
  estimated: boolean;
} {
  if (message.usage?.outputTokens !== undefined) {
    return { count: message.usage.outputTokens, estimated: false };
  }
  return {
    count: estimateTokenCount(message.content),
    estimated: Boolean(message.content.trim()),
  };
}

export function getMessageOutputSpeed(
  message: ConnectionChatMessage
): number | null {
  const { count } = getMessageOutputTokens(message);
  if (count <= 0 || !message.durationMs || message.durationMs <= 0) return null;
  const firstToken = message.firstTokenMs;
  const generationMs =
    firstToken !== undefined && message.durationMs > firstToken
      ? message.durationMs - firstToken
      : message.durationMs;
  return generationMs > 0 ? count / (generationMs / 1000) : null;
}

export function getMessageCacheRate(
  message: ConnectionChatMessage
): number | null {
  const input = message.usage?.inputTokens;
  const cached = message.usage?.cachedTokens;
  if (input === undefined || input <= 0 || cached === undefined) return null;
  return cached / input;
}

export function formatTokenCount(count?: number | null): string {
  if (count === undefined || count === null || Number.isNaN(count)) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(Math.round(count));
}

export function formatSpeed(speed?: number | null): string {
  if (speed === undefined || speed === null || !Number.isFinite(speed) || speed <= 0) {
    return "—";
  }
  return `${speed.toFixed(1)} tok/s`;
}

export function formatCacheRate(rate?: number | null): string {
  if (rate === undefined || rate === null || !Number.isFinite(rate)) return "—";
  const percent = Math.max(0, Math.min(1, rate)) * 100;
  return `${percent.toFixed(1).replace(/\.0$/, "")}%`;
}

export function formatDurationMs(ms?: number | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatFirstToken(ms?: number | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
