import { afterEach, describe, expect, it, vi } from "vitest";

// Read GIF block metadata rather than comparing encoder implementation details.
function inspectGif(bytes: Uint8Array) {
  expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe("GIF89a");
  const word = (offset: number) => bytes[offset] | bytes[offset + 1] << 8;
  let offset = 13 + ((bytes[10] & 128) ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0);
  const delays: number[] = [];
  const frames: Array<{ width: number; height: number }> = [];
  const globalPalette = bytes.slice(13, offset);
  const palettes: Uint8Array[] = [];
  let loop: number | undefined;
  function skipBlocks() {
    while (bytes[offset]) offset += bytes[offset] + 1;
    offset++;
  }
  while (bytes[offset] !== 0x3b && offset < bytes.length) {
    const block = bytes[offset++];
    if (block === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9) delays.push(word(offset + 2) * 10);
      if (label === 0xff && new TextDecoder().decode(bytes.subarray(offset + 1, offset + 12)) === "NETSCAPE2.0") {
        loop = word(offset + 14);
      }
      skipBlocks();
    } else if (block === 0x2c) {
      frames.push({ width: word(offset + 4), height: word(offset + 6) });
      const packed = bytes[offset + 8];
      offset += 9;
      const paletteLength = (packed & 128) ? 3 * 2 ** ((packed & 7) + 1) : 0;
      palettes.push(paletteLength ? bytes.slice(offset, offset + paletteLength) : globalPalette);
      offset += paletteLength;
      offset++; // LZW minimum code size
      skipBlocks();
    } else {
      throw new Error(`Unexpected GIF block ${block}`);
    }
  }
  expect(bytes[offset]).toBe(0x3b);
  return { delays, frames, loop, palettes };
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("GIF 编码工作线程", () => {
  it("连续采集后生成 30fps GIF，使用统一调色板并无限循环", async () => {
    const postMessage = vi.fn();
    const scope = { postMessage, onmessage: undefined as unknown as (event: { data: object }) => Promise<void> };
    vi.stubGlobal("self", scope);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2, height: 1, close() {} })));
    let colorIndex = 0;
    vi.stubGlobal("OffscreenCanvas", class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage() { colorIndex++; },
          getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4).map((_, i) =>
            i % 4 === 3 || i % 4 === (colorIndex % 2 === 0 ? 0 : 2) ? 255 : 0) }),
        };
      }
    });
    await import("./pelicanGif.worker");
    await scope.onmessage({ data: { type: "init", width: 2, height: 1, durationMs: 100,
      crop: { x: 0, y: 0, width: 1, height: 1 } } });
    for (const time of [0, 34, 67]) {
      await scope.onmessage({ data: { type: "frame", data: "AA==", time } });
    }
    await scope.onmessage({ data: { type: "finish" } });
    const message = postMessage.mock.calls.at(-1)![0];
    expect(message.type).toBe("done");
    const gif = inspectGif(new Uint8Array(message.bytes));
    expect(gif.frames).toEqual(Array(3).fill({ width: 2, height: 1 }));
    expect(gif.delays).toEqual([30, 40, 30]);
    expect(gif.loop).toBe(0);
    expect(gif.palettes.every(palette => Array.from(palette).join() === Array.from(gif.palettes[0]).join())).toBe(true);
  });
});
