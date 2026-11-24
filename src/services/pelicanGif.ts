import { Channel } from "@tauri-apps/api/core";
import { getTauriInvoke, isTauriApp } from "./api";
import { MAX_GIF_FRAMES, resolveGifDuration } from "./gifTimeline";
import { buildPelicanGifDocument, type PelicanContentType } from "../components/pelican/pelicanPreview";

interface CaptureFrame { data: string; timestampMs: number }

const GIF_RENDER_WIDTH = 640;
const GIF_RENDER_HEIGHT = 480;

export interface RecordPelicanGifSource {
  content: string;
  contentType: PelicanContentType;
  bgTheme?: "dark" | "light";
  previewElement?: HTMLElement | null;
}

export function canExportPelicanGif(): boolean {
  return isTauriApp() && typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

function resolvePreviewFrame(element: HTMLElement | null | undefined): HTMLIFrameElement | null {
  if (!element) return null;
  if (
    typeof (element as HTMLIFrameElement).srcdoc === "string" ||
    (element as HTMLIFrameElement).contentDocument
  ) {
    return element as HTMLIFrameElement;
  }
  return element.querySelector?.("iframe") ?? null;
}

export function parseSvgClockMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value || value === "indefinite" || value === "media") return null;
  if (value.endsWith("ms")) {
    const ms = Number.parseFloat(value.slice(0, -2));
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (value.endsWith("min")) {
    const minutes = Number.parseFloat(value.slice(0, -3));
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : null;
  }
  if (value.endsWith("h")) {
    const hours = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(hours) && hours > 0 ? hours * 3_600_000 : null;
  }
  if (value.endsWith("s")) {
    const seconds = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  }
  if (value.includes(":")) {
    const parts = value.split(":").map(part => Number.parseFloat(part));
    if (parts.some(part => !Number.isFinite(part) || part < 0)) return null;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000 || null;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000 || null;
    return null;
  }
  const plainSeconds = Number.parseFloat(value);
  return Number.isFinite(plainSeconds) && plainSeconds > 0 ? plainSeconds * 1000 : null;
}

function parseSvgBeginMs(raw: string | null | undefined): number {
  if (!raw) return 0;
  let maxBegin = 0;
  for (const token of raw.split(";")) {
    const ms = parseSvgClockMs(token);
    if (ms !== null && ms > maxBegin) maxBegin = ms;
  }
  return maxBegin;
}

function collectSmilTagTiming(
  durAttr: string | null | undefined,
  beginAttr: string | null | undefined,
  repeatAttr: string | null | undefined,
  loopPeriods: number[],
  finiteDurations: number[],
  fallbackDurationMs?: () => number
): void {
  let durMs = parseSvgClockMs(durAttr);
  if (durMs === null && fallbackDurationMs) {
    try {
      const simple = fallbackDurationMs();
      if (Number.isFinite(simple) && simple > 0) durMs = simple;
    } catch {
      // 部分 SVG 节点在无有效 dur 时调用 getSimpleDuration() 会抛 NotSupportedError。
    }
  }
  if (durMs === null || durMs <= 0) return;

  const repeat = repeatAttr?.trim().toLowerCase();
  if (repeat === "indefinite") {
    loopPeriods.push(durMs);
    return;
  }
  const beginMs = parseSvgBeginMs(beginAttr);
  const repeatCount = repeat ? Number.parseFloat(repeat) : 1;
  const count = Number.isFinite(repeatCount) && repeatCount > 0 ? repeatCount : 1;
  finiteDurations.push(beginMs + durMs * count);
}

function readAnimationTiming(
  element: HTMLElement | null | undefined,
  content: string
): { loopPeriods: number[]; finiteDurations: number[] } {
  const loopPeriods: number[] = [];
  const finiteDurations: number[] = [];
  const preview = resolvePreviewFrame(element)?.contentDocument;

  if (preview) {
    try {
      for (const animation of preview.getAnimations?.() ?? []) {
        try {
          const timing = animation.effect?.getTiming();
          if (!timing || typeof timing.duration !== "number" || !Number.isFinite(timing.duration) || timing.duration <= 0) {
            continue;
          }
          if (timing.iterations === Infinity) {
            loopPeriods.push(timing.duration * (timing.direction?.startsWith("alternate") ? 2 : 1));
          } else if (typeof timing.iterations === "number" && Number.isFinite(timing.iterations) && timing.iterations > 0) {
            const delay = typeof timing.delay === "number" && Number.isFinite(timing.delay) && timing.delay > 0 ? timing.delay : 0;
            finiteDurations.push(delay + timing.duration * timing.iterations);
          }
        } catch {
          // 忽略单个异常动画，继续读取其余动画。
        }
      }
    } catch {
      // 忽略 getAnimations 不可用情况。
    }

    try {
      for (const animation of preview.querySelectorAll<SVGAnimationElement>("animate, animateTransform, animateMotion, set") ?? []) {
        try {
          collectSmilTagTiming(
            animation.getAttribute?.("dur"),
            animation.getAttribute?.("begin"),
            animation.getAttribute?.("repeatCount"),
            loopPeriods,
            finiteDurations,
            () => animation.getSimpleDuration() * 1000
          );
        } catch {
          // 单个 SMIL 元素异常不影响其余动画周期采集。
        }
      }
    } catch {
      // 忽略 querySelectorAll 异常。
    }
  } else {
    // 无已挂载预览 DOM 时，直接从源码静态提取 SMIL 动画周期作为兜底。
    const smilTagRegex = /<(?:animate|animateTransform|animateMotion|set)\b([^>]*)>/gi;
    const attrValue = (attrs: string, name: string) => {
      const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attrs);
      return match ? (match[1] ?? match[2]) : null;
    };
    let match: RegExpExecArray | null;
    while ((match = smilTagRegex.exec(content)) !== null) {
      const attrs = match[1] ?? "";
      collectSmilTagTiming(
        attrValue(attrs, "dur"),
        attrValue(attrs, "begin"),
        attrValue(attrs, "repeatCount"),
        loopPeriods,
        finiteDurations
      );
    }
  }

  return { loopPeriods, finiteDurations };
}

export async function recordPelicanGif(
  source: RecordPelicanGifSource,
  { signal }: { signal: AbortSignal }
): Promise<Blob> {
  if (signal.aborted) throw new DOMException("下载已取消", "AbortError");
  const invoke = getTauriInvoke();
  if (!canExportPelicanGif() || !invoke) throw new Error("GIF 下载需要 Windows 桌面版");
  if (!source.content.trim()) throw new Error("没有可导出的图形内容");

  const html = buildPelicanGifDocument(
    { contentType: source.contentType, content: source.content },
    source.bgTheme ?? "dark"
  );
  const timing = readAnimationTiming(source.previewElement, source.content);
  const durationMs = resolveGifDuration(timing.loopPeriods, timing.finiteDurations);
  const requestId = crypto.randomUUID();
  const worker = new Worker(new URL("./pelicanGif.worker.ts", import.meta.url), { type: "module" });
  let captureCompleted = false;
  let captureError: Error | undefined;
  let frameCount = 0;
  let expectedFrameCount: number | undefined;
  let resolveFrames!: () => void;
  const framesDelivered = new Promise<void>(resolve => { resolveFrames = resolve; });
  let rejectFailure!: (error: Error) => void;
  let resolveOutput!: (bytes: ArrayBuffer) => void;
  let rejectOutput!: (error: Error) => void;
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
  const output = new Promise<ArrayBuffer>((resolve, reject) => { resolveOutput = resolve; rejectOutput = reject; });
  void failure.catch(() => undefined);
  void output.catch(() => undefined);
  const stop = () => { void invoke("cancel_pelican_capture", { requestId }).catch(() => undefined); };
  const fail = (error: Error) => { captureError ??= error; stop(); rejectFailure(captureError); rejectOutput(captureError); };
  const abort = () => fail(new DOMException("下载已取消", "AbortError"));

  const channel = new Channel<CaptureFrame>();
  channel.onmessage = frame => {
    if (captureError || signal.aborted) return;
    frameCount++;
    worker.postMessage({ type: "frame", ...frame });
    if (expectedFrameCount !== undefined && frameCount >= expectedFrameCount) resolveFrames();
  };
  worker.onmessage = event => {
    if (event.data.type === "done") resolveOutput(event.data.bytes);
    else if (event.data.type === "error") fail(new Error(event.data.message));
  };
  worker.onerror = event => fail(new Error(event.message || "GIF 编码失败"));
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => fail(new Error("GIF 生成超时，请重试")), 40_000);

  try {
    worker.postMessage({
      type: "init",
      width: GIF_RENDER_WIDTH,
      height: GIF_RENDER_HEIGHT,
      durationMs,
    });
    const count = await Promise.race([
      invoke<number>("capture_pelican_frames", { requestId, html, durationMs, onFrame: channel }),
      failure,
    ]);
    captureCompleted = true;
    if (captureError) throw captureError;
    if (!Number.isInteger(count) || count < 1 || count > MAX_GIF_FRAMES) throw new Error("未采集到有效画面，请稍后重试");
    expectedFrameCount = count;
    if (frameCount >= count) resolveFrames();
    // 大PNG通过异步IPC传输，原生命令返回不代表尾帧已经交付。
    await Promise.race([framesDelivered, failure]);
    worker.postMessage({ type: "finish" });
    const bytes = await Promise.race([output, failure]);
    if (signal.aborted) throw new DOMException("下载已取消", "AbortError");
    return new Blob([bytes], { type: "image/gif" });
  } finally {
    if (!captureCompleted) stop();
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    channel.onmessage = () => undefined;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
}
