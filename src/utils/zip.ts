const textEncoder = new TextEncoder();

export interface ZipWriteEntry {
  path: string;
  data: Uint8Array | string;
  modifiedAt?: Date;
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const UTF8_FLAG = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeZipPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized || normalized.endsWith("/")) {
    throw new Error(`ZIP 条目路径无效: ${rawPath}`);
  }
  if (/^[a-zA-Z]:/.test(normalized) || normalized.includes("\0")) {
    throw new Error(`ZIP 条目包含非法路径: ${rawPath}`);
  }
  const segments = normalized.split("/");
  if (segments.some((seg) => !seg || seg === "." || seg === "..")) {
    throw new Error(`ZIP 条目存在不安全路径: ${rawPath}`);
  }
  return segments.join("/");
}

function encodeDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

async function readStreamBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined" || bytes.length < 64) {
    return null;
  }
  try {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    const readPromise = readStreamBytes(cs.readable as ReadableStream<Uint8Array>);
    await writer.write(new Uint8Array(bytes));
    await writer.close();
    const compressed = await readPromise;
    return compressed.length < bytes.length ? compressed : null;
  } catch {
    return null;
  }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前运行环境不支持 DEFLATE 解压");
  }
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const readPromise = readStreamBytes(ds.readable as ReadableStream<Uint8Array>);
  await writer.write(new Uint8Array(bytes));
  await writer.close();
  return readPromise;
}

interface BuiltZipRecord {
  nameBytes: Uint8Array;
  method: number;
  crc: number;
  compressed: Uint8Array;
  uncompressedSize: number;
  dosTime: number;
  dosDate: number;
  localHeaderOffset: number;
}

/**
 * 将一组条目打包为标准 PKWARE ZIP（优先使用 deflate-raw 压缩，自动处理 UTF-8 文件名与 CRC32）。
 */
export async function createZip(entries: ZipWriteEntry[]): Promise<Uint8Array> {
  const seenPaths = new Set<string>();
  const records: BuiltZipRecord[] = [];
  const localChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const safePath = normalizeZipPath(entry.path);
    if (seenPaths.has(safePath)) {
      throw new Error(`ZIP 中存在重复路径: ${safePath}`);
    }
    seenPaths.add(safePath);

    const rawBytes =
      typeof entry.data === "string" ? textEncoder.encode(entry.data) : entry.data;
    const nameBytes = textEncoder.encode(safePath);
    const crc = crc32(rawBytes);
    const deflated = await deflateRaw(rawBytes);
    const method = deflated ? METHOD_DEFLATE : METHOD_STORE;
    const payload = deflated ?? rawBytes;
    const { dosTime, dosDate } = encodeDosDateTime(entry.modifiedAt ?? new Date());

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, LOCAL_FILE_HEADER_SIG, true);
    view.setUint16(4, 20, true); // version needed: 2.0
    view.setUint16(6, UTF8_FLAG, true);
    view.setUint16(8, method, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, payload.length, true);
    view.setUint32(22, rawBytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    records.push({
      nameBytes,
      method,
      crc,
      compressed: payload,
      uncompressedSize: rawBytes.length,
      dosTime,
      dosDate,
      localHeaderOffset: localOffset,
    });

    localChunks.push(localHeader, payload);
    localOffset += localHeader.length + payload.length;
  }

  const centralChunks: Uint8Array[] = [];
  let centralSize = 0;
  for (const rec of records) {
    const cd = new Uint8Array(46 + rec.nameBytes.length);
    const view = new DataView(cd.buffer);
    view.setUint32(0, CENTRAL_DIR_HEADER_SIG, true);
    view.setUint16(4, 20, true); // version made by
    view.setUint16(6, 20, true); // version needed
    view.setUint16(8, UTF8_FLAG, true);
    view.setUint16(10, rec.method, true);
    view.setUint16(12, rec.dosTime, true);
    view.setUint16(14, rec.dosDate, true);
    view.setUint32(16, rec.crc, true);
    view.setUint32(20, rec.compressed.length, true);
    view.setUint32(24, rec.uncompressedSize, true);
    view.setUint16(28, rec.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, rec.localHeaderOffset, true);
    cd.set(rec.nameBytes, 46);
    centralChunks.push(cd);
    centralSize += cd.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, EOCD_SIG, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, records.length, true);
  eocdView.setUint16(10, records.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, localOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalLength = localOffset + centralSize + eocd.length;
  const output = new Uint8Array(totalLength);
  let cursor = 0;
  for (const chunk of localChunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  for (const chunk of centralChunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  output.set(eocd, cursor);
  return output;
}

function findEocdOffset(bytes: Uint8Array): number {
  const minOffset = Math.max(0, bytes.length - 65557);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= minOffset; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIG) {
      const commentLen = view.getUint16(offset + 20, true);
      if (offset + 22 + commentLen === bytes.length) {
        return offset;
      }
    }
  }
  throw new Error("无效的 ZIP 文件：未找到中央目录结束标记");
}

function decodeZipName(nameBytes: Uint8Array, flags: number): string {
  const isUtf8 = (flags & UTF8_FLAG) !== 0;
  return new TextDecoder(isUtf8 ? "utf-8" : "utf-8", { fatal: false }).decode(nameBytes);
}

/**
 * 解析标准 ZIP 文件为路径 -> 字节映射，含路径穿越防护与 CRC32 校验。
 */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.length < 22) {
    throw new Error("无效的 ZIP 文件：文件过小");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEocdOffset(bytes);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP 条目数超出限制（最多 ${MAX_ZIP_ENTRIES} 个）`);
  }
  if (centralOffset + centralSize > eocdOffset) {
    throw new Error("无效的 ZIP 文件：中央目录越界");
  }

  const result = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > centralOffset + centralSize) {
      throw new Error("无效的 ZIP 文件：中央目录记录截断");
    }
    if (view.getUint32(cursor, true) !== CENTRAL_DIR_HEADER_SIG) {
      throw new Error("无效的 ZIP 文件：中央目录签名不匹配");
    }

    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const nameStart = cursor + 46;
    const nextCursor = nameStart + nameLen + extraLen + commentLen;
    if (nextCursor > centralOffset + centralSize) {
      throw new Error("无效的 ZIP 文件：条目元数据越界");
    }

    const rawName = decodeZipName(bytes.subarray(nameStart, nameStart + nameLen), flags);
    cursor = nextCursor;

    // 跳过目录条目
    if (rawName.endsWith("/")) {
      continue;
    }

    const safePath = normalizeZipPath(rawName);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error("ZIP 解压总大小超出安全限制（100 MiB）");
    }

    if (localHeaderOffset + 30 > centralOffset) {
      throw new Error(`ZIP 条目本地头越界: ${safePath}`);
    }
    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIG) {
      throw new Error(`ZIP 条目本地头签名无效: ${safePath}`);
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset) {
      throw new Error(`ZIP 条目数据越界: ${safePath}`);
    }

    const compressedBytes = bytes.subarray(dataStart, dataEnd);
    let plain: Uint8Array;
    if (method === METHOD_STORE) {
      plain = new Uint8Array(compressedBytes);
    } else if (method === METHOD_DEFLATE) {
      plain = await inflateRaw(compressedBytes);
    } else {
      throw new Error(`不支持的 ZIP 压缩算法 (${method}): ${safePath}`);
    }

    if (plain.length !== uncompressedSize || crc32(plain) !== expectedCrc) {
      throw new Error(`ZIP 文件校验失败（数据已损坏）: ${safePath}`);
    }

    result.set(safePath, plain);
  }

  return result;
}
