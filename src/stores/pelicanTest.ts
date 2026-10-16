import { defineStore } from "pinia";
import { ref, onScopeDispose } from "vue";
import { sendProbe } from "../services/api";
import type { ClientConfig, PelicanHistoryItem } from "../types";
import {
  PELICAN_PROMPT_STORAGE_KEY,
  PELICAN_HISTORY_STORAGE_KEY,
  DEFAULT_REQUEST_RETRY_COUNT,
  DEFAULT_REQUEST_RETRY_DELAY_MS,
} from "../constants";
import { sleep } from "../utils/timer";
import { isTimeoutError } from "../utils/retry";
import { maskApiKey } from "../utils/pelicanFormatters";

export const DEFAULT_PELICAN_PROMPT =
  "Generate an SVG of a pelican riding a bicycle. Reply with the SVG code only.";
export const PELICAN_PROMPT = DEFAULT_PELICAN_PROMPT;

export type PelicanContentType = "svg" | "html";

export interface RenderableContent {
  content: string;
  contentType: PelicanContentType;
  hasContent: boolean;
}

export function isPureSvg(str: string): boolean {
  const trimmed = str.trim();
  if (trimmed.startsWith("<?xml")) {
    const svgIdx = trimmed.indexOf("<svg");
    return svgIdx !== -1 && trimmed.endsWith("</svg>");
  }
  return /^<svg[\s\S]*<\/svg>$/i.test(trimmed);
}

export function isHtmlDocumentOrSnippet(str: string): boolean {
  const trimmed = str.trim();
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(trimmed)) {
    return true;
  }
  if (/<(?:head|body|canvas|style|script|div|main|section|article)[\s>]/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function extractRenderableContent(text: string): RenderableContent {
  if (!text || !text.trim()) {
    return { content: "", contentType: "svg", hasContent: false };
  }

  const trimmedText = text.trim();

  // 1. 优先尝试从 markdown 代码块中提取
  const codeBlockRegex = /```(?:xml|svg|html|htm)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(trimmedText)) !== null) {
    const blockContent = match[1].trim();
    if (!blockContent) continue;

    // 1.1 如果代码块内容本身就是纯 SVG
    if (isPureSvg(blockContent)) {
      return { content: blockContent, contentType: "svg", hasContent: true };
    }

    // 1.2 如果代码块是完整 HTML 或富 HTML 片段
    if (isHtmlDocumentOrSnippet(blockContent)) {
      const svgMatch = blockContent.match(/<svg[\s\S]*?<\/svg>/i);
      const hasOtherHtmlTags = /<(?:!DOCTYPE|html|head|body|canvas|style|script|div|span|p|section|main)[\s>]/i.test(blockContent);
      if (svgMatch && !hasOtherHtmlTags) {
        return { content: svgMatch[0].trim(), contentType: "svg", hasContent: true };
      }
      return { content: blockContent, contentType: "html", hasContent: true };
    }

    // 1.3 代码块中包含内嵌的 <svg ... </svg>
    const svgMatch = blockContent.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      return { content: svgMatch[0].trim(), contentType: "svg", hasContent: true };
    }
  }

  // 2. 全文正则匹配完整 HTML 文档 (<!DOCTYPE html> 或 <html>...</html>)
  const fullHtmlMatch = trimmedText.match(/(?:<!DOCTYPE\s+html[\s\S]*?<\/html>|<html[\s\S]*?<\/html>)/i);
  if (fullHtmlMatch) {
    return { content: fullHtmlMatch[0].trim(), contentType: "html", hasContent: true };
  }

  // 3. 全文匹配独立完整的 <svg ... </svg>
  const directSvgMatch = trimmedText.match(/<svg[\s\S]*?<\/svg>/i);
  if (directSvgMatch) {
    if (isHtmlDocumentOrSnippet(trimmedText) && /<(?:!DOCTYPE|html|head|body|canvas|style|script|div)[\s>]/i.test(trimmedText)) {
      return { content: trimmedText, contentType: "html", hasContent: true };
    }
    return { content: directSvgMatch[0].trim(), contentType: "svg", hasContent: true };
  }

  // 4. 全文匹配富 HTML 片段（包含 style/div/canvas/script 等且包含对应闭合标签）
  if (isHtmlDocumentOrSnippet(trimmedText)) {
    const hasClosingTag = /<\/(?:html|body|div|style|script|canvas|svg|section|main)>/i.test(trimmedText);
    if (hasClosingTag) {
      return { content: trimmedText, contentType: "html", hasContent: true };
    }
  }

  // 5. 容错处理：由于流式输出或截断未闭合的 <svg 或 <html / <!DOCTYPE html
  const openHtmlIndex = trimmedText.search(/<!DOCTYPE\s+html|<html/i);
  if (openHtmlIndex !== -1) {
    return { content: trimmedText.substring(openHtmlIndex).trim(), contentType: "html", hasContent: true };
  }

  const openSvgIndex = trimmedText.indexOf("<svg");
  if (openSvgIndex !== -1) {
    return { content: trimmedText.substring(openSvgIndex).trim(), contentType: "svg", hasContent: true };
  }

  return { content: "", contentType: "svg", hasContent: false };
}

export function extractSvgFromText(text: string): { svg: string; hasSvg: boolean } {
  const res = extractRenderableContent(text);
  return {
    svg: res.content,
    hasSvg: res.hasContent,
  };
}

function loadInitialPelicanPrompt(): string {
  try {
    const saved = localStorage.getItem(PELICAN_PROMPT_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved;
    }
  } catch {
    // 忽略存储读取异常
  }
  return DEFAULT_PELICAN_PROMPT;
}

const MAX_PELICAN_HISTORY_COUNT = 60;

function loadInitialPelicanHistory(): PelicanHistoryItem[] {
  try {
    const raw = localStorage.getItem(PELICAN_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is PelicanHistoryItem =>
          Boolean(item && typeof item.content === "string" && item.content.trim().length > 0)
      );
    }
  } catch (err) {
    console.error("加载鹈鹕测试历史记录失败:", err);
  }
  return [];
}

function persistPelicanHistory(list: PelicanHistoryItem[]): void {
  try {
    localStorage.setItem(PELICAN_HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("保存鹈鹕测试历史记录失败:", err);
  }
}

function generateHistoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const usePelicanTestStore = defineStore("pelicanTest", () => {
  const isPelicanRunning = ref(false);
  const pelicanSvg = ref("");
  const pelicanContent = ref("");
  const pelicanContentType = ref<PelicanContentType>("svg");
  const rawResponseText = ref("");
  const durationMs = ref(0);
  const testedModel = ref("");
  const errorMsg = ref<string | null>(null);
  const hasTested = ref(false);
  const hasResult = ref(false);
  const pelicanPrompt = ref(loadInitialPelicanPrompt());
  const pelicanHistoryList = ref<PelicanHistoryItem[]>(loadInitialPelicanHistory());

  function addPelicanHistoryItem(item: Omit<PelicanHistoryItem, "id" | "createdAt">): void {
    const newItem: PelicanHistoryItem = {
      ...item,
      id: generateHistoryId(),
      createdAt: Date.now(),
    };
    const updated = [newItem, ...pelicanHistoryList.value].slice(0, MAX_PELICAN_HISTORY_COUNT);
    pelicanHistoryList.value = updated;
    persistPelicanHistory(updated);
  }

  function deletePelicanHistoryItem(id: string): void {
    const updated = pelicanHistoryList.value.filter((item) => item.id !== id);
    pelicanHistoryList.value = updated;
    persistPelicanHistory(updated);
  }

  function clearPelicanHistory(): void {
    pelicanHistoryList.value = [];
    try {
      localStorage.removeItem(PELICAN_HISTORY_STORAGE_KEY);
    } catch {
      // 忽略存储删除异常
    }
  }

  function setPelicanPrompt(newPrompt: string): void {
    const trimmed = newPrompt.trim();
    const finalPrompt = trimmed || DEFAULT_PELICAN_PROMPT;
    pelicanPrompt.value = finalPrompt;
    try {
      if (finalPrompt === DEFAULT_PELICAN_PROMPT) {
        localStorage.removeItem(PELICAN_PROMPT_STORAGE_KEY);
      } else {
        localStorage.setItem(PELICAN_PROMPT_STORAGE_KEY, finalPrompt);
      }
    } catch {
      // 忽略存储写入异常
    }
  }

  function resetPelicanPrompt(): void {
    setPelicanPrompt(DEFAULT_PELICAN_PROMPT);
  }

  function applyHistoryItem(item: PelicanHistoryItem): void {
    pelicanContent.value = item.content;
    pelicanSvg.value = item.content;
    pelicanContentType.value = item.contentType;
    testedModel.value = item.modelName;
    rawResponseText.value = item.content;
    durationMs.value = item.durationMs || 0;
    hasTested.value = true;
    hasResult.value = true;
  }

  let currentRunId = 0;
  let abortController: AbortController | null = null;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let testStartTime = 0;

  function stopTimer(): void {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function cancelPelicanTest(): void {
    if (!isPelicanRunning.value) return;
    currentRunId += 1;
    stopTimer();
    abortController?.abort();
    abortController = null;
    if (testStartTime > 0) {
      durationMs.value = Date.now() - testStartTime;
    }
    isPelicanRunning.value = false;
    errorMsg.value = "测试已取消，再次点击开始按钮重新测试";
  }

  async function startPelicanTest(
    config: ClientConfig,
    configName?: string
  ): Promise<void> {
    if (isPelicanRunning.value) return;

    const baseUrl = config.baseUrl?.trim() || "";
    const apiKey = config.apiKey?.trim() || "";
    const modelName = config.modelName?.trim() || "";
    const apiFormat = config.apiFormat || "openai";
    const reasoningEffort = config.reasoningEffort || "high";
    const isStream = config.stream !== false;
    const timeoutSeconds = isStream ? 90 : 240;

    if (!baseUrl || !apiKey) {
      errorMsg.value = "请先填写 Base URL 和 API Key";
      hasTested.value = true;
      return;
    }
    if (!modelName) {
      errorMsg.value = "请先选择或输入模型名称";
      hasTested.value = true;
      return;
    }

    const runId = ++currentRunId;
    abortController?.abort();
    abortController = new AbortController();

    stopTimer();
    testStartTime = Date.now();
    durationMs.value = 0;

    isPelicanRunning.value = true;
    errorMsg.value = null;
    hasTested.value = true;
    hasResult.value = false;
    pelicanSvg.value = "";
    pelicanContent.value = "";
    pelicanContentType.value = "svg";
    rawResponseText.value = "";
    testedModel.value = modelName;

    timerId = setInterval(() => {
      durationMs.value = Date.now() - testStartTime;
    }, 50);

    const promptToSend = pelicanPrompt.value.trim() || DEFAULT_PELICAN_PROMPT;
    const maxAttempts = 1 + DEFAULT_REQUEST_RETRY_COUNT;
    let success = false;
    let lastErrMsg = "请求异常，请检查网络或配置";
    let lastResponseText = "";
    let finalDurationMs = 0;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (runId !== currentRunId || abortController?.signal.aborted) return;

        try {
          const res = await sendProbe({
            baseUrl,
            apiKey,
            model: modelName,
            prompt: promptToSend,
            apiFormat,
            reasoningEffort,
            stream: isStream,
            timeoutSeconds,
            signal: abortController?.signal,
          });

          if (runId !== currentRunId || abortController?.signal.aborted) return;

          lastResponseText = res.text || "";
          finalDurationMs = res.duration_ms || (Date.now() - testStartTime);

          const { content, contentType, hasContent } = extractRenderableContent(res.text || "");
          if (hasContent) {
            stopTimer();
            rawResponseText.value = lastResponseText;
            durationMs.value = finalDurationMs;
            pelicanContent.value = content;
            pelicanSvg.value = content;
            pelicanContentType.value = contentType;

            // 仅在成功生成时归档至历史记录（存储时直接脱敏省略中间部分）
            addPelicanHistoryItem({
              configName: configName?.trim() || undefined,
              baseUrl,
              apiKey: maskApiKey(apiKey),
              modelName,
              reasoningEffort,
              contentType,
              content,
              durationMs: durationMs.value,
              prompt: promptToSend,
            });

            hasResult.value = true;
            success = true;
            break;
          } else {
            lastErrMsg = "模型未返回有效的 SVG 或 HTML 代码";
            console.warn(
              `鹈鹕测试第 ${attempt} 次尝试未成功（未返回有效的 SVG 或 HTML 代码）` +
                (attempt < maxAttempts ? `，将在 ${DEFAULT_REQUEST_RETRY_DELAY_MS / 1000} 秒后静默重试...` : "")
            );
          }
        } catch (err: unknown) {
          if (runId !== currentRunId || abortController?.signal.aborted) return;
          lastErrMsg =
            err instanceof Error
              ? err.message
              : typeof err === "string"
              ? err
              : "请求异常，请检查网络或配置";
          const isTimeout = isTimeoutError(lastErrMsg);
          console.warn(
            `鹈鹕测试第 ${attempt} 次尝试请求失败（${lastErrMsg}）` +
              (!isTimeout && attempt < maxAttempts ? `，将在 ${DEFAULT_REQUEST_RETRY_DELAY_MS / 1000} 秒后静默重试...` : "")
          );
          if (isTimeout) {
            break;
          }
        }

        if (attempt < maxAttempts) {
          await sleep(DEFAULT_REQUEST_RETRY_DELAY_MS, abortController?.signal);
          if (runId !== currentRunId || abortController?.signal.aborted) return;
        }
      }

      if (runId !== currentRunId || abortController?.signal.aborted) return;

      if (!success) {
        stopTimer();
        rawResponseText.value = lastResponseText;
        durationMs.value = Date.now() - testStartTime;
        errorMsg.value = lastErrMsg;
        hasResult.value = true;
      }
    } finally {
      if (runId === currentRunId) {
        stopTimer();
        isPelicanRunning.value = false;
        abortController = null;
      }
    }
  }

  function resetPelicanTest(): void {
    currentRunId += 1;
    stopTimer();
    abortController?.abort();
    abortController = null;
    isPelicanRunning.value = false;
    pelicanSvg.value = "";
    pelicanContent.value = "";
    pelicanContentType.value = "svg";
    rawResponseText.value = "";
    durationMs.value = 0;
    testStartTime = 0;
    testedModel.value = "";
    errorMsg.value = null;
    hasTested.value = false;
    hasResult.value = false;
  }

  onScopeDispose(() => {
    stopTimer();
  });

  return {
    isPelicanRunning,
    pelicanSvg,
    pelicanContent,
    pelicanContentType,
    rawResponseText,
    durationMs,
    testedModel,
    errorMsg,
    hasTested,
    hasResult,
    pelicanPrompt,
    pelicanHistoryList,
    setPelicanPrompt,
    resetPelicanPrompt,
    startPelicanTest,
    cancelPelicanTest,
    resetPelicanTest,
    deletePelicanHistoryItem,
    clearPelicanHistory,
    applyHistoryItem,
  };
});
