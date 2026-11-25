import { describe, expect, it } from "vitest";
import {
  buildExportPayload,
  buildPelicanAssetFileName,
  inspectImportFile,
  parseImportPayload,
  type DataSelectionScope,
  type DataSnapshot,
} from "./dataTransfer";
import { createZip, readZip } from "../utils/zip";

const decoder = new TextDecoder();

function createMockSnapshot(): DataSnapshot {
  return {
    configGroups: [
      { id: "grp_1", name: "主力分组", collapsed: false, createdAt: 1000, updatedAt: 1000 },
      { id: "grp_empty", name: "空分组", collapsed: true, createdAt: 1000, updatedAt: 1000 },
    ],
    configList: [
      {
        id: "cfg_1",
        name: "OpenAI 主力",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-111111",
        apiFormat: "chat_completions",
        modelName: "gpt-4o",
        reasoningEffort: "high",
        stream: true,
        groupId: "grp_1",
      },
      {
        id: "cfg_2",
        name: "未分组账号",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-ant-222222",
        apiFormat: "anthropic",
        modelName: "claude-3-7-sonnet",
        reasoningEffort: "high",
        stream: true,
      },
    ],
    probeHistory: [
      {
        id: "probe_1",
        createdAt: 1732500000000,
        baseUrl: "https://api.openai.com",
        apiKey: "sk-11****11",
        modelName: "gpt-4o",
        reasoningEffort: "high",
        prediction: "gpt-4o",
        predictionName: "GPT-4o",
        probability: 0.96,
        familyPredictionName: "GPT",
        familyProbability: 0.99,
        usedOutputs: 3,
        candidates: [],
      },
    ],
    pelicanHistory: [
      {
        id: "pel_12345678",
        createdAt: 1732500100000,
        baseUrl: "https://api.openai.com",
        apiKey: "sk-11****11",
        modelName: "claude/sonnet:4.5",
        reasoningEffort: "high",
        contentType: "svg",
        content: '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5"/></svg>',
        durationMs: 12300,
      },
      {
        id: "pel_87654321",
        createdAt: 1732500200000,
        baseUrl: "https://api.openai.com",
        apiKey: "sk-11****11",
        modelName: "gpt-5",
        reasoningEffort: "high",
        contentType: "html",
        content: "<!DOCTYPE html><html><body><svg></svg></body></html>",
      },
    ],
    candyHistory: [
      {
        id: "candy_1",
        createdAt: 1732500300000,
        baseUrl: "https://api.openai.com",
        apiKey: "sk-11****11",
        modelName: "o3",
        reasoningEffort: "high",
        passed: true,
        correctCount: 3,
        totalCount: 3,
        accuracy: 1,
        avgDurationMs: 2100,
        totalDurationMs: 6300,
        diagnostics: [],
      },
    ],
    connectionHistory: [
      {
        id: "conn_1",
        createdAt: 1732500400000,
        updatedAt: 1732500400000,
        title: "Hi",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-11****11",
        apiFormat: "chat_completions",
        stream: true,
        userMessageCount: 1,
        requestCount: 1,
        successCount: 1,
        errorCount: 0,
        mismatchCount: 0,
        requestModelStats: [],
        responseModelStats: [],
        inputTokens: 10,
        outputTokens: 20,
        cachedTokens: 0,
        cacheWriteTokens: 0,
        totalDurationMs: 500,
        usageEstimated: false,
      },
    ],
    settings: {
      theme: "light",
      requestRetryCount: "3",
    },
  };
}

describe("dataTransfer 数据导入导出服务", () => {
  it("不包含鹈鹕历史时输出纯 JSON 并可完整往返", async () => {
    const snapshot = createMockSnapshot();
    const selection: DataSelectionScope = {
      selectedGroupIds: new Set(["grp_empty"]),
      selectedConfigIds: new Set(["cfg_1"]),
      selectedHistoryTypes: new Set(["probe", "candy", "connection"]),
      includeSettings: true,
    };

    const pkg = await buildExportPayload(snapshot, selection, { encrypt: false });
    expect(pkg.extension).toBe("json");
    expect(pkg.innerFormat).toBe("json");
    expect(pkg.summary.groupCount).toBe(2); // 自动带出 cfg_1 所属的 grp_1 与空分组 grp_empty
    expect(pkg.summary.configCount).toBe(1);

    const inspected = inspectImportFile(pkg.bytes, pkg.fileName);
    expect(inspected.kind).toBe("json");
    expect(inspected.requiresKey).toBe(false);

    const parsed = await parseImportPayload(pkg.bytes);
    expect(parsed.sourceFormat).toBe("json");
    expect(parsed.encrypted).toBe(false);
    expect(parsed.data.configGroups.map((g) => g.id)).toEqual(["grp_1", "grp_empty"]);
    expect(parsed.data.configList.map((c) => c.id)).toEqual(["cfg_1"]);
    expect(parsed.data.probeHistory).toHaveLength(1);
    expect(parsed.data.candyHistory).toHaveLength(1);
    expect(parsed.data.connectionHistory).toHaveLength(1);
    expect(parsed.data.pelicanHistory).toHaveLength(0);
    expect(parsed.data.settings.theme).toBe("light");
  });

  it("包含鹈鹕历史时输出 ZIP：主目录 data.json 通过 filePath 引用 pelican/ 下的 svg/html", async () => {
    const snapshot = createMockSnapshot();
    const selection: DataSelectionScope = {
      selectedGroupIds: new Set(),
      selectedConfigIds: new Set(),
      selectedHistoryTypes: new Set(["pelican"]),
      includeSettings: false,
    };

    const pkg = await buildExportPayload(snapshot, selection, { encrypt: false });
    expect(pkg.extension).toBe("zip");
    expect(pkg.innerFormat).toBe("zip");

    const zipEntries = await readZip(pkg.bytes);
    expect(zipEntries.has("data.json")).toBe(true);
    const manifest = JSON.parse(decoder.decode(zipEntries.get("data.json")!));
    const pelicanExports = manifest.sections.histories.pelican;
    expect(pelicanExports).toHaveLength(2);
    expect(pelicanExports[0].content).toBeUndefined();
    expect(pelicanExports[0].filePath).toMatch(/^pelican\/.*\.svg$/);
    expect(pelicanExports[1].filePath).toMatch(/^pelican\/.*\.html$/);
    expect(zipEntries.has(pelicanExports[0].filePath)).toBe(true);
    expect(zipEntries.has(pelicanExports[1].filePath)).toBe(true);

    const parsed = await parseImportPayload(pkg.bytes);
    expect(parsed.sourceFormat).toBe("zip");
    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.data.pelicanHistory).toHaveLength(2);
    expect(parsed.data.pelicanHistory[0].content).toBe(snapshot.pelicanHistory[0].content);
    expect(parsed.data.pelicanHistory[1].content).toBe(snapshot.pelicanHistory[1].content);
  });

  it("支持无自定义密钥与有自定义密钥的软件专属加密导出与解密往返", async () => {
    const snapshot = createMockSnapshot();
    const selection: DataSelectionScope = {
      selectedGroupIds: new Set(),
      selectedConfigIds: new Set(["cfg_2"]),
      selectedHistoryTypes: new Set(["pelican"]),
      includeSettings: false,
    };

    // 1. 仅软件密钥加密
    const appOnlyPkg = await buildExportPayload(snapshot, selection, { encrypt: true });
    expect(appOnlyPkg.extension).toBe("aidata");
    expect(appOnlyPkg.hasUserKey).toBe(false);
    const appInspect = inspectImportFile(appOnlyPkg.bytes, appOnlyPkg.fileName);
    expect(appInspect.kind).toBe("encrypted");
    expect(appInspect.requiresKey).toBe(false);

    const appParsed = await parseImportPayload(appOnlyPkg.bytes);
    expect(appParsed.encrypted).toBe(true);
    expect(appParsed.sourceFormat).toBe("zip");
    expect(appParsed.data.pelicanHistory).toHaveLength(2);

    // 2. 自定义密钥加密
    const keyedPkg = await buildExportPayload(snapshot, selection, {
      encrypt: true,
      userKey: "CatSecret!99",
    });
    expect(keyedPkg.hasUserKey).toBe(true);
    const keyedInspect = inspectImportFile(keyedPkg.bytes, keyedPkg.fileName);
    expect(keyedInspect.requiresKey).toBe(true);

    await expect(parseImportPayload(keyedPkg.bytes, "wrong-key")).rejects.toThrow("密钥错误");
    const keyedParsed = await parseImportPayload(keyedPkg.bytes, "CatSecret!99");
    expect(keyedParsed.data.configList[0].id).toBe("cfg_2");
    expect(keyedParsed.data.pelicanHistory).toHaveLength(2);
  });

  it("buildPelicanAssetFileName 对非法字符清洗并在同名冲突时自动递增后缀", () => {
    const used = new Set<string>();
    const item = {
      id: "id_12345678",
      createdAt: 1732500100000,
      baseUrl: "",
      apiKey: "-",
      modelName: "bad/name:model*",
      reasoningEffort: "high",
      contentType: "svg" as const,
      content: "<svg/>",
    };
    const first = buildPelicanAssetFileName(item, used);
    const second = buildPelicanAssetFileName(item, used);
    expect(first).not.toContain(":");
    expect(first).not.toContain("*");
    expect(second).toMatch(/_2\.svg$/);
  });

  it("ZIP 兼容单层根目录且缺失 SVG 时记录 warning 而不崩溃", async () => {
    const manifest = {
      format: "ai-detector-data",
      schemaVersion: 1,
      appVersion: "v1.2.0",
      exportedAt: 1732500100000,
      exportedAtIso: "2024-11-25T00:00:00.000Z",
      sections: {
        histories: {
          pelican: [
            {
              id: "pel_ok",
              createdAt: 1732500100000,
              baseUrl: "https://api.test",
              apiKey: "sk-****",
              modelName: "m1",
              reasoningEffort: "high",
              contentType: "svg",
              filePath: "pelican/ok.svg",
            },
            {
              id: "pel_missing",
              createdAt: 1732500100000,
              baseUrl: "https://api.test",
              apiKey: "sk-****",
              modelName: "m2",
              reasoningEffort: "high",
              contentType: "svg",
              filePath: "pelican/missing.svg",
            },
          ],
        },
      },
    };

    const zipBytes = await createZip([
      { path: "backup/data.json", data: JSON.stringify(manifest) },
      { path: "backup/pelican/ok.svg", data: "<svg>ok</svg>" },
    ]);

    const parsed = await parseImportPayload(zipBytes);
    expect(parsed.data.pelicanHistory).toHaveLength(1);
    expect(parsed.data.pelicanHistory[0].id).toBe("pel_ok");
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain("missing.svg");
  });
});
