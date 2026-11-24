import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { MAX_GIF_DURATION_MS, sampleGifTimeline } from "./gifTimeline";

type CropRect = { x: number; y: number; width: number; height: number; viewportWidth: number; viewportHeight: number };
type Settings = { type: "init"; width: number; height: number; durationMs: number; crop?: CropRect };
type Message = Settings | { type: "frame"; data: string; timestampMs: number } | { type: "finish" };
interface Frame { time: number; pixels: Uint8ClampedArray; sample: Uint8ClampedArray }

const scope = self as unknown as {
  onmessage: (event: MessageEvent<Message>) => Promise<void>;
  postMessage: (message: object, transfer?: Transferable[]) => void;
};
const frames: Frame[] = [];
let settings: Settings;
let context: OffscreenCanvasRenderingContext2D;
let sampleContext: OffscreenCanvasRenderingContext2D;
let firstTimestamp: number | undefined;
let failed = false;
let queue = Promise.resolve();

async function addFrame(message: Extract<Message, { type: "frame" }>): Promise<void> {
  if (frames.length >= 100) throw new Error("GIF 采集帧数超出限制");
  const raw = atob(message.data);
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  try {
    if (settings.crop) {
      const { x, y, width, height, viewportWidth, viewportHeight } = settings.crop;
      const scaleX = image.width / viewportWidth;
      const scaleY = image.height / viewportHeight;
      const sx = Math.max(0, Math.min(image.width - 1, x * scaleX));
      const sy = Math.max(0, Math.min(image.height - 1, y * scaleY));
      const sw = Math.max(1, Math.min(image.width - sx, width * scaleX));
      const sh = Math.max(1, Math.min(image.height - sy, height * scaleY));
      context.drawImage(image, sx, sy, sw, sh, 0, 0, settings.width, settings.height);
      sampleContext.drawImage(image, sx, sy, sw, sh, 0, 0, 32, 24);
    } else {
      context.drawImage(image, 0, 0, settings.width, settings.height);
      sampleContext.drawImage(image, 0, 0, 32, 24);
    }
    firstTimestamp ??= message.timestampMs;
    frames.push({
      time: message.timestampMs - firstTimestamp,
      pixels: context.getImageData(0, 0, settings.width, settings.height).data,
      sample: sampleContext.getImageData(0, 0, 32, 24).data,
    });
  } finally {
    image.close();
  }
}

function finish(): void {
  const timeline = sampleGifTimeline(frames.map(frame => frame.time), settings.durationMs);
  if (!timeline.length) throw new Error("未采集到可编码的预览画面");
  // 全动画共同取色，避免后续出现的新颜色丢失或逐帧调色板闪烁。
  const samples = new Uint8ClampedArray(frames.length * 32 * 24 * 4);
  frames.forEach((frame, index) => samples.set(frame.sample, index * 32 * 24 * 4));
  const palette = quantize(samples, 256);
  const encoder = GIFEncoder();
  let previousSource = -1;
  let indexed: Uint8Array = new Uint8Array(0);
  timeline.forEach((item, index) => {
    if (item.source !== previousSource) {
      indexed = applyPalette(frames[item.source].pixels, palette);
      previousSource = item.source;
    }
    encoder.writeFrame(indexed, settings.width, settings.height, {
      ...(index === 0 ? { palette, repeat: 0 } : {}), delay: item.delay,
    });
  });
  encoder.finish();
  const bytes = Uint8Array.from(encoder.bytes());
  frames.length = 0;
  scope.postMessage({ type: "done", bytes: bytes.buffer }, [bytes.buffer]);
}

async function handle(message: Message): Promise<void> {
  if (message.type === "init") {
    if (!Number.isInteger(message.width) || !Number.isInteger(message.height) || message.width < 1 || message.height < 1 || message.width > 640 || message.height > 480 || message.durationMs < 10 || message.durationMs > MAX_GIF_DURATION_MS) {
      throw new Error("GIF 输出参数无效");
    }
    if (message.crop && (!Number.isFinite(message.crop.x) || !Number.isFinite(message.crop.y) || !Number.isFinite(message.crop.width) || !Number.isFinite(message.crop.height) || !Number.isFinite(message.crop.viewportWidth) || !Number.isFinite(message.crop.viewportHeight) || message.crop.width <= 0 || message.crop.height <= 0 || message.crop.viewportWidth <= 0 || message.crop.viewportHeight <= 0)) {
      throw new Error("GIF 裁剪参数无效");
    }
    settings = message;
    context = new OffscreenCanvas(settings.width, settings.height).getContext("2d", { alpha: false, willReadFrequently: true })!;
    sampleContext = new OffscreenCanvas(32, 24).getContext("2d", { alpha: false, willReadFrequently: true })!;
    if (!context || !sampleContext) throw new Error("GIF 图像编码不可用");
  } else {
    if (!settings) throw new Error("GIF 编码尚未初始化");
    if (message.type === "frame") await addFrame(message);
    else finish();
  }
}

scope.onmessage = event => {
  // PNG解码是异步的；按输入顺序处理，避免finish越过尚未解码的帧。
  queue = queue.then(() => { if (!failed) return handle(event.data); }).catch(error => {
    failed = true;
    frames.length = 0;
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  });
  return queue;
};
