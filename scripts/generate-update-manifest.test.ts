import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildUpdateManifest, collectSignedArtifacts } from "./generate-update-manifest.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("generate-update-manifest", () => {
  it("收集已签名产物并生成包含 4 个平台键的 latest.json", () => {
    const dir = makeTempDir("ai-detector-manifest-");
    try {
      fs.writeFileSync(path.join(dir, "AI-Detector_1.3.0_x64-setup.exe"), "nsis");
      fs.writeFileSync(path.join(dir, "AI-Detector_1.3.0_x64-setup.exe.sig"), "nsis-sig\n");
      fs.writeFileSync(path.join(dir, "AI-Detector_1.3.0_x64_zh-CN.msi"), "msi");
      fs.writeFileSync(path.join(dir, "AI-Detector_1.3.0_x64_zh-CN.msi.sig"), "msi-sig\n");
      fs.writeFileSync(path.join(dir, "AI-Detector.exe"), "portable");
      fs.writeFileSync(path.join(dir, "AI-Detector.exe.sig"), "portable-sig\n");

      const artifacts = collectSignedArtifacts(dir);
      const manifest = buildUpdateManifest({
        version: "1.3.0",
        notes: "feat: 自动更新",
        pubDate: "2026-11-26T00:00:00Z",
        downloadBaseUrl: "https://github.com/LingLingDayo/ai-detector/releases/download/v1.3.0",
        artifacts,
      });

      expect(manifest.version).toBe("1.3.0");
      expect(manifest.notes).toBe("feat: 自动更新");
      expect(Object.keys(manifest.platforms)).toEqual([
        "windows-x86_64",
        "windows-x86_64-nsis",
        "windows-x86_64-msi",
        "windows-x86_64-portable",
      ]);
      expect(manifest.platforms["windows-x86_64"].url).toBe(
        "https://github.com/LingLingDayo/ai-detector/releases/download/v1.3.0/AI-Detector_1.3.0_x64-setup.exe"
      );
      expect(manifest.platforms["windows-x86_64-portable"]).toEqual({
        signature: "portable-sig",
        url: "https://github.com/LingLingDayo/ai-detector/releases/download/v1.3.0/AI-Detector.exe",
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("对文件名中的特殊字符进行 URL 编码", () => {
    const manifest = buildUpdateManifest({
      version: "1.3.0",
      notes: "",
      downloadBaseUrl: "https://example.com/releases/download/v1.3.0",
      artifacts: {
        nsis: { fileName: "AI Detector 1.3.0-setup.exe", signature: "sig" },
        msi: null,
        portable: null,
      },
    });
    expect(manifest.platforms["windows-x86_64"].url).toBe(
      "https://example.com/releases/download/v1.3.0/AI%20Detector%201.3.0-setup.exe"
    );
  });

  it("缺少 NSIS 安装包签名时抛出错误", () => {
    expect(() =>
      buildUpdateManifest({
        version: "1.3.0",
        notes: "",
        downloadBaseUrl: "https://example.com/releases/download/v1.3.0",
        artifacts: { nsis: null, msi: null, portable: null },
      })
    ).toThrow(/NSIS/);
  });
});
