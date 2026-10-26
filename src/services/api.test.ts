import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { cancelProbeRequest, initTauri, sendProbe } from "./api";

describe("api 服务模块取消与中断测试套件", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockInvoke.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("当 signal 已处于 aborted 状态时，sendProbe 立即抛出 AbortError", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      sendProbe({
        baseUrl: "https://api.test.com",
        apiKey: "sk-test",
        model: "test-model",
        prompt: "hello",
        apiFormat: "openai",
        signal: controller.signal,
      })
    ).rejects.toThrowError("The user aborted a request.");
  });

  it("当 Tauri 环境下运行中途触发 abort 时，主动调用 cancel_probe_request 并抛出 AbortError", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "send_probe_request") {
        return new Promise((resolve) => setTimeout(resolve, 5000));
      }
      return Promise.resolve();
    });

    vi.stubGlobal("window", {
      isTauri: true,
      __TAURI_INTERNALS__: {},
    });

    await initTauri();

    const controller = new AbortController();
    const probePromise = sendProbe({
      baseUrl: "https://api.test.com",
      apiKey: "sk-test",
      model: "test-model",
      prompt: "hello",
      apiFormat: "openai",
      signal: controller.signal,
    });

    setTimeout(() => {
      controller.abort();
    }, 50);

    await expect(probePromise).rejects.toThrowError("The user aborted a request.");

    expect(mockInvoke).toHaveBeenCalledWith(
      "cancel_probe_request",
      expect.objectContaining({
        requestId: expect.stringMatching(/^probe_/),
      })
    );
  });

  it("cancelProbeRequest 会向 Tauri 下发 cancel_probe_request 命令", async () => {
    mockInvoke.mockResolvedValue(undefined);

    vi.stubGlobal("window", {
      isTauri: true,
      __TAURI_INTERNALS__: {},
    });

    await initTauri();

    await cancelProbeRequest("probe_test_req_123");
    expect(mockInvoke).toHaveBeenCalledWith("cancel_probe_request", {
      requestId: "probe_test_req_123",
    });
  });
});
