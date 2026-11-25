import { describe, expect, it } from "vitest";
import { createZip, crc32, readZip } from "./zip";

const decoder = new TextDecoder();

describe("zip 编解码", () => {
  it("支持中文路径、多目录、DEFLATE 与 STORE 条目往返", async () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${"<circle cx='50' cy='50' r='40'/>".repeat(12)}</svg>`;
    const jsonContent = JSON.stringify({ format: "ai-detector-data", count: 2 }, null, 2);

    const archive = await createZip([
      { path: "data.json", data: jsonContent },
      { path: "pelican/20261125-120000_鹈鹕模型_abcd.svg", data: svgContent },
      { path: "pelican/tiny.svg", data: "<svg/>" },
      { path: "empty.txt", data: new Uint8Array(0) },
    ]);

    expect(archive[0]).toBe(0x50); // 'P'
    expect(archive[1]).toBe(0x4b); // 'K'

    const extracted = await readZip(archive);
    expect(extracted.size).toBe(4);
    expect(decoder.decode(extracted.get("data.json")!)).toBe(jsonContent);
    expect(decoder.decode(extracted.get("pelican/20261125-120000_鹈鹕模型_abcd.svg")!)).toBe(
      svgContent
    );
    expect(decoder.decode(extracted.get("pelican/tiny.svg")!)).toBe("<svg/>");
    expect(extracted.get("empty.txt")!.length).toBe(0);
  });

  it("拒绝损坏的 CRC32 校验", async () => {
    const archive = await createZip([{ path: "hello.txt", data: "hello world" }]);
    const corrupted = new Uint8Array(archive);
    // 篡改本地文件数据区域中最后一个字节之前的内容
    const textIndex = new TextDecoder().decode(corrupted).indexOf("hello world");
    expect(textIndex).toBeGreaterThan(0);
    corrupted[textIndex] ^= 0xff;

    await expect(readZip(corrupted)).rejects.toThrow("校验失败");
  });

  it("拦截路径穿越与非法路径", async () => {
    await expect(
      createZip([{ path: "../evil.txt", data: "bad" }])
    ).rejects.toThrow("不安全路径");

    await expect(
      createZip([{ path: "C:/evil.txt", data: "bad" }])
    ).rejects.toThrow("非法路径");
  });

  it("crc32 计算与标准 IEEE 值一致", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(crc32(bytes)).toBe(0xcbf43926);
  });
});
