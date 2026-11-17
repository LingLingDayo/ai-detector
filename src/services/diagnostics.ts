import { isTauriApp } from "./api";

export type DiagnosticLevel = "error" | "warn" | "info" | "debug" | "trace";

export interface DiagnosticEntry {
  id: number;
  timestamp: number;
  level: DiagnosticLevel;
  target: string;
  message: string;
}

/** 日志只保留在内存中，超出上限后丢弃最早的记录，避免长时间运行占用过多内存 */
export const MAX_DIAGNOSTIC_ENTRIES = 500;

const DIAGNOSTICS_EVENT = "diagnostics://log";
const LEVELS: DiagnosticLevel[] = ["error", "warn", "info", "debug", "trace"];
const CONSOLE_METHODS: Array<"log" | "info" | "warn" | "error" | "debug"> = [
  "log",
  "info",
  "warn",
  "error",
  "debug",
];

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{6,}\b/g, "sk-***"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{6,}=*/gi, "Bearer ***"],
  [/("(?:apiKey|api_key|apikey|authorization|token|access_token|secret)"\s*:\s*")[^"]*(")/gi, "$1***$2"],
  [/((?:api[_-]?key|token|authorization|secret)=)[^&\s"']+/gi, "$1***"],
];

interface RustLogPayload {
  timestamp_ms: number;
  level: string;
  target: string;
  message: string;
}

interface EarlyErrorRecord {
  message: string;
  timestamp: number;
}

interface EarlyErrorBridge {
  __AI_DETECTOR_EARLY_ERRORS__?: EarlyErrorRecord[];
  __AI_DETECTOR_STOP_EARLY_CAPTURE__?: () => void;
}

type EntriesListener = (entries: DiagnosticEntry[]) => void;
type ConsoleFunction = (...args: unknown[]) => void;

const listeners = new Set<EntriesListener>();
const consoleOriginals = new Map<string, ConsoleFunction>();
let entries: DiagnosticEntry[] = [];
let nextId = 1;
let installed = false;
let detachTauriListener: (() => void) | null = null;
let windowErrorHandler: ((event: ErrorEvent) => void) | null = null;
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

function earlyBridge(): (Window & EarlyErrorBridge) | null {
  if (typeof window === "undefined") return null;
  return window as Window & EarlyErrorBridge;
}

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text
  );
}

export function formatUnknownValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, current: unknown) => {
      if (current instanceof Error) return current.stack || current.message;
      if (typeof current === "bigint") return String(current);
      if (typeof current === "object" && current !== null) {
        if (seen.has(current)) return "[Circular]";
        seen.add(current);
      }
      return current;
    });
  } catch {
    return String(value);
  }
}

function normalizeLevel(value: unknown): DiagnosticLevel {
  return LEVELS.includes(value as DiagnosticLevel) ? (value as DiagnosticLevel) : "info";
}

export function getDiagnosticEntries(): readonly DiagnosticEntry[] {
  return entries;
}

export function subscribeDiagnostics(listener: EntriesListener): () => void {
  listeners.add(listener);
  listener(entries);
  return () => {
    listeners.delete(listener);
  };
}

export function addDiagnosticEntry(input: Omit<DiagnosticEntry, "id">): void {
  const entry: DiagnosticEntry = {
    id: nextId++,
    timestamp: Number.isFinite(input.timestamp) ? input.timestamp : Date.now(),
    level: normalizeLevel(input.level),
    target: input.target || "app",
    message: redactSecrets(input.message),
  };

  const next = [...entries, entry];
  if (next.length > MAX_DIAGNOSTIC_ENTRIES) {
    next.splice(0, next.length - MAX_DIAGNOSTIC_ENTRIES);
  }
  entries = next;
  listeners.forEach((listener) => listener(entries));
}

export function clearDiagnosticEntries(): void {
  entries = [];
  listeners.forEach((listener) => listener(entries));
}

export function formatDiagnosticText(list: readonly DiagnosticEntry[]): string {
  const lines = list.map((entry) => {
    const time = new Date(entry.timestamp).toISOString();
    return `${time} [${entry.level.toUpperCase()}] [${entry.target}] ${entry.message}`;
  });

  return [
    `AI Detector 诊断信息（共 ${list.length} 条，仅存于内存）`,
    `导出时间：${new Date().toISOString()}`,
    "",
    ...lines,
  ].join("\n");
}

export function handleVueError(err: unknown, info: string): void {
  addDiagnosticEntry({
    timestamp: Date.now(),
    level: "error",
    target: "vue",
    message: `${info}: ${formatUnknownValue(err)}`,
  });
}

function installConsoleProxy(): void {
  CONSOLE_METHODS.forEach((method) => {
    const original = console[method] as ConsoleFunction;
    consoleOriginals.set(method, original);
    const level: DiagnosticLevel = method === "log" ? "info" : method === "debug" ? "debug" : method;

    console[method] = ((...args: unknown[]) => {
      original.apply(console, args);
      addDiagnosticEntry({
        timestamp: Date.now(),
        level,
        target: "console",
        message: args.map(formatUnknownValue).join(" "),
      });
    }) as (...data: any[]) => void;
  });
}

function installWindowHandlers(): void {
  if (typeof window === "undefined") return;

  windowErrorHandler = (event: ErrorEvent) => {
    const detail = event.error ? formatUnknownValue(event.error) : event.message;
    const location = event.filename
      ? ` (${event.filename}:${event.lineno}:${event.colno})`
      : "";
    addDiagnosticEntry({
      timestamp: Date.now(),
      level: "error",
      target: "window.error",
      message: `${detail}${location}`,
    });
  };

  rejectionHandler = (event: PromiseRejectionEvent) => {
    addDiagnosticEntry({
      timestamp: Date.now(),
      level: "error",
      target: "unhandledrejection",
      message: formatUnknownValue(event.reason),
    });
  };

  window.addEventListener("error", windowErrorHandler);
  window.addEventListener("unhandledrejection", rejectionHandler);
}

function importEarlyErrors(): void {
  const bridge = earlyBridge();
  const earlyErrors = bridge?.__AI_DETECTOR_EARLY_ERRORS__;
  if (!earlyErrors) return;

  earlyErrors.forEach((record) => {
    addDiagnosticEntry({
      timestamp: Number.isFinite(record.timestamp) ? record.timestamp : Date.now(),
      level: "error",
      target: "bootstrap",
      message: redactSecrets(String(record.message ?? "")),
    });
  });

  // 应用内的 window 监听已就绪，后续错误由它采集，早期临时监听即可退出
  bridge?.__AI_DETECTOR_STOP_EARLY_CAPTURE__?.();
}

async function attachTauriLogs(): Promise<void> {
  if (!isTauriApp()) return;

  try {
    const { listen } = await import("@tauri-apps/api/event");
    detachTauriListener = await listen<RustLogPayload>(DIAGNOSTICS_EVENT, (event) => {
      const payload = event.payload;
      if (!payload || typeof payload.message !== "string") return;

      addDiagnosticEntry({
        timestamp: Number.isFinite(payload.timestamp_ms) ? payload.timestamp_ms : Date.now(),
        level: normalizeLevel(payload.level),
        target: typeof payload.target === "string" ? payload.target : "rust",
        message: payload.message,
      });
    });
  } catch (err) {
    // 此处不能写 console：console 已被代理，写日志会再次进入采集链路
    addDiagnosticEntry({
      timestamp: Date.now(),
      level: "warn",
      target: "diagnostics",
      message: `无法订阅 Rust 日志: ${formatUnknownValue(err)}`,
    });
  }
}

export function installDiagnostics(): void {
  if (installed) return;
  installed = true;

  installConsoleProxy();
  installWindowHandlers();
  importEarlyErrors();
  void attachTauriLogs();
}

/** 停止采集并清空内存缓冲，供测试与主动关闭诊断能力的场景使用 */
export function resetDiagnostics(): void {
  consoleOriginals.forEach((original, method) => {
    console[method as "log" | "info" | "warn" | "error" | "debug"] = original as (
      ...data: any[]
    ) => void;
  });
  consoleOriginals.clear();

  if (typeof window !== "undefined") {
    if (windowErrorHandler) window.removeEventListener("error", windowErrorHandler);
    if (rejectionHandler) window.removeEventListener("unhandledrejection", rejectionHandler);
  }
  windowErrorHandler = null;
  rejectionHandler = null;

  detachTauriListener?.();
  detachTauriListener = null;
  listeners.clear();
  entries = [];
  nextId = 1;
  installed = false;
}
