import { APP_VERSION } from "../constants";
import type { SettingsValue } from "../settings/types";
import type {
  CandyHistoryItem,
  ConfigGroup,
  ConfigItem,
  ConnectionHistoryItem,
  PelicanHistoryItem,
  ProbeHistoryItem,
} from "../types";
import {
  decryptVaultPayload,
  encryptVaultPayload,
  inspectVaultHeader,
  isVaultBinary,
} from "../utils/dataVault";
import { createZip, readZip } from "../utils/zip";
import { getTauriInvoke, isTauriApp } from "./api";

export const EXPORT_FORMAT_ID = "ai-detector-data";
export const EXPORT_SCHEMA_VERSION = 1;

export type HistoryCategoryKey = "probe" | "pelican" | "candy" | "connection";

export interface DataSnapshot {
  configGroups: ConfigGroup[];
  configList: ConfigItem[];
  probeHistory: ProbeHistoryItem[];
  pelicanHistory: PelicanHistoryItem[];
  candyHistory: CandyHistoryItem[];
  connectionHistory: ConnectionHistoryItem[];
  settings: Record<string, SettingsValue>;
}

export interface DataSelectionScope {
  selectedGroupIds: Set<string>;
  selectedConfigIds: Set<string>;
  selectedHistoryTypes: Set<HistoryCategoryKey>;
  includeSettings: boolean;
}

export interface ExportOptions {
  encrypt?: boolean;
  userKey?: string;
}

export interface PelicanExportHistoryItem extends Omit<PelicanHistoryItem, "content"> {
  /** 相对于压缩包根目录的图片路径，例如 pelican/20261125-120000_claude_1a2b.svg */
  filePath: string;
}

export interface ExportBundleV1 {
  format: typeof EXPORT_FORMAT_ID;
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  appVersion: string;
  exportedAt: number;
  exportedAtIso: string;
  sections: {
    configs?: {
      groups: ConfigGroup[];
      items: ConfigItem[];
    };
    histories?: {
      probe?: ProbeHistoryItem[];
      pelican?: PelicanExportHistoryItem[];
      candy?: CandyHistoryItem[];
      connection?: ConnectionHistoryItem[];
    };
    settings?: Record<string, SettingsValue>;
  };
}

export interface BuiltExportPackage {
  bytes: Uint8Array;
  fileName: string;
  extension: "json" | "zip" | "aidata";
  innerFormat: "json" | "zip";
  encrypted: boolean;
  hasUserKey: boolean;
  summary: {
    groupCount: number;
    configCount: number;
    probeCount: number;
    pelicanCount: number;
    candyCount: number;
    connectionCount: number;
    hasSettings: boolean;
  };
}

export interface InspectedImportFile {
  fileName: string;
  kind: "json" | "zip" | "encrypted" | "unknown";
  requiresKey: boolean;
  sizeBytes: number;
}

export interface ParsedImportArchive {
  exportedAt: number;
  exportedAtIso: string;
  appVersion: string;
  encrypted: boolean;
  hasUserKey: boolean;
  sourceFormat: "json" | "zip";
  warnings: string[];
  data: DataSnapshot;
}

export interface PickedImportFile {
  fileName: string;
  path: string | null;
  bytes: Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function formatCompactTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function sanitizeFileSegment(raw: string, fallback: string, maxLen = 48): string {
  const cleaned = raw
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
  return (cleaned || fallback).slice(0, maxLen);
}

/**
 * 为导出的鹈鹕 SVG/HTML 历史项生成可读且不重名的相对路径（位于 pelican/ 目录下）。
 */
export function buildPelicanAssetFileName(
  item: PelicanHistoryItem,
  usedPaths: Set<string>
): string {
  const ts = formatCompactTimestamp(item.createdAt || Date.now());
  const modelPart = sanitizeFileSegment(item.modelName || "model", "model", 40);
  const shortId = sanitizeFileSegment(item.id || "item", "item", 8);
  const ext = item.contentType === "html" ? "html" : "svg";

  const base = `pelican/${ts}_${modelPart}_${shortId}`;
  let candidate = `${base}.${ext}`;
  let suffix = 2;
  while (usedPaths.has(candidate)) {
    candidate = `${base}_${suffix}.${ext}`;
    suffix += 1;
  }
  usedPaths.add(candidate);
  return candidate;
}

function resolveDefaultExportFileName(
  summary: BuiltExportPackage["summary"],
  extension: "json" | "zip" | "aidata",
  now: number
): string {
  const ts = formatCompactTimestamp(now);
  const hasConfigs = summary.configCount > 0 || summary.groupCount > 0;
  const totalHistories =
    summary.probeCount +
    summary.pelicanCount +
    summary.candyCount +
    summary.connectionCount;

  let prefix = "ai-detector-backup";
  if (hasConfigs && totalHistories === 0 && !summary.hasSettings) {
    prefix = "ai-detector-configs";
  } else if (!hasConfigs && summary.pelicanCount > 0 && totalHistories === summary.pelicanCount && !summary.hasSettings) {
    prefix = "ai-detector-pelican-history";
  } else if (!hasConfigs && totalHistories > 0 && !summary.hasSettings) {
    prefix = "ai-detector-history";
  }
  return `${prefix}-${ts}.${extension}`;
}

/**
 * 根据用户勾选的数据范围与导出选项，生成 JSON / ZIP / 加密 AIDV 载荷。
 */
export async function buildExportPayload(
  snapshot: DataSnapshot,
  selection: DataSelectionScope,
  options: ExportOptions = {}
): Promise<BuiltExportPackage> {
  const now = Date.now();

  const exportedItems = snapshot.configList.filter((item) =>
    selection.selectedConfigIds.has(item.id)
  );
  const requiredGroupIds = new Set<string>(selection.selectedGroupIds);
  for (const item of exportedItems) {
    if (item.groupId) {
      requiredGroupIds.add(item.groupId);
    }
  }
  const exportedGroups = snapshot.configGroups.filter((grp) =>
    requiredGroupIds.has(grp.id)
  );

  const probe = selection.selectedHistoryTypes.has("probe")
    ? snapshot.probeHistory
    : [];
  const pelican = selection.selectedHistoryTypes.has("pelican")
    ? snapshot.pelicanHistory
    : [];
  const candy = selection.selectedHistoryTypes.has("candy")
    ? snapshot.candyHistory
    : [];
  const connection = selection.selectedHistoryTypes.has("connection")
    ? snapshot.connectionHistory
    : [];

  const hasConfigsSection = exportedGroups.length > 0 || exportedItems.length > 0;
  const hasHistoriesSection =
    probe.length > 0 || pelican.length > 0 || candy.length > 0 || connection.length > 0;
  const hasSettings = selection.includeSettings;

  if (!hasConfigsSection && !hasHistoriesSection && !hasSettings) {
    throw new Error("请至少勾选一项要导出的数据");
  }

  const bundle: ExportBundleV1 = {
    format: EXPORT_FORMAT_ID,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now,
    exportedAtIso: new Date(now).toISOString(),
    sections: {},
  };

  if (hasConfigsSection) {
    bundle.sections.configs = {
      groups: exportedGroups,
      items: exportedItems,
    };
  }

  if (hasHistoriesSection) {
    bundle.sections.histories = {};
    if (probe.length > 0) bundle.sections.histories.probe = probe;
    if (candy.length > 0) bundle.sections.histories.candy = candy;
    if (connection.length > 0) bundle.sections.histories.connection = connection;
  }

  if (hasSettings) {
    bundle.sections.settings = { ...snapshot.settings };
  }

  const hasPelicanAssets = pelican.length > 0;
  let innerFormat: "json" | "zip" = "json";
  let plainBytes: Uint8Array;

  if (hasPelicanAssets) {
    innerFormat = "zip";
    const usedPaths = new Set<string>();
    const zipEntries: Array<{ path: string; data: string; modifiedAt?: Date }> = [];
    const pelicanExports: PelicanExportHistoryItem[] = [];

    for (const item of pelican) {
      const filePath = buildPelicanAssetFileName(item, usedPaths);
      const { content, ...rest } = item;
      pelicanExports.push({
        ...rest,
        filePath,
      });
      zipEntries.push({
        path: filePath,
        data: content,
        modifiedAt: item.createdAt ? new Date(item.createdAt) : new Date(now),
      });
    }

    if (!bundle.sections.histories) {
      bundle.sections.histories = {};
    }
    bundle.sections.histories.pelican = pelicanExports;

    const jsonText = JSON.stringify(bundle, null, 2);
    zipEntries.unshift({
      path: "data.json",
      data: jsonText,
      modifiedAt: new Date(now),
    });
    plainBytes = await createZip(zipEntries);
  } else {
    plainBytes = textEncoder.encode(JSON.stringify(bundle, null, 2));
  }

  const encrypt = Boolean(options.encrypt);
  const trimmedKey = options.userKey?.trim() || "";
  const finalBytes = encrypt
    ? await encryptVaultPayload(plainBytes, innerFormat, trimmedKey || undefined)
    : plainBytes;
  const extension: "json" | "zip" | "aidata" = encrypt
    ? "aidata"
    : innerFormat;

  const summary: BuiltExportPackage["summary"] = {
    groupCount: exportedGroups.length,
    configCount: exportedItems.length,
    probeCount: probe.length,
    pelicanCount: pelican.length,
    candyCount: candy.length,
    connectionCount: connection.length,
    hasSettings,
  };

  return {
    bytes: finalBytes,
    fileName: resolveDefaultExportFileName(summary, extension, now),
    extension,
    innerFormat,
    encrypted: encrypt,
    hasUserKey: encrypt && trimmedKey.length > 0,
    summary,
  };
}

function isZipBinary(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}

/**
 * 探测导入文件类型与是否需要自定义密钥。
 */
export function inspectImportFile(bytes: Uint8Array, fileName: string): InspectedImportFile {
  if (isVaultBinary(bytes)) {
    const header = inspectVaultHeader(bytes);
    return {
      fileName,
      kind: "encrypted",
      requiresKey: header.hasUserKey,
      sizeBytes: bytes.length,
    };
  }
  if (isZipBinary(bytes)) {
    return {
      fileName,
      kind: "zip",
      requiresKey: false,
      sizeBytes: bytes.length,
    };
  }
  const trimmed = textDecoder.decode(bytes.subarray(0, 64)).trimStart();
  if (trimmed.startsWith("{")) {
    return {
      fileName,
      kind: "json",
      requiresKey: false,
      sizeBytes: bytes.length,
    };
  }
  return {
    fileName,
    kind: "unknown",
    requiresKey: false,
    sizeBytes: bytes.length,
  };
}

function normalizeZipLookupPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function resolveZipRootAndDataJson(entries: Map<string, Uint8Array>): {
  rootPrefix: string;
  dataJsonBytes: Uint8Array;
} {
  const direct = entries.get("data.json");
  if (direct) {
    return { rootPrefix: "", dataJsonBytes: direct };
  }

  for (const [entryPath, data] of entries.entries()) {
    const parts = entryPath.split("/");
    if (parts.length === 2 && parts[1] === "data.json") {
      return { rootPrefix: `${parts[0]}/`, dataJsonBytes: data };
    }
  }

  throw new Error("压缩包中缺少 data.json 清单文件");
}

function validateAndParseBundle(jsonText: string): ExportBundleV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("数据文件 JSON 解析失败，格式无效");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("数据文件结构无效");
  }
  const obj = parsed as Partial<ExportBundleV1>;
  if (obj.format !== EXPORT_FORMAT_ID) {
    throw new Error("不是有效的 AI Detector 数据备份文件");
  }
  if (typeof obj.schemaVersion !== "number" || obj.schemaVersion > EXPORT_SCHEMA_VERSION) {
    throw new Error(`不支持的备份格式版本 (v${String(obj.schemaVersion)})`);
  }
  if (!obj.sections || typeof obj.sections !== "object") {
    throw new Error("数据备份缺少 sections 内容");
  }
  return obj as ExportBundleV1;
}

/**
 * 解析导入字节（自动识别加密信封、ZIP 压缩包或纯 JSON），并回填鹈鹕测试外部 SVG/HTML 内容。
 */
export async function parseImportPayload(
  bytes: Uint8Array,
  userKey?: string
): Promise<ParsedImportArchive> {
  let encrypted = false;
  let hasUserKey = false;
  let innerBytes = bytes;
  let sourceFormat: "json" | "zip";

  if (isVaultBinary(bytes)) {
    encrypted = true;
    const decrypted = await decryptVaultPayload(bytes, userKey);
    hasUserKey = decrypted.hasUserKey;
    innerBytes = decrypted.plaintext;
    sourceFormat = decrypted.payloadKind;
  } else if (isZipBinary(bytes)) {
    sourceFormat = "zip";
  } else {
    sourceFormat = "json";
  }

  const warnings: string[] = [];
  let bundle: ExportBundleV1;
  let zipEntries: Map<string, Uint8Array> | null = null;
  let zipRootPrefix = "";

  if (sourceFormat === "zip") {
    zipEntries = await readZip(innerBytes);
    const resolved = resolveZipRootAndDataJson(zipEntries);
    zipRootPrefix = resolved.rootPrefix;
    bundle = validateAndParseBundle(textDecoder.decode(resolved.dataJsonBytes));
  } else {
    bundle = validateAndParseBundle(textDecoder.decode(innerBytes));
  }

  const rawConfigs = bundle.sections.configs;
  const configGroups: ConfigGroup[] = Array.isArray(rawConfigs?.groups)
    ? rawConfigs.groups.filter(
        (g): g is ConfigGroup =>
          Boolean(g && typeof g.id === "string" && typeof g.name === "string")
      )
    : [];
  const configList: ConfigItem[] = Array.isArray(rawConfigs?.items)
    ? rawConfigs.items.filter(
        (item): item is ConfigItem =>
          Boolean(
            item &&
              typeof item.id === "string" &&
              typeof item.baseUrl === "string" &&
              typeof item.apiKey === "string"
          )
      )
    : [];

  const rawHistories = bundle.sections.histories;
  const probeHistory: ProbeHistoryItem[] = Array.isArray(rawHistories?.probe)
    ? rawHistories.probe.filter(
        (item): item is ProbeHistoryItem =>
          Boolean(
            item &&
              typeof item.id === "string" &&
              typeof item.prediction === "string" &&
              typeof item.probability === "number"
          )
      )
    : [];

  const candyHistory: CandyHistoryItem[] = Array.isArray(rawHistories?.candy)
    ? rawHistories.candy.filter(
        (item): item is CandyHistoryItem =>
          Boolean(
            item &&
              typeof item.id === "string" &&
              typeof item.passed === "boolean" &&
              Array.isArray(item.diagnostics)
          )
      )
    : [];

  const connectionHistory: ConnectionHistoryItem[] = Array.isArray(rawHistories?.connection)
    ? rawHistories.connection.filter(
        (item): item is ConnectionHistoryItem =>
          Boolean(
            item &&
              typeof item.id === "string" &&
              typeof item.createdAt === "number" &&
              Array.isArray(item.requestModelStats) &&
              Array.isArray(item.responseModelStats)
          )
      )
    : [];

  const pelicanHistory: PelicanHistoryItem[] = [];
  if (Array.isArray(rawHistories?.pelican)) {
    for (const rawItem of rawHistories.pelican as Array<
      PelicanExportHistoryItem & { content?: string }
    >) {
      if (!rawItem || typeof rawItem.id !== "string") continue;
      let resolvedContent = typeof rawItem.content === "string" ? rawItem.content : "";

      if (!resolvedContent && typeof rawItem.filePath === "string" && zipEntries) {
        const lookupKey = normalizeZipLookupPath(rawItem.filePath);
        const entryBytes =
          zipEntries.get(`${zipRootPrefix}${lookupKey}`) ?? zipEntries.get(lookupKey);
        if (entryBytes) {
          resolvedContent = textDecoder.decode(entryBytes);
        } else {
          warnings.push(`鹈鹕历史 ${rawItem.modelName || rawItem.id} 缺失图片文件：${rawItem.filePath}`);
          continue;
        }
      }

      if (!resolvedContent.trim()) {
        continue;
      }

      const { filePath: _ignoredFilePath, ...rest } = rawItem;
      pelicanHistory.push({
        ...rest,
        contentType: rawItem.contentType === "html" ? "html" : "svg",
        content: resolvedContent,
      });
    }
  }

  const settings: Record<string, SettingsValue> =
    bundle.sections.settings && typeof bundle.sections.settings === "object"
      ? { ...bundle.sections.settings }
      : {};

  return {
    exportedAt: typeof bundle.exportedAt === "number" ? bundle.exportedAt : Date.now(),
    exportedAtIso:
      typeof bundle.exportedAtIso === "string" ? bundle.exportedAtIso : "",
    appVersion: typeof bundle.appVersion === "string" ? bundle.appVersion : "",
    encrypted,
    hasUserKey,
    sourceFormat,
    warnings,
    data: {
      configGroups,
      configList,
      probeHistory,
      pelicanHistory,
      candyHistory,
      connectionHistory,
      settings,
    },
  };
}

/**
 * 导出字节流落盘：桌面端唤起原生保存弹窗，浏览器端触发文件下载。
 */
export async function saveExportFile(
  pkg: Pick<BuiltExportPackage, "bytes" | "fileName" | "extension">
): Promise<{ savedPath: string | null; cancelled: boolean }> {
  const filterMap: Record<BuiltExportPackage["extension"], string> = {
    json: "JSON 数据文件",
    zip: "ZIP 压缩包",
    aidata: "AI Detector 加密数据",
  };

  if (isTauriApp()) {
    const invoke = getTauriInvoke();
    if (!invoke) throw new Error("桌面文件接口尚未就绪");
    const savedPath = await invoke<string | null>("save_data_export", {
      defaultFileName: pkg.fileName,
      filterName: filterMap[pkg.extension],
      extensions: [pkg.extension],
      data: Array.from(pkg.bytes),
    });
    if (!savedPath) {
      return { savedPath: null, cancelled: true };
    }
    return { savedPath, cancelled: false };
  }

  const mimeMap: Record<BuiltExportPackage["extension"], string> = {
    json: "application/json",
    zip: "application/zip",
    aidata: "application/octet-stream",
  };
  const blob = new Blob([new Uint8Array(pkg.bytes)], { type: mimeMap[pkg.extension] });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = pkg.fileName;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return { savedPath: null, cancelled: false };
}

/**
 * 选择并读取待导入的数据文件：桌面端唤起原生打开弹窗，浏览器端触发文件选择。
 */
export async function pickImportFile(): Promise<PickedImportFile | null> {
  if (isTauriApp()) {
    const invoke = getTauriInvoke();
    if (!invoke) throw new Error("桌面文件接口尚未就绪");
    const picked = await invoke<{
      fileName: string;
      path: string;
      data: number[];
    } | null>("pick_data_import_file");
    if (!picked) return null;
    return {
      fileName: picked.fileName,
      path: picked.path,
      bytes: new Uint8Array(picked.data),
    };
  }

  return new Promise<PickedImportFile | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.zip,.aidata";
    let settled = false;

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", async () => {
      if (settled) return;
      settled = true;
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        resolve({
          fileName: file.name,
          path: null,
          bytes: new Uint8Array(buffer),
        });
      } catch (err) {
        reject(err);
      }
    });

    input.addEventListener("cancel", () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    });

    document.body.appendChild(input);
    input.click();
  });
}
