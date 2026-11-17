import { Channel } from "@tauri-apps/api/core";
import { getTauriInvoke, isTauriApp } from "./api";

export function canExportPelicanGif(): boolean {
  return isTauriApp() && /Windows/i.test(navigator.userAgent);
}

export interface PelicanRecordingFrame {
  data: string;
  metadata: { timestamp: number; deviceWidth: number; deviceHeight: number };
}

export async function recordPelicanGif(element: HTMLElement, options: {
  durationSeconds: number;
  signal: AbortSignal;
  onProgress?: (percent: number) => void;
  onPhase?: (phase: "recording" | "encoding") => void;
}): Promise<Blob> {
  const invoke = getTauriInvoke();
  if (!canExportPelicanGif() || !invoke) throw new Error("GIF 导出需要 Windows 桌面版");
  const { signal } = options;
  const checkAbort = () => { if (signal.aborted) throw new DOMException("录制已取消", "AbortError"); };
  checkAbort();
  const bounds = element.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) throw new Error("预览画面尚未就绪");
  if (bounds.left < 0 || bounds.top < 0 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1) {
    throw new Error("预览画面不完整，请保持录制窗口大小后重试");
  }
  const viewport = { width: innerWidth, height: innerHeight };
  const scale = Math.min(1, 640 / bounds.width, 480 / bounds.height);
  const worker = new Worker(new URL("./pelicanGif.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID();
  const durationMs = options.durationSeconds * 1000;
  let firstTime: number | undefined;
  let recording = true;
  let captureError: Error | undefined;
  let resolveOutput!: (bytes: ArrayBuffer) => void;
  let rejectOutput!: (error: Error) => void;
  const output = new Promise<ArrayBuffer>((resolve, reject) => { resolveOutput = resolve; rejectOutput = reject; });
  // The worker can fail while the native recording is still running.
  void output.catch(() => undefined);
  const stop = () => { void invoke("stop_pelican_recording", { requestId }).catch(() => undefined); };
  const abort = () => { stop(); rejectOutput(new DOMException("录制已取消", "AbortError")); };
  const failCapture = (message: string) => { captureError = new Error(message); stop(); };
  const checkViewport = () => {
    if (innerWidth !== viewport.width || innerHeight !== viewport.height) failCapture("窗口尺寸已改变，请重新录制");
    if (document.hidden) failCapture("录制已中断，请保持预览窗口可见后重试");
  };
  const channel = new Channel<number>();
  channel.onmessage = (timestamp) => {
    if (!recording || signal.aborted || captureError) return;
    checkViewport();
    if (captureError) return;
    firstTime ??= timestamp;
    const time = (timestamp - firstTime) * 1000;
    if (time > durationMs) return;
    options.onProgress?.(Math.min(99, Math.round(time / durationMs * 100)));
  };
  worker.onmessage = (event) => {
    if (event.data.type === "error") { captureError = new Error(event.data.message); stop(); rejectOutput(captureError); }
    else if (event.data.type === "progress") options.onProgress?.(event.data.percent);
    else if (event.data.type === "done") resolveOutput(event.data.bytes);
  };
  worker.onerror = event => { captureError = new Error(event.message || "GIF 编码失败"); stop(); rejectOutput(captureError); };
  signal.addEventListener("abort", abort, { once: true });
  window.addEventListener("resize", checkViewport);
  document.addEventListener("visibilitychange", checkViewport);

  try {
    options.onPhase?.("recording");
    worker.postMessage({ type: "init", width: Math.max(1, Math.round(bounds.width * scale)),
      height: Math.max(1, Math.round(bounds.height * scale)), durationMs,
      crop: { x: bounds.left / viewport.width, y: bounds.top / viewport.height,
        width: bounds.width / viewport.width, height: bounds.height / viewport.height },
    });
    const frames = await invoke<PelicanRecordingFrame[]>("record_pelican_frames", { requestId, durationMs, onProgress: channel }).catch(error => {
      if (captureError) throw captureError;
      checkAbort();
      throw error;
    });
    recording = false;
    checkAbort();
    if (captureError) throw captureError;
    if (!frames.length) throw new Error("没有采集到画面，请保持预览窗口可见后重试");
    options.onPhase?.("encoding");
    options.onProgress?.(0);
    const start = frames[0].metadata.timestamp;
    for (const frame of frames) {
      worker.postMessage({ type: "frame", data: frame.data, time: (frame.metadata.timestamp - start) * 1000 });
    }
    worker.postMessage({ type: "finish" });
    const bytes = await output;
    checkAbort();
    return new Blob([bytes], { type: "image/gif" });
  } finally {
    recording = false;
    signal.removeEventListener("abort", abort);
    window.removeEventListener("resize", checkViewport);
    document.removeEventListener("visibilitychange", checkViewport);
    worker.terminate();
  }
}
