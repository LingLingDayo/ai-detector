import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { sampleGifTimeline } from "./gifTimeline";

interface Frame { data: string; time: number }
interface Settings { width: number; height: number; durationMs: number;
  crop: { x: number; y: number; width: number; height: number } }
const frames: Frame[] = [];
let settings: Settings;

async function bitmap(frame: Frame): Promise<ImageBitmap> {
  const raw = atob(frame.data);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return createImageBitmap(new Blob([bytes], { type: "image/png" }));
}

function draw(context: OffscreenCanvasRenderingContext2D, image: ImageBitmap, width: number, height: number) {
  const { crop } = settings;
  context.drawImage(image, crop.x * image.width, crop.y * image.height,
    crop.width * image.width, crop.height * image.height, 0, 0, width, height);
}

async function finish() {
  const timeline = sampleGifTimeline(frames.map(frame => frame.time), settings.durationMs);
  if (!timeline.length) throw new Error("没有可编码的动画帧");
  const sources = [...new Set(timeline.map(item => item.source))];
  // One palette for the entire animation: include colors that first appear in later frames.
  const thumbnail = new OffscreenCanvas(32, 24);
  const smallContext = thumbnail.getContext("2d", { alpha: false, willReadFrequently: true })!;
  const samples = new Uint8ClampedArray(sources.length * 32 * 24 * 4);
  for (let index = 0; index < sources.length; index++) {
    const image = await bitmap(frames[sources[index]]);
    try { draw(smallContext, image, 32, 24); }
    finally { image.close(); }
    samples.set(smallContext.getImageData(0, 0, 32, 24).data, index * 32 * 24 * 4);
    self.postMessage({ type: "progress", percent: Math.round((index + 1) / sources.length * 25) });
  }
  const palette = quantize(samples, 256);
  const encoder = GIFEncoder();
  const { width, height } = settings;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true })!;
  let previousSource = -1;
  let indexed: Uint8Array = new Uint8Array(0);
  for (let index = 0; index < timeline.length; index++) {
    const item = timeline[index];
    if (item.source !== previousSource) {
      const image = await bitmap(frames[item.source]);
      try { draw(context, image, width, height); }
      finally { image.close(); }
      indexed = applyPalette(context.getImageData(0, 0, width, height).data, palette);
      previousSource = item.source;
    }
    encoder.writeFrame(indexed, width, height, { palette, delay: item.delay, repeat: 0 });
    self.postMessage({ type: "progress", percent: 25 + Math.round((index + 1) / timeline.length * 75) });
  }
  encoder.finish();
  const bytes = encoder.bytes();
  self.postMessage({ type: "done", bytes: bytes.buffer }, { transfer: [bytes.buffer] });
}

self.onmessage = async (event: MessageEvent) => {
  try {
    if (event.data.type === "init") settings = event.data;
    else if (event.data.type === "frame") frames.push(event.data);
    else if (event.data.type === "finish") await finish();
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
