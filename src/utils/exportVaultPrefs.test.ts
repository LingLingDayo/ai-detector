import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EXPORT_VAULT_PREFS,
  EXPORT_VAULT_PREFS_STORAGE_KEY,
  loadExportVaultPrefs,
  normalizeExportVaultPrefs,
  saveExportVaultPrefs,
} from "./exportVaultPrefs";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("exportVaultPrefs 导出加密偏好持久化", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("未持久化时默认关闭加密、不记住密钥且密钥为空", () => {
    expect(loadExportVaultPrefs()).toEqual(DEFAULT_EXPORT_VAULT_PREFS);
  });

  it("未开启记住密钥时，仅持久化加密开关状态且不保存密钥内容", () => {
    saveExportVaultPrefs({
      encryptExport: true,
      rememberKey: false,
      savedKey: "secret-12345",
    });

    const raw = JSON.parse(localStorage.getItem(EXPORT_VAULT_PREFS_STORAGE_KEY) || "{}");
    expect(raw).toEqual({
      encryptExport: true,
      rememberKey: false,
      savedKey: "",
    });
    expect(loadExportVaultPrefs()).toEqual({
      encryptExport: true,
      rememberKey: false,
      savedKey: "",
    });
  });

  it("开启记住密钥后持久化密钥，取消记住密钥时立即擦除存储中的密钥", () => {
    saveExportVaultPrefs({
      encryptExport: true,
      rememberKey: true,
      savedKey: "my-vault-key",
    });
    expect(loadExportVaultPrefs()).toEqual({
      encryptExport: true,
      rememberKey: true,
      savedKey: "my-vault-key",
    });

    saveExportVaultPrefs({
      encryptExport: true,
      rememberKey: false,
      savedKey: "my-vault-key",
    });
    expect(loadExportVaultPrefs()).toEqual({
      encryptExport: true,
      rememberKey: false,
      savedKey: "",
    });
  });

  it("存储内容损坏或被手动篡改出非记住态残留密钥时自动清洗", () => {
    localStorage.setItem(EXPORT_VAULT_PREFS_STORAGE_KEY, "{broken-json");
    expect(loadExportVaultPrefs()).toEqual(DEFAULT_EXPORT_VAULT_PREFS);

    localStorage.setItem(
      EXPORT_VAULT_PREFS_STORAGE_KEY,
      JSON.stringify({ encryptExport: true, rememberKey: false, savedKey: "leaked" })
    );
    expect(loadExportVaultPrefs()).toEqual({
      encryptExport: true,
      rememberKey: false,
      savedKey: "",
    });
    expect(normalizeExportVaultPrefs(null)).toEqual(DEFAULT_EXPORT_VAULT_PREFS);
  });
});
