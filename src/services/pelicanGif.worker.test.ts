import { afterEach, describe, expect, it, vi } from "vitest";

function inspectGif(bytes: Uint8Array) {
  const word = (offset: number) => bytes[offset] | bytes[offset + 1] << 8;
  expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe("GIF89a");
  const width = word(6), height = word(8);
  let offset = 13 + ((bytes[10] & 128) ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0);
  const palette = bytes.slice(13, offset);
  const delays: number[] = [];
  let frameCount = 0, loop: number | undefined;
  function skipBlocks() { while (bytes[offset]) offset += bytes[offset] + 1; offset++; }
  while (offset < bytes.length && bytes[offset] !== 0x3b) {
    const marker = bytes[offset++];
    if (marker === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9) delays.push(word(offset + 2) * 10);
      if (label === 0xff && new TextDecoder().decode(bytes.slice(offset + 1, offset + 12)) === "NETSCAPE2.0") loop = word(offset + 14);
      skipBlocks();
    } else if (marker === 0x2c) {
      frameCount++;
      const packed = bytes[offset + 8];
      offset += 9;
      offset += (packed & 128) ? 3 * 2 ** ((packed & 7) + 1) : 0;
      offset++;
      skipBlocks();
    } else throw new Error(`GIF block ${marker}`);
  }
  expect(bytes[offset]).toBe(0x3b);
  return { width, height, palette, delays, frameCount, loop };
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("静默采集的GIF编码", () => {
  it("按完整周期无限循环，统一调色板包含后出现颜色，首尾间隔一致", async () => {
    const postMessage = vi.fn();
    const scope = { postMessage, onmessage: undefined as unknown as (event: { data: object }) => Promise<void> };
    vi.stubGlobal("self", scope);
    const close = vi.fn();
    let decoded = 0;
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2, height: 1, color: decoded++, close })));
    vi.stubGlobal("OffscreenCanvas", class {
      constructor(public width: number, public height: number) {}
      getContext() {
        let color = 0;
        return {
          drawImage: (image: { color: number }) => { color = image.color; },
          getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4).map((_, index) =>
            index % 4 === 3 || index % 4 === (color === 0 ? 0 : 2) ? 255 : 0) }),
        };
      }
    });
    await import("./pelicanGif.worker");
    await scope.onmessage({ data: { type: "init", width: 2, height: 1, durationMs: 2000 } });
    await scope.onmessage({ data: { type: "frame", data: "AA==", timestampMs: 100 } });
    await scope.onmessage({ data: { type: "frame", data: "AQ==", timestampMs: 1100 } });
    await scope.onmessage({ data: { type: "finish" } });
    const done = postMessage.mock.calls.at(-1)![0];
    expect(done.type).toBe("done");
    const gif = inspectGif(new Uint8Array(done.bytes));
    expect(gif).toMatchObject({ width: 2, height: 1, frameCount: 40, loop: 0 });
    expect(gif.delays).toEqual(Array(40).fill(50));
    const colors = Array.from({ length: gif.palette.length / 3 }, (_, index) => gif.palette.slice(index * 3, index * 3 + 3));
    expect(colors.some(color => color[0] > 200 && color[2] < 40)).toBe(true);
    expect(colors.some(color => color[2] > 200 && color[0] < 40)).toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls.at(-1)![1]).toEqual([done.bytes]);
  });

  it("PNG解码错误明确返回，不输出损坏GIF", async () => {
    const scope = { postMessage: vi.fn(), onmessage: undefined as unknown as (event: { data: object }) => Promise<void> };
    vi.stubGlobal("self", scope);
    vi.stubGlobal("OffscreenCanvas", class { getContext() { return {}; } });
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("PNG 无效")));
    await import("./pelicanGif.worker");
    await scope.onmessage({ data: { type: "init", width: 2, height: 1, durationMs: 100 } });
    await scope.onmessage({ data: { type: "frame", data: "AA==", timestampMs: 0 } });
    expect(scope.postMessage).toHaveBeenCalledWith({ type: "error", message: "PNG 无效" });
  });

  it("按视口缩放比例从整页截图中裁剪目标预览区域", async () => {
    const scope = { postMessage: vi.fn(), onmessage: undefined as unknown as (event: { data: object }) => Promise<void> };
    vi.stubGlobal("self", scope);
    const drawCalls: unknown[][] = [];
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2000, height: 1800, close: vi.fn() })));
    vi.stubGlobal("OffscreenCanvas", class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return {
          drawImage: (...args: unknown[]) => { drawCalls.push(args); },
          getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }),
        };
      }
    });
    await import("./pelicanGif.worker");
    await scope.onmessage({
      data: {
        type: "init",
        width: 640,
        height: 320,
        durationMs: 100,
        crop: { x: 20, y: 100, width: 800, height: 400, viewportWidth: 1000, viewportHeight: 900 },
      },
    });
    await scope.onmessage({ data: { type: "frame", data: "AA==", timestampMs: 0 } });
    await scope.onmessage({
      data: {
        type: "frame",
        data: "AQ==",
        timestampMs: 50,
        crop: { x: 20, y: 240, width: 800, height: 400, viewportWidth: 1000, viewportHeight: 900 },
      },
    });
    expect(drawCalls[0].slice(1)).toEqual([40, 200, 1600, 800, 0, 0, 640, 320]);
    expect(drawCalls[1].slice(1)).toEqual([40, 200, 1600, 800, 0, 0, 32, 24]);
    expect(drawCalls[2].slice(1)).toEqual([40, 480, 1600, 800, 0, 0, 640, 320]);
    expect(drawCalls[3].slice(1)).toEqual([40, 480, 1600, 800, 0, 0, 32, 24]);
  });

  it("超过6秒的长动画在Worker中按60ms帧间隔编码", async () => {
    const postMessage = vi.fn();
    const scope = { postMessage, onmessage: undefined as unknown as (event: { data: object }) => Promise<void> };
    vi.stubGlobal("self", scope);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2, height: 1, close: vi.fn() })));
    vi.stubGlobal("OffscreenCanvas", class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return {
          drawImage: vi.fn(),
          getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }),
        };
      }
    });
    await import("./pelicanGif.worker");
    await scope.onmessage({ data: { type: "init", width: 2, height: 1, durationMs: 8000 } });
    await scope.onmessage({ data: { type: "frame", data: "AA==", timestampMs: 0 } });
    await scope.onmessage({ data: { type: "finish" } });
    const done = postMessage.mock.calls.at(-1)![0];
    const gif = inspectGif(new Uint8Array(done.bytes));
    expect(gif.frameCount).toBe(134);
    expect(gif.delays.slice(0, 3)).toEqual([60, 60, 60]);
    expect(gif.delays.reduce((sum, delay) => sum + delay, 0)).toBe(8000);
  });
});
