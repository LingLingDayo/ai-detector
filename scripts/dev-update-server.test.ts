import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startDevUpdateServer } from "./dev-update-server.js";

describe("dev-update-server", () => {
  it("提供 /latest.json 清单与可下载的便携版测试载荷", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-detector-dev-srv-"));
    const srv = await startDevUpdateServer({
      workDir,
      port: 0,
      version: "9.9.9",
      sizeMb: 0.05,
      rateKbps: 0,
      signFn: () => "mock-sig",
    });

    try {
      const manifestRes = await fetch(srv.endpoint);
      expect(manifestRes.status).toBe(200);
      const manifest = await manifestRes.json();

      expect(manifest.version).toBe("9.9.9");
      expect(manifest.platforms["windows-x86_64-nsis"]).toEqual({
        signature: "mock-sig",
        url: `http://127.0.0.1:${srv.port}/AI-Detector_9.9.9_x64-setup.exe`,
      });
      expect(manifest.platforms["windows-x86_64-portable"]).toEqual({
        signature: "mock-sig",
        url: `http://127.0.0.1:${srv.port}/AI-Detector.exe`,
      });

      const binRes = await fetch(manifest.platforms["windows-x86_64-portable"].url);
      expect(binRes.status).toBe(200);
      const contentLength = Number(binRes.headers.get("content-length"));
      const buf = Buffer.from(await binRes.arrayBuffer());
      expect(buf.length).toBe(contentLength);
      expect(buf.subarray(0, 30).toString("utf-8")).toContain("AI-DETECTOR-DEV-UPDATE-PAYLOAD");
    } finally {
      await srv.close();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
