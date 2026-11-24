import { Channel } from "@tauri-apps/api/core";
import { getTauriInvoke, isTauriApp } from "./api";
import { resolveGifDuration } from "./gifTimeline";

interface CaptureFrame { data: string; timestampMs: number }

export function canExportPelicanGif(): boolean {
  return isTauriApp() && typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

function readAnimationPeriods(element: HTMLElement): number[] {
  const periods: number[] = [];
  try {
    const preview = (element as HTMLIFrameElement).contentDocument;
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

export async function recordPelicanGif(element: HTMLElement, { signal }: { signal: AbortSignal }): Promise<Blob> {
  if (signal.aborted) throw new DOMException("下载已取消", "AbortError");
  const invoke = getTauriInvoke();
  if (!canExportPelicanGif() || !invoke) throw new Error("GIF 下载需要 Windows 桌面版");
  // 等待下载菜单和旧提示退场，避免它们出现在作品截图中。
  await new Promise(resolve => setTimeout(resolve, 200));
  if (signal.aborted) throw new DOMException("下载已取消", "AbortError");
  if (element.scrollIntoView) {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (signal.aborted) throw new DOMException("下载已取消", "AbortError");
  const bounds = element.getBoundingClientRect();
  if (!element.isConnected || bounds.width < 1 || bounds.height < 1) throw new Error("预览尚未就绪，请稍后重试");
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  if (viewportWidth < 1 || viewportHeight < 1) throw new Error("预览窗口尺寸无效，请稍后重试");
  const scale = Math.min(1, 640 / bounds.width, 480 / bounds.height);
  const crop = {
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height,
    viewportWidth,
    viewportHeight,
  };
  const initialSource = (element as HTMLIFrameElement).srcdoc;
  const durationMs = resolveGifDuration(readAnimationPeriods(element));
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
  const checkPreview = () => {
    const current = element.getBoundingClientRect();
    if (!element.isConnected || (element as HTMLIFrameElement).srcdoc !== initialSource ||
      window.innerWidth !== viewportWidth || window.innerHeight !== viewportHeight ||
      Math.abs(current.left - crop.x) > 1 || Math.abs(current.top - crop.y) > 1 ||
      Math.abs(current.width - crop.width) > 1 || Math.abs(current.height - crop.height) > 1) {
      fail(new Error("预览已改变，请重新下载 GIF"));
      return false;
    }
    if (document.querySelector?.('[role="dialog"][aria-modal="true"]')) {
      fail(new Error("预览被弹窗遮挡，请关闭后重新下载 GIF"));
      return false;
    }
    if (current.left < 0 || current.top < 0 || current.left + current.width > window.innerWidth + 1 || current.top + current.height > window.innerHeight + 1) {
      fail(new Error("预览未完整显示，请调整窗口后重新下载 GIF"));
      return false;
    }
    const left = Math.max(0, current.left + 1);
    const top = Math.max(0, current.top + 1);
    const right = Math.min(window.innerWidth - 1, current.left + current.width - 1);
    const bottom = Math.min(window.innerHeight - 1, current.top + current.height - 1);
    if (right > left && bottom > top) {
      const innerLeft = left + (right - left) / 4;
      const innerRight = right - (right - left) / 4;
      const innerTop = top + (bottom - top) / 4;
      const innerBottom = bottom - (bottom - top) / 4;
      const points = [[innerLeft, innerTop], [innerRight, innerTop], [innerLeft, innerBottom], [innerRight, innerBottom], [(left + right) / 2, (top + bottom) / 2]];
      if (points.some(([x, y]) => {
        const target = document.elementFromPoint?.(x, y);
        return target && target !== element && !element.contains?.(target);
      })) {
        fail(new Error("预览被弹窗或其他内容遮挡，请关闭后重新下载 GIF"));
        return false;
      }
    }    if (document.hidden) {
      fail(new Error("预览窗口已隐藏，请保持窗口可见后重试"));
      return false;
    }
    return true;
  };
  const channel = new Channel<CaptureFrame>();
  channel.onmessage = frame => {
    if (captureError || signal.aborted || !checkPreview()) return;
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
  window.addEventListener("resize", checkPreview);
  document.addEventListener("visibilitychange", checkPreview);
  const timer = setTimeout(() => fail(new Error("GIF 生成超时，请重试")), 20_000);

  try {
    if (!checkPreview()) throw captureError;
    worker.postMessage({ type: "init", width: Math.max(1, Math.round(bounds.width * scale)),
      height: Math.max(1, Math.round(bounds.height * scale)), durationMs, crop });
    const count = await Promise.race([invoke<number>("capture_pelican_frames", { requestId, durationMs, onFrame: channel }), failure]);
    captureCompleted = true;
    if (captureError) throw captureError;
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("未采集到有效预览画面，请稍后重试");
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
    window.removeEventListener("resize", checkPreview);
    document.removeEventListener("visibilitychange", checkPreview);
    channel.onmessage = () => undefined;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
}
