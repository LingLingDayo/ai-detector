import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordPelicanGif } from "./pelicanGif";

const { invoke, workers } = vi.hoisted(() => ({ invoke: vi.fn(), workers: [] as any[] }));
vi.mock("./api", () => ({ isTauriApp: () => true, getTauriInvoke: () => invoke }));
vi.mock("@tauri-apps/api/core", () => ({ Channel: class { onmessage?: (data: object) => void; } }));

function previewElement() {
  return {
    contentDocument: {
      getAnimations: () => [
        { playState: "running", effect: { getTiming: () => ({ duration: 2000, iterations: Infinity, direction: "normal" }) } },
      ],
      querySelectorAll: () => [],
    },
  } as unknown as HTMLElement;
}

function gifSource(overrides: Partial<{ content: string; contentType: "svg" | "html"; bgTheme: "dark" | "light"; previewElement: HTMLElement | null }> = {}) {
  return {
    content: "<svg><circle cx='10' cy='10' r='5'/></svg>",
    contentType: "svg" as const,
    bgTheme: "dark" as const,
    previewElement: previewElement(),
    ...overrides,
  };
}

beforeEach(() => {
  invoke.mockReset(); workers.length = 0;
  vi.stubGlobal("navigator", { userAgent: "Windows" });
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

describe("离屏渲染 GIF 采集", () => {
  it("构造独立离屏渲染文档并按循环周期采集，不依赖或锁定主窗口视角", async () => {
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") {
        options.onFrame.onmessage({ data: "AA==", timestampMs: 100 });
        return 1;
      }
    });
    const element = previewElement() as HTMLElement & { scrollIntoView?: () => void };
    element.scrollIntoView = vi.fn();

    const blob = await recordPelicanGif(gifSource({ previewElement: element }), { signal: new AbortController().signal });
    expect(blob.type).toBe("image/gif");
    expect(await blob.text()).toBe("GIF89a");
    expect(element.scrollIntoView).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("capture_pelican_frames", expect.objectContaining({
      durationMs: 2000,
      html: expect.stringContaining("window.__PELICAN_RENDER_READY"),
    }));
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[0].postMessage).toHaveBeenCalledWith({
      type: "init",
      width: 640,
      height: 480,
      durationMs: 2000,
    });
    expect(workers[0].postMessage).toHaveBeenCalledWith({
      type: "frame",
      data: "AA==",
      timestampMs: 100,
    });
  });

  it("即使没有挂载预览DOM或窗口已隐藏/滚动，仍能正常离屏导出 GIF", async () => {
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") {
        options.onFrame.onmessage({ data: "AA==", timestampMs: 0 });
        return 1;
      }
    });
    const blob = await recordPelicanGif(
      gifSource({ previewElement: null, contentType: "html", content: "<div>hi</div>", bgTheme: "light" }),
      { signal: new AbortController().signal }
    );
    expect(blob.type).toBe("image/gif");
    expect(invoke.mock.calls[0][1].html).toContain("#ffffff");
  });

  it("原生命令返回后等待异步IPC尾帧，不提前结束编码", async () => {
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") {
        options.onFrame.onmessage({ data: "AA==", timestampMs: 0 });
        setTimeout(() => options.onFrame.onmessage({ data: "AQ==", timestampMs: 1950 }), 10);
        return 2;
      }
    });
    await recordPelicanGif(gifSource(), { signal: new AbortController().signal });
    const messages = workers[0].postMessage.mock.calls.map((call: any[]) => call[0]);
    expect(messages.map((message: { type: string }) => message.type)).toEqual(["init", "frame", "frame", "finish"]);
    expect(messages[2].timestampMs).toBe(1950);
  });

  it("预先取消不创建Worker和原生采集任务", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(recordPelicanGif(gifSource(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(invoke).not.toHaveBeenCalled();
    expect(workers).toHaveLength(0);
  });

  it("支持从历史卡片容器的嵌套 iframe 读取动画周期", async () => {
    const inner = previewElement();
    const wrapper = {
      querySelector: vi.fn((selector: string) => (selector === "iframe" ? inner : null)),
    } as unknown as HTMLElement;
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") {
        options.onFrame.onmessage({ data: "AA==", timestampMs: 0 });
        return 1;
      }
    });

    await recordPelicanGif(gifSource({ previewElement: wrapper }), { signal: new AbortController().signal });
    expect(invoke).toHaveBeenCalledWith("capture_pelican_frames", expect.objectContaining({ durationMs: 2000 }));
  });

  it("识别已播完的有限次动画与 SMIL begin+dur，且单个元素异常不中断其余解析", async () => {
    const element = {
      contentDocument: {
        getAnimations: () => [
          { playState: "finished", effect: { getTiming: () => ({ delay: 1000, duration: 4000, iterations: 1, direction: "normal" }) } },
        ],
        querySelectorAll: () => [
          { getAttribute: () => null, getSimpleDuration: () => { throw new Error("NotSupportedError"); } },
          { getAttribute: (name: string) => ({ dur: "2.5s", begin: "5s", repeatCount: "1" }[name] ?? null), getSimpleDuration: () => 2.5 },
        ],
      },
    } as unknown as HTMLElement;
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") {
        options.onFrame.onmessage({ data: "AA==", timestampMs: 0 });
        return 1;
      }
    });

    await recordPelicanGif(gifSource({ previewElement: element }), { signal: new AbortController().signal });
    expect(invoke).toHaveBeenCalledWith("capture_pelican_frames", expect.objectContaining({ durationMs: 7500 }));
  });

  it("无已挂载预览 DOM 时能从 SVG 源码兜底提取动画周期", async () => {
    invoke.mockImplementation(async (command, options) => {
      if (command === "capture_pelican_frames") {
        options.onFrame.onmessage({ data: "AA==", timestampMs: 0 });
        return 1;
      }
    });

    await recordPelicanGif(
      gifSource({
        previewElement: null,
        content: '<svg><animate dur="6s" repeatCount="indefinite" /><animateTransform begin="2s" dur="5000ms" /></svg>',
      }),
      { signal: new AbortController().signal }
    );
    expect(invoke).toHaveBeenCalledWith("capture_pelican_frames", expect.objectContaining({ durationMs: 7000 }));
  });

  it("无帧明确失败，原生错误也清理Worker", async () => {
    invoke.mockResolvedValue(0);
    await expect(recordPelicanGif(gifSource(), { signal: new AbortController().signal })).rejects.toThrow("未采集到");
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
});
