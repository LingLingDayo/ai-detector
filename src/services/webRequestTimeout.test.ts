import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initTauri, sendProbe } from "./api";
import { sendChat } from "./chat";

describe.each(["probe", "chat"] as const)("%s 浏览器请求生命周期", (service) => {
  let body: ReadableStreamDefaultController<Uint8Array>;
  let requestSignal: AbortSignal;
  const encoder = new TextEncoder();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    await initTauri();
    vi.stubGlobal("fetch", vi.fn(async (_url, options: RequestInit) => {
      requestSignal = options.signal!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          body = controller;
          requestSignal.addEventListener("abort", () => controller.error(requestSignal.reason), { once: true });
        },
      }), { headers: { "Content-Type": "text/event-stream" } });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function send(stream = true, signal?: AbortSignal) {
    const options = {
      baseUrl: "https://api.example.test", apiKey: "test-key", model: "test-model",
      apiFormat: "chat_completions", timeoutSeconds: 5, stream, signal,
    };
    return service === "probe"
      ? sendProbe({ ...options, prompt: "hello" })
      : sendChat({ ...options, messages: [{ role: "user", content: "hello" }] });
  }

  function chunk(text: string) {
    body.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
  }

  it("收到响应头但没有首包时仍然超时", async () => {
    const request = send();
    const assertion = expect(request).rejects.toThrow("首次响应超时");
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(requestSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("同步响应体未传输完成时仍然超时", async () => {
    const request = send(false);
    const assertion = expect(request).rejects.toThrow("同步请求超时");
    await vi.advanceTimersByTimeAsync(0);
    body.enqueue(encoder.encode('{"choices":['));
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("流式分片到达会延长空闲时限，但停流 90 秒后中止", async () => {
    const request = send();
    const assertion = expect(request).rejects.toThrow("90 秒内未收到后续数据分片");
    await vi.advanceTimersByTimeAsync(4_000);
    chunk("hello");
    await vi.advanceTimersByTimeAsync(80_000);
    expect(requestSignal.aborted).toBe(false);
    chunk(" world");
    await vi.advanceTimersByTimeAsync(80_000);
    expect(requestSignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("成功响应会清理计时器和调用方的取消监听器", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const request = send(true, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    chunk("hello");
    body.close();
    await expect(request).resolves.toMatchObject({ text: "hello" });
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("用户取消时保留 AbortError 并清理超时计时器", async () => {
    const controller = new AbortController();
    const request = send(true, controller.signal);
    const assertion = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
