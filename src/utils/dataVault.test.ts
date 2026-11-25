import { describe, expect, it } from "vitest";
import {
  DataVaultError,
  decryptVaultPayload,
  encryptVaultPayload,
  generateRandomVaultKey,
  inspectVaultHeader,
  isVaultBinary,
} from "./dataVault";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("dataVault 软件专属加密信封", () => {
  it("支持无自定义密钥加密与本软件解密（JSON 与 ZIP）", async () => {
    const plain = encoder.encode(JSON.stringify({ secret: "sk-123456", ok: true }));
    const encrypted = await encryptVaultPayload(plain, "json");

    expect(isVaultBinary(encrypted)).toBe(true);
    const info = inspectVaultHeader(encrypted);
    expect(info.payloadKind).toBe("json");
    expect(info.hasUserKey).toBe(false);

    const decrypted = await decryptVaultPayload(encrypted);
    expect(decrypted.payloadKind).toBe("json");
    expect(decrypted.hasUserKey).toBe(false);
    expect(decoder.decode(decrypted.plaintext)).toBe(decoder.decode(plain));
  });

  it("支持自定义密钥加密、缺省拒绝、错误密钥拒绝与正确解密", async () => {
    const plain = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const encrypted = await encryptVaultPayload(plain, "zip", "my-secret-key");

    const info = inspectVaultHeader(encrypted);
    expect(info.payloadKind).toBe("zip");
    expect(info.hasUserKey).toBe(true);

    await expect(decryptVaultPayload(encrypted)).rejects.toMatchObject({
      name: "DataVaultError",
      code: "KEY_REQUIRED",
    });

    await expect(decryptVaultPayload(encrypted, "wrong-key")).rejects.toMatchObject({
      name: "DataVaultError",
      code: "DECRYPT_FAILED",
    });

    const decrypted = await decryptVaultPayload(encrypted, "  my-secret-key  ");
    expect(decrypted.payloadKind).toBe("zip");
    expect(decrypted.hasUserKey).toBe(true);
    expect(Array.from(decrypted.plaintext)).toEqual(Array.from(plain));
  });

  it("篡改 Header 或密文会触发 GCM 认证失败", async () => {
    const plain = encoder.encode("integrity check");
    const encrypted = await encryptVaultPayload(plain, "json", "pass123");

    const tamperedCipher = new Uint8Array(encrypted);
    tamperedCipher[tamperedCipher.length - 1] ^= 0x01;
    await expect(decryptVaultPayload(tamperedCipher, "pass123")).rejects.toBeInstanceOf(
      DataVaultError
    );

    const tamperedHeader = new Uint8Array(encrypted);
    tamperedHeader[7] = 0x99; // reserved byte included in AAD
    await expect(decryptVaultPayload(tamperedHeader, "pass123")).rejects.toBeInstanceOf(
      DataVaultError
    );
  });

  it("非 AIDV 文件返回 INVALID_FORMAT", () => {
    const raw = encoder.encode('{"hello":1}');
    expect(isVaultBinary(raw)).toBe(false);
    expect(() => inspectVaultHeader(raw)).toThrow("不是有效的 AI Detector 加密数据文件");
  });

  it("generateRandomVaultKey 生成指定长度且不包含易混淆字符的密钥", () => {
    const key = generateRandomVaultKey(24);
    expect(key).toHaveLength(24);
    expect(key).not.toMatch(/[0O1lI]/);
  });
});
