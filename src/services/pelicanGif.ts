import { Channel } from "@tauri-apps/api/core";
import { getTauriInvoke, isTauriApp } from "./api";
import { resolveGifDuration } from "./gifTimeline";
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

function readAnimationPeriods(element: HTMLElement | null | undefined): number[] {
  const periods: number[] = [];
  try {
    const preview = resolvePreviewFrame(element)?.contentDocument;
    for (const animation of preview?.getAnimations?.() ?? []) {
      const timing = animation.effect?.getTiming();
      if (animation.playState !== "running" || !timing || timing.iterations !== Infinity || typeof timing.duration !== "number") continue;
      periods.push(timing.duration * (timing.direction?.startsWith("alternate") ? 2 : 1));
    }
    for (const animation of preview?.querySelectorAll<SVGAnimationElement>("animate, animateTransform, animateMotion") ?? []) {
      if (animation.getAttribute("repeatCount") === "indefinite") periods.push(animation.getSimpleDuration() * 1000);
    }
  } catch {
    // 无法读取脚本动画周期时采用短时采集，不扩展成动画编辑器。
  }
  return periods;
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
  const durationMs = resolveGifDuration(readAnimationPeriods(source.previewElement));
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
  const timer = setTimeout(() => fail(new Error("GIF 生成超时，请重试")), 25_000);

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
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("未采集到有效画面，请稍后重试");
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
