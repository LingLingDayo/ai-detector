import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockListen = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

import {
  MAX_DIAGNOSTIC_ENTRIES,
  addDiagnosticEntry,
  clearDiagnosticEntries,
  formatDiagnosticText,
  formatUnknownValue,
  getDiagnosticEntries,
  installDiagnostics,
  redactSecrets,
  resetDiagnostics,
  subscribeDiagnostics,
} from "./diagnostics";

function stubWindow(isTauri: boolean): Record<string, (event: unknown) => void> {
  const handlers: Record<string, (event: unknown) => void> = {};
  vi.stubGlobal("window", {
    ...(isTauri ? { __TAURI_INTERNALS__: {} } : {}),
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers[type] = handler;
    },
    removeEventListener: vi.fn(),
  });
  return handlers;
}

describe("diagnostics 内存诊断服务", () => {
  beforeEach(() => {
    resetDiagnostics();
    vi.unstubAllGlobals();
    mockListen.mockReset();
    ["log", "info", "warn", "error", "debug"].forEach((method) => {
      vi.spyOn(console, method as "log").mockImplementation(() => {});
    });
  });

  afterEach(() => {
    resetDiagnostics();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("脱敏规则能遮蔽各类凭据且不破坏普通文本", () => {
    expect(redactSecrets("key=sk-abcdef1234567890 已配置")).toContain("sk-***");
    expect(redactSecrets("key=sk-abcdef1234567890")).not.toContain("abcdef1234567890");
    expect(redactSecrets("Authorization: Bearer abcdef123456")).toBe("Authorization: Bearer ***");
    expect(redactSecrets('{"apiKey": "sk-secret-value", "model": "gpt-4"}')).not.toContain("sk-secret-value");
    expect(redactSecrets("https://api.example.com/v1?api_key=supersecret123&model=gpt")).toContain("api_key=***");
    expect(redactSecrets("模型 gpt-4 请求超时（90 秒）")).toBe("模型 gpt-4 请求超时（90 秒）");
  });

  it("环形缓冲超过上限后只保留最新的记录", () => {
    for (let i = 1; i <= MAX_DIAGNOSTIC_ENTRIES + 5; i++) {
      addDiagnosticEntry({
        timestamp: 1000 + i,
        level: "info",
        target: "test",
        message: `第 ${i} 条`,
      });
    }

    const list = getDiagnosticEntries();
    expect(list).toHaveLength(MAX_DIAGNOSTIC_ENTRIES);
    expect(list[0].message).toBe("第 6 条");
    expect(list[list.length - 1].message).toBe(`第 ${MAX_DIAGNOSTIC_ENTRIES + 5} 条`);
  });

  it("新增记录会脱敏，订阅者能收到最新缓冲且清空后同步", () => {
    const snapshots: number[] = [];
    const unsubscribe = subscribeDiagnostics((list) => snapshots.push(list.length));

    addDiagnosticEntry({
      timestamp: Date.now(),
      level: "error",
      target: "test",
      message: "请求带 sk-plaintext123456 失败",
    });

    expect(getDiagnosticEntries()[0].message).not.toContain("sk-plaintext123456");
    expect(snapshots).toEqual([0, 1]);

    clearDiagnosticEntries();
    expect(getDiagnosticEntries()).toHaveLength(0);
    expect(snapshots[snapshots.length - 1]).toBe(0);

    unsubscribe();
    addDiagnosticEntry({ timestamp: Date.now(), level: "warn", target: "test", message: "不再通知" });
    expect(snapshots[snapshots.length - 1]).toBe(0);
  });

  it("导出的诊断文本包含时间、级别、来源且不含密钥", () => {
    addDiagnosticEntry({
      timestamp: Date.parse("2026-11-10T02:00:00.000Z"),
      level: "warn",
      target: "rust::probe",
      message: "连接上游失败 sk-should-be-hidden-123",
    });

    const text = formatDiagnosticText(getDiagnosticEntries());
    expect(text).toContain("2026-11-10T02:00:00.000Z");
    expect(text).toContain("[WARN] [rust::probe]");
    expect(text).toContain("仅存于内存");
    expect(text).not.toContain("sk-should-be-hidden-123");
  });

  it("formatUnknownValue 能处理 Error 与循环引用对象", () => {
    const err = new Error("请求失败");
    expect(formatUnknownValue(err)).toContain("请求失败");
    expect(formatUnknownValue(null)).toBe("null");
    expect(formatUnknownValue(undefined)).toBe("undefined");

    const circular: Record<string, unknown> = { name: "配置" };
    circular.self = circular;
    expect(formatUnknownValue(circular)).toContain("[Circular]");
  });

  it("Web 环境下安装全局捕获后 console 错误进入内存且不订阅 Rust 事件", async () => {
    stubWindow(false);
    installDiagnostics();

    console.error("Web 环境错误", new Error("boom"));

    expect(getDiagnosticEntries().some((entry) => entry.message.includes("Web 环境错误"))).toBe(true);
    await Promise.resolve();
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("全局 error 与 unhandledrejection 都会被采集", () => {
    const handlers = stubWindow(false);
    installDiagnostics();

    handlers["error"]({
      message: "脚本异常",
      error: new Error("脚本异常"),
      filename: "app.js",
      lineno: 12,
      colno: 3,
    });
    handlers["unhandledrejection"]({ reason: new Error("未处理的 Promise") });

    const list = getDiagnosticEntries();
    expect(list.some((entry) => entry.target === "window.error" && entry.message.includes("app.js:12:3"))).toBe(true);
    expect(list.some((entry) => entry.target === "unhandledrejection" && entry.message.includes("未处理的 Promise"))).toBe(true);
  });

  it("Tauri 环境下订阅 Rust 事件并将记录写入内存", async () => {
    const captured: { handler: ((event: { payload: unknown }) => void) | null } = { handler: null };
    mockListen.mockImplementation(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      captured.handler = handler;
      return () => {};
    });

    stubWindow(true);
    installDiagnostics();

    await vi.waitFor(() => expect(mockListen).toHaveBeenCalledWith(
      "diagnostics://log",
      expect.any(Function)
    ));

    captured.handler?.({
      payload: {
        timestamp_ms: 1762718400000,
        level: "error",
        target: "ai_detector_lib::commands::probe",
        message: "上游返回 401",
      },
    });

    const entry = getDiagnosticEntries().find((item) => item.target === "ai_detector_lib::commands::probe");
    expect(entry?.level).toBe("error");
    expect(entry?.message).toBe("上游返回 401");
    expect(entry?.timestamp).toBe(1762718400000);
  });

  it("早期错误导入缓冲后卸载临时监听，且不向页面渲染任何内容", () => {
    const stop = vi.fn();
    vi.stubGlobal("window", {
      __AI_DETECTOR_EARLY_ERRORS__: [
        { message: "启动失败 sk-plaintext-123456", timestamp: 1000 },
      ],
      __AI_DETECTOR_STOP_EARLY_CAPTURE__: stop,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    installDiagnostics();

    const entry = getDiagnosticEntries().find((item) => item.target === "bootstrap");
    expect(entry?.message).toContain("启动失败");
    expect(entry?.message).not.toContain("sk-plaintext-123456");
    expect(entry?.timestamp).toBe(1000);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
