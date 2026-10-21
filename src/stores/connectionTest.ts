import { defineStore } from "pinia";
import { computed, onScopeDispose, ref } from "vue";
import { sendChat } from "../services/chat";
import type {
  ChatUsageMeta,
  ClientConfig,
  ConnectionChatMessage,
  ConnectionHistoryItem,
  ConnectionImageAttachment,
  ConnectionTestMode,
} from "../types";
import {
  CONNECTION_HISTORY_STORAGE_KEY,
  CONNECTION_MODE_STORAGE_KEY,
} from "../constants";
import { aggregateConnectionMessages } from "../utils/connectionMetrics";
import { maskApiKey } from "../utils/pelicanFormatters";

const MAX_CONNECTION_HISTORY_COUNT = 40;
const STREAM_TEXT_TAIL_LENGTH = 120;
const MAX_HISTORY_TITLE_LENGTH = 48;
const MAX_IMAGES_PER_MESSAGE = 4;

interface ConnectionSessionMeta {
  configName?: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: string;
  stream: boolean;
}

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadInitialConnectionHistory(): ConnectionHistoryItem[] {
  try {
    const raw = localStorage.getItem(CONNECTION_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ConnectionHistoryItem =>
        Boolean(
          item &&
            typeof item.id === "string" &&
            typeof item.createdAt === "number" &&
            Array.isArray(item.requestModelStats) &&
            Array.isArray(item.responseModelStats)
        )
    );
  } catch (err) {
    console.error("加载连接测试历史记录失败:", err);
    return [];
  }
}

function persistConnectionHistory(list: ConnectionHistoryItem[]): void {
  try {
    localStorage.setItem(CONNECTION_HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("保存连接测试历史记录失败:", err);
  }
}

function loadConnectionMode(): ConnectionTestMode {
  try {
    return localStorage.getItem(CONNECTION_MODE_STORAGE_KEY) === "quick"
      ? "quick"
      : "chat";
  } catch {
    return "chat";
  }
}

function persistConnectionMode(mode: ConnectionTestMode): void {
  try {
    localStorage.setItem(CONNECTION_MODE_STORAGE_KEY, mode);
  } catch (err) {
    console.error("保存连接测试模式失败:", err);
  }
}

function buildHistoryTitle(message?: ConnectionChatMessage): string {
  const text = (message?.content || "").replace(/\s+/g, " ").trim();
  if (text) {
    return text.length > MAX_HISTORY_TITLE_LENGTH
      ? `${text.slice(0, MAX_HISTORY_TITLE_LENGTH)}…`
      : text;
  }
  if (message?.images.length) return "图片对话";
  return "新连接会话";
}

export const useConnectionTestStore = defineStore("connectionTest", () => {
  const messages = ref<ConnectionChatMessage[]>([]);
  const isConnectionRunning = ref(false);
  const isConnectionGenerating = ref(false);
  const errorMsg = ref<string | null>(null);
  const streamedCharCount = ref(0);
  const streamedTextTail = ref("");
  const activeElapsedMs = ref(0);
  const connectionHistoryList = ref<ConnectionHistoryItem[]>(
    loadInitialConnectionHistory()
  );
  const activeSessionHistoryId = ref<string | null>(null);
  const sessionMeta = ref<ConnectionSessionMeta | null>(null);
  const composerFocusSignal = ref(0);
  const connectionMode = ref<ConnectionTestMode>(loadConnectionMode());

  const sessionStats = computed(() => aggregateConnectionMessages(messages.value));
  const hasMessages = computed(() => messages.value.length > 0);
  const userMessageCount = computed(
    () => messages.value.filter((message) => message.role === "user").length
  );
  const latestRequestedModel = computed(() => {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      const message = messages.value[index];
      if (message.role === "assistant" && message.requestedModel) {
        return message.requestedModel;
      }
    }
    return "";
  });
  const latestResponseModel = computed(() => {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      const message = messages.value[index];
      if (message.role === "assistant" && message.responseModel) {
        return message.responseModel;
      }
    }
    return "";
  });

  let currentRunId = 0;
  let abortController: AbortController | null = null;
  let stopRequested = false;

  function requestComposerFocus(): void {
    composerFocusSignal.value += 1;
  }

  function setConnectionMode(mode: ConnectionTestMode): void {
    if (connectionMode.value === mode) return;
    connectionMode.value = mode;
    persistConnectionMode(mode);
  }

  function buildSessionHistoryItem(): ConnectionHistoryItem {
    const stats = aggregateConnectionMessages(messages.value);
    const userMessages = messages.value.filter((message) => message.role === "user");
    const lastAssistant = [...messages.value]
      .reverse()
      .find((message) => message.role === "assistant" && message.requestedModel);
    const existing = connectionHistoryList.value.find(
      (item) => item.id === activeSessionHistoryId.value
    );
    const meta = sessionMeta.value ?? {
      baseUrl: "",
      apiKey: "-",
      apiFormat: "chat_completions",
      stream: true,
    };

    return {
      id: activeSessionHistoryId.value ?? generateId("connection"),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      title: buildHistoryTitle(userMessages[0]),
      configName: meta.configName,
      baseUrl: meta.baseUrl,
      apiKey: meta.apiKey,
      apiFormat: meta.apiFormat,
      stream: meta.stream,
      userMessageCount: userMessages.length,
      requestCount: stats.requestCount,
      successCount: stats.successCount,
      errorCount: stats.errorCount,
      stoppedCount: stats.stoppedCount,
      successRate: stats.successRate ?? undefined,
      mismatchCount: stats.mismatchCount,
      requestModelStats: stats.requestModelStats,
      responseModelStats: stats.responseModelStats,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      cachedTokens: stats.cachedTokens,
      cacheWriteTokens: stats.cacheWriteTokens,
      totalDurationMs: stats.totalDurationMs,
      avgFirstTokenMs: stats.avgFirstTokenMs ?? undefined,
      outputSpeed: stats.outputSpeed ?? undefined,
      cacheRate: stats.cacheRate ?? undefined,
      usageEstimated: stats.usageEstimated,
      lastRequestedModel: lastAssistant?.requestedModel,
      lastResponseModel: lastAssistant?.responseModel,
      lastError: lastAssistant?.error,
    };
  }

  function syncSessionHistory(): void {
    if (!activeSessionHistoryId.value || messages.value.length === 0) return;
    const item = buildSessionHistoryItem();
    const remaining = connectionHistoryList.value.filter(
      (history) => history.id !== item.id
    );
    const updated = [item, ...remaining]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONNECTION_HISTORY_COUNT);
    connectionHistoryList.value = updated;
    persistConnectionHistory(updated);
  }

  function validateRequestConfig(config: ClientConfig): boolean {
    if (!config.baseUrl?.trim() || !config.apiKey?.trim()) {
      errorMsg.value = "请先在上方填写 Base URL 和 API Key";
      return false;
    }
    if (!config.modelName?.trim()) {
      errorMsg.value = "请先在上方选择或输入模型名称";
      return false;
    }
    return true;
  }

  async function sendConnectionMessage(
    payload: { text: string; images: ConnectionImageAttachment[] },
    config: ClientConfig,
    configName?: string
  ): Promise<void> {
    if (isConnectionRunning.value) return;

    const text = payload.text.trim();
    const images = payload.images.slice(0, MAX_IMAGES_PER_MESSAGE);
    if (!text && images.length === 0) return;

    if (!validateRequestConfig(config)) return;

    const baseUrl = config.baseUrl?.trim() || "";
    const apiKey = config.apiKey?.trim() || "";
    const modelName = config.modelName?.trim() || "";
    const apiFormat = config.apiFormat || "chat_completions";
    const reasoningEffort = config.reasoningEffort || "high";
    const isStream = config.stream !== false;

    const runId = ++currentRunId;
    stopRequested = false;
    abortController?.abort();
    abortController = new AbortController();

    isConnectionRunning.value = true;
    isConnectionGenerating.value = false;
    errorMsg.value = null;
    streamedCharCount.value = 0;
    streamedTextTail.value = "";
    activeElapsedMs.value = 0;

    if (!activeSessionHistoryId.value) {
      activeSessionHistoryId.value = generateId("connection");
      sessionMeta.value = {
        configName: configName?.trim() || undefined,
        baseUrl,
        apiKey: maskApiKey(apiKey),
        apiFormat,
        stream: isStream,
      };
    }

    const userMessage: ConnectionChatMessage = {
      id: generateId("user"),
      role: "user",
      content: text,
      images,
      createdAt: Date.now(),
    };
    const assistantMessage: ConnectionChatMessage = {
      id: generateId("assistant"),
      role: "assistant",
      content: "",
      images: [],
      createdAt: Date.now(),
      streaming: true,
      requestedModel: modelName,
    };
    messages.value = [...messages.value, userMessage, assistantMessage];
    const assistant = messages.value[messages.value.length - 1];
    syncSessionHistory();

    const requestMessages = messages.value
      .slice(0, -1)
      .filter(
        (message) =>
          message.role === "user" ||
          (message.role === "assistant" && !message.error && message.content.trim())
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
        images:
          message.role === "user"
            ? message.images.map((image) => ({
                mimeType: image.mimeType,
                data: image.data,
              }))
            : undefined,
      }));

    const requestStart = Date.now();
    let firstTokenMs: number | undefined;
    const timer = setInterval(() => {
      if (runId === currentRunId) {
        activeElapsedMs.value = Date.now() - requestStart;
      }
    }, 100);

    const applyUsage = (usage?: ChatUsageMeta): void => {
      if (usage && Object.values(usage).some((value) => value !== undefined)) {
        assistant.usage = usage;
      }
    };

    try {
      const result = await sendChat({
        baseUrl,
        apiKey,
        model: modelName,
        messages: requestMessages,
        apiFormat,
        reasoningEffort,
        stream: isStream,
        timeoutSeconds: isStream ? 90 : 240,
        signal: abortController.signal,
        onStreamStart: () => {
          if (runId === currentRunId) {
            isConnectionGenerating.value = true;
          }
        },
        onStreamProgress: (preview) => {
          if (runId !== currentRunId) return;
          isConnectionGenerating.value = true;
          if (!firstTokenMs && preview) {
            firstTokenMs = Date.now() - requestStart;
          }
          assistant.content = preview;
          streamedCharCount.value = preview.length;
          streamedTextTail.value = preview.slice(-STREAM_TEXT_TAIL_LENGTH);
        },
        onResponseModel: (model) => {
          if (runId === currentRunId) {
            assistant.responseModel = model;
          }
        },
      });

      if (runId !== currentRunId) return;

      if (!result.text.trim()) {
        throw new Error("模型未返回文本内容");
      }

      assistant.content = result.text;
      assistant.responseModel = result.responseModel || assistant.responseModel;
      assistant.durationMs = result.durationMs;
      assistant.firstTokenMs = result.firstTokenMs ?? firstTokenMs;
      applyUsage(result.usage);
      assistant.streaming = false;
      isConnectionGenerating.value = false;
    } catch (err: unknown) {
      if (runId !== currentRunId) return;

      if (stopRequested) {
        assistant.stopped = true;
        assistant.streaming = false;
        assistant.durationMs = Date.now() - requestStart;
        assistant.firstTokenMs = firstTokenMs;
        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "请求异常，请检查网络或配置";
      assistant.error = message;
      assistant.streaming = false;
      assistant.durationMs = Date.now() - requestStart;
      assistant.firstTokenMs = firstTokenMs;
      errorMsg.value = message;
    } finally {
      clearInterval(timer);
      if (runId === currentRunId) {
        isConnectionRunning.value = false;
        isConnectionGenerating.value = false;
        abortController = null;
        stopRequested = false;
        if (assistant.streaming) {
          assistant.streaming = false;
        }
        syncSessionHistory();
      }
    }
  }

  async function retryConnectionReply(
    messageId: string,
    config: ClientConfig,
    configName?: string
  ): Promise<void> {
    if (isConnectionRunning.value) return;

    const assistantIndex = messages.value.findIndex(
      (message) => message.id === messageId && message.role === "assistant"
    );
    if (assistantIndex < 0) return;

    const userMessage = messages.value[assistantIndex - 1];
    if (!userMessage || userMessage.role !== "user") return;
    if (!validateRequestConfig(config)) return;

    const payload = {
      text: userMessage.content,
      images: userMessage.images,
    };
    messages.value = messages.value.slice(0, assistantIndex - 1);

    await sendConnectionMessage(payload, config, configName);
  }

  function stopConnectionReply(): void {
    if (!isConnectionRunning.value) return;
    stopRequested = true;
    abortController?.abort();
  }

  function clearConnectionContext(): void {
    if (activeSessionHistoryId.value) {
      syncSessionHistory();
    }
    currentRunId += 1;
    abortController?.abort();
    abortController = null;
    stopRequested = false;
    isConnectionRunning.value = false;
    isConnectionGenerating.value = false;
    errorMsg.value = null;
    streamedCharCount.value = 0;
    streamedTextTail.value = "";
    activeElapsedMs.value = 0;
    messages.value = [];
    sessionMeta.value = null;
    activeSessionHistoryId.value = null;
  }

  function deleteConnectionHistoryItem(id: string): void {
    const updated = connectionHistoryList.value.filter((item) => item.id !== id);
    connectionHistoryList.value = updated;
    persistConnectionHistory(updated);
  }

  function clearConnectionHistory(): void {
    connectionHistoryList.value = [];
    try {
      localStorage.removeItem(CONNECTION_HISTORY_STORAGE_KEY);
    } catch {
      // 忽略存储删除异常
    }
  }

  onScopeDispose(() => {
    currentRunId += 1;
    abortController?.abort();
    abortController = null;
  });

  return {
    messages,
    isConnectionRunning,
    isConnectionGenerating,
    errorMsg,
    streamedCharCount,
    streamedTextTail,
    activeElapsedMs,
    connectionHistoryList,
    activeSessionHistoryId,
    sessionStats,
    hasMessages,
    userMessageCount,
    latestRequestedModel,
    latestResponseModel,
    composerFocusSignal,
    connectionMode,
    requestComposerFocus,
    setConnectionMode,
    sendConnectionMessage,
    retryConnectionReply,
    stopConnectionReply,
    clearConnectionContext,
    deleteConnectionHistoryItem,
    clearConnectionHistory,
  };
});
