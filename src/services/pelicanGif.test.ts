import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordPelicanGif } from "./pelicanGif";

const { invoke, workers } = vi.hoisted(() => ({ invoke: vi.fn(), workers: [] as any[] }));
vi.mock("./api", () => ({ isTauriApp: () => true, getTauriInvoke: () => invoke }));
vi.mock("@tauri-apps/api/core", () => ({ Channel: class { onmessage?: (data: object) => void; } }));

function preview() {
  return {
    isConnected: true, srcdoc: "<svg></svg>",
    contentDocument: { readyState: "complete", getAnimations: () => [{ playState: "running", effect: { getTiming: () => ({ duration: 2000, iterations: Infinity, direction: "normal" }) } }], querySelectorAll: () => [] },
    getBoundingClientRect: () => ({ left: 20, top: 100, width: 800, height: 400 }),
  } as unknown as HTMLElement;
}

beforeEach(() => {
  invoke.mockReset(); workers.length = 0;
  vi.stubGlobal("navigator", { userAgent: "Windows" });
  vi.stubGlobal("scrollX", 0); vi.stubGlobal("scrollY", 50);
  vi.stubGlobal("window", { innerWidth: 1000, innerHeight: 900, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { hidden: false, querySelector: vi.fn(() => null), elementFromPoint: vi.fn(() => null), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("Worker", class {
    onmessage?: (event: { data: object }) => void;
    onerror?: (event: { message: string }) => void;
    terminate = vi.fn();
    constructor() { workers.push(this); }
    postMessage = vi.fn((data: { type: string }) => {
      if (data.type === "finish") this.onmessage?.({ data: { type: "done", bytes: new TextEncoder().encode("GIF89a").buffer } });
    });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("现有预览静默采集", () => {
  it("区域截图按常见循环周期采集，结果交给Worker后释放", async () => {
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") { options.onFrame.onmessage({ data: "AA==", timestampMs: 100 }); return 1; }
    });
    const blob = await recordPelicanGif(preview(), { signal: new AbortController().signal });
    expect(blob.type).toBe("image/gif");
    expect(await blob.text()).toBe("GIF89a");
    expect(invoke).toHaveBeenCalledWith("capture_pelican_frames", expect.objectContaining({
      clip: { x: 20, y: 150, width: 800, height: 400, scale: 0.8 }, durationMs: 2000,
    }));
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[0].postMessage).toHaveBeenCalledWith({ type: "frame", data: "AA==", timestampMs: 100 });
  });

  it("原生命令返回后等待异步IPC尾帧，不提前结束编码", async () => {
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") {
        options.onFrame.onmessage({ data: "AA==", timestampMs: 0 });
        setTimeout(() => options.onFrame.onmessage({ data: "AQ==", timestampMs: 1950 }), 10);
        return 2;
      }
    });
    await recordPelicanGif(preview(), { signal: new AbortController().signal });
    const messages = workers[0].postMessage.mock.calls.map((call: any[]) => call[0]);
    expect(messages.map((message: { type: string }) => message.type)).toEqual(["init", "frame", "frame", "finish"]);
    expect(messages[2].timestampMs).toBe(1950);
  });
  it("静默采集前自动把已有预览移到可见范围，不新建录制界面", async () => {
    const element = preview();
    element.scrollIntoView = vi.fn();
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") { options.onFrame.onmessage({ data: "AA==", timestampMs: 0 }); return 1; }
    });
    await recordPelicanGif(element, { signal: new AbortController().signal });
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest", behavior: "instant" });
  });
  it("预先取消不创建Worker和原生采集任务", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(recordPelicanGif(preview(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(invoke).not.toHaveBeenCalled();
    expect(workers).toHaveLength(0);
  });

  it("预览内容中途切换立即停止，不返回错误画面", async () => {
    const element = preview() as HTMLElement & { srcdoc: string };
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") { element.srcdoc = "<html></html>"; options.onFrame.onmessage({ data: "AA==", timestampMs: 0 }); return 1; }
    });
    await expect(recordPelicanGif(element, { signal: new AbortController().signal })).rejects.toThrow("预览已改变");
    expect(invoke).toHaveBeenCalledWith("cancel_pelican_capture", expect.any(Object));
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it("避开正常预览圆角，不把宿主圆角裁切当成遮挡", async () => {
    const element = preview();
    vi.mocked(document.elementFromPoint).mockImplementation((x, y) => x < 26 && y < 106 ? {} as HTMLElement : element);
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") { options.onFrame.onmessage({ data: "AA==", timestampMs: 0 }); return 1; }
    });
    await expect(recordPelicanGif(element, { signal: new AbortController().signal })).resolves.toMatchObject({ type: "image/gif" });
  });
  it("作品被新打开的弹窗遮挡时停止，不能把弹窗录入GIF", async () => {
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") {
        vi.mocked(document.elementFromPoint).mockReturnValue({ className: "modal-backdrop" } as HTMLElement);
        options.onFrame.onmessage({ data: "AA==", timestampMs: 0 });
        return 1;
      }
    });
    await expect(recordPelicanGif(preview(), { signal: new AbortController().signal })).rejects.toThrow("遮挡");
    expect(workers[0].postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "frame" }));
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it("预览在视口外时也不能在已有模态弹窗下采集", async () => {
    const element = preview();
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left: 20, top: 1100, width: 800, height: 400 } as DOMRect);
    vi.mocked(document.querySelector).mockReturnValue({ role: "dialog" } as unknown as Element);
    invoke.mockResolvedValue(0);
    await expect(recordPelicanGif(element, { signal: new AbortController().signal })).rejects.toThrow("遮挡");
    expect(invoke).not.toHaveBeenCalledWith("capture_pelican_frames", expect.anything());
  });
  it("无帧明确失败，原生错误也清理Worker和事件监听", async () => {
    invoke.mockResolvedValue(0);
    await expect(recordPelicanGif(preview(), { signal: new AbortController().signal })).rejects.toThrow("未采集到");
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(window.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(document.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
