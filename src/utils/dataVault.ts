const MAGIC = [0x41, 0x49, 0x44, 0x56] as const; // "AIDV"
const FORMAT_VERSION = 1;
const HEADER_SIZE = 40;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

const FLAG_HAS_USER_KEY = 0x01;
const PAYLOAD_JSON = 1;
const PAYLOAD_ZIP = 2;

const ITERATIONS_APP_ONLY = 60_000;
const ITERATIONS_WITH_USER_KEY = 210_000;

// 软件专属领域密钥材料：仅通过本软件派生出的加密密钥才可解开 AIDV 信封
const APP_DOMAIN_PREFIX = "com.aidetector.app:vault:v1";
const APP_PEPPER_PARTS = [
  "7f9a",
  "e3c1",
  "4b82",
  "90d4",
  "1c6e",
  "a5f7",
  "3829",
  "d04b",
];

const textEncoder = new TextEncoder();

export type VaultPayloadKind = "json" | "zip";

export type DataVaultErrorCode =
  | "INVALID_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "KEY_REQUIRED"
  | "DECRYPT_FAILED";

export class DataVaultError extends Error {
  readonly code: DataVaultErrorCode;

  constructor(code: DataVaultErrorCode, message: string) {
    super(message);
    this.name = "DataVaultError";
    this.code = code;
  }
}

export interface VaultHeaderInfo {
  version: number;
  payloadKind: VaultPayloadKind;
  hasUserKey: boolean;
  iterations: number;
  salt: Uint8Array;
  iv: Uint8Array;
  headerBytes: Uint8Array;
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("当前运行环境不支持 Web Crypto 加密接口");
  }
  return subtle;
}

function getAppPepper(): string {
  return APP_PEPPER_PARTS.join("-");
}

function buildKeyMaterial(userKey?: string): Uint8Array {
  const normalizedUserKey = userKey?.trim() ?? "";
  const secret = normalizedUserKey
    ? `${APP_DOMAIN_PREFIX}::${getAppPepper()}::USER::${normalizedUserKey}`
    : `${APP_DOMAIN_PREFIX}::${getAppPepper()}::APP_ONLY`;
  return textEncoder.encode(secret);
}

async function deriveAesGcmKey(
  userKey: string | undefined,
  salt: Uint8Array,
  iterations: number,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const baseKey = await subtle.importKey(
    "raw",
    new Uint8Array(buildKeyMaterial(userKey)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt),
      iterations,
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    usage
  );
}

export function isVaultBinary(bytes: Uint8Array): boolean {
  return (
    bytes.length >= HEADER_SIZE + 16 &&
    bytes[0] === MAGIC[0] &&
    bytes[1] === MAGIC[1] &&
    bytes[2] === MAGIC[2] &&
    bytes[3] === MAGIC[3]
  );
}

export function inspectVaultHeader(bytes: Uint8Array): VaultHeaderInfo {
  if (
    bytes.length < HEADER_SIZE + 16 ||
    bytes[0] !== MAGIC[0] ||
    bytes[1] !== MAGIC[1] ||
    bytes[2] !== MAGIC[2] ||
    bytes[3] !== MAGIC[3]
  ) {
    throw new DataVaultError("INVALID_FORMAT", "不是有效的 AI Detector 加密数据文件");
  }

  const version = bytes[4];
  if (version !== FORMAT_VERSION) {
    throw new DataVaultError(
      "UNSUPPORTED_VERSION",
      `不支持的加密文件版本 (v${version})，请更新软件后重试`
    );
  }

  const kindByte = bytes[5];
  if (kindByte !== PAYLOAD_JSON && kindByte !== PAYLOAD_ZIP) {
    throw new DataVaultError("INVALID_FORMAT", "加密文件载荷类型无效");
  }

  const flags = bytes[6];
  const hasUserKey = (flags & FLAG_HAS_USER_KEY) !== 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const iterations = view.getUint32(8, false);
  if (iterations < 10_000 || iterations > 2_000_000) {
    throw new DataVaultError("INVALID_FORMAT", "加密参数无效或文件已损坏");
  }

  return {
    version,
    payloadKind: kindByte === PAYLOAD_ZIP ? "zip" : "json",
    hasUserKey,
    iterations,
    salt: bytes.subarray(12, 28),
    iv: bytes.subarray(28, 40),
    headerBytes: bytes.subarray(0, HEADER_SIZE),
  };
}

/**
 * 使用软件专属信封（PBKDF2-SHA256 + AES-256-GCM）加密导出载荷。
 * 当不提供 userKey 时，仍使用软件内置密钥保护，且密文仅能通过本软件解密。
 */
export async function encryptVaultPayload(
  plaintext: Uint8Array,
  payloadKind: VaultPayloadKind,
  userKey?: string
): Promise<Uint8Array> {
  const normalizedKey = userKey?.trim() || "";
  const hasUserKey = normalizedKey.length > 0;
  const iterations = hasUserKey ? ITERATIONS_WITH_USER_KEY : ITERATIONS_APP_ONLY;

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const header = new Uint8Array(HEADER_SIZE);
  header[0] = MAGIC[0];
  header[1] = MAGIC[1];
  header[2] = MAGIC[2];
  header[3] = MAGIC[3];
  header[4] = FORMAT_VERSION;
  header[5] = payloadKind === "zip" ? PAYLOAD_ZIP : PAYLOAD_JSON;
  header[6] = hasUserKey ? FLAG_HAS_USER_KEY : 0;
  header[7] = 0;
  const view = new DataView(header.buffer);
  view.setUint32(8, iterations, false);
  header.set(salt, 12);
  header.set(iv, 28);

  const key = await deriveAesGcmKey(normalizedKey || undefined, salt, iterations, ["encrypt"]);
  const cipherBuffer = await getSubtleCrypto().encrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(iv),
      additionalData: new Uint8Array(header),
    },
    key,
    new Uint8Array(plaintext)
  );
  const cipherBytes = new Uint8Array(cipherBuffer);

  const output = new Uint8Array(HEADER_SIZE + cipherBytes.length);
  output.set(header, 0);
  output.set(cipherBytes, HEADER_SIZE);
  return output;
}

/**
 * 解密软件专属 AIDV 加密文件。
 */
export async function decryptVaultPayload(
  bytes: Uint8Array,
  userKey?: string
): Promise<{
  plaintext: Uint8Array;
  payloadKind: VaultPayloadKind;
  hasUserKey: boolean;
}> {
  const info = inspectVaultHeader(bytes);
  const normalizedKey = userKey?.trim() || "";

  if (info.hasUserKey && !normalizedKey) {
    throw new DataVaultError("KEY_REQUIRED", "该加密文件设置了自定义密钥，请输入密钥后解密");
  }

  const key = await deriveAesGcmKey(
    info.hasUserKey ? normalizedKey : undefined,
    info.salt,
    info.iterations,
    ["decrypt"]
  );

  try {
    const plainBuffer = await getSubtleCrypto().decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(info.iv),
        additionalData: new Uint8Array(info.headerBytes),
      },
      key,
      new Uint8Array(bytes.subarray(HEADER_SIZE))
    );
    return {
      plaintext: new Uint8Array(plainBuffer),
      payloadKind: info.payloadKind,
      hasUserKey: info.hasUserKey,
    };
  } catch {
    throw new DataVaultError(
      "DECRYPT_FAILED",
      info.hasUserKey
        ? "解密失败：密钥错误或文件已被篡改"
        : "解密失败：文件不是有效的本软件加密备份或已损坏"
    );
  }
}

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * 生成高熵且易辨识（不含 0/O/1/l/I）的随机加密密钥。
 */
export function generateRandomVaultKey(length: number = 20): string {
  const random = globalThis.crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let i = 0; i < length; i++) {
    result += KEY_ALPHABET[random[i] % KEY_ALPHABET.length];
  }
  return result;
}
