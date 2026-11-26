export const EXPORT_VAULT_PREFS_STORAGE_KEY = "modeltrace_export_vault_prefs";

export interface ExportVaultPrefs {
  encryptExport: boolean;
  rememberKey: boolean;
  savedKey: string;
}

export const DEFAULT_EXPORT_VAULT_PREFS: ExportVaultPrefs = {
  encryptExport: false,
  rememberKey: false,
  savedKey: "",
};

/**
 * 规范化导出加密偏好：仅当 rememberKey 为 true 时保留 savedKey，避免未授权落盘密钥。
 */
export function normalizeExportVaultPrefs(
  raw: Partial<ExportVaultPrefs> | null | undefined
): ExportVaultPrefs {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_EXPORT_VAULT_PREFS };
  }
  const encryptExport = Boolean(raw.encryptExport);
  const rememberKey = Boolean(raw.rememberKey);
  const savedKey = rememberKey && typeof raw.savedKey === "string" ? raw.savedKey : "";
  return {
    encryptExport,
    rememberKey,
    savedKey,
  };
}

export function loadExportVaultPrefs(): ExportVaultPrefs {
  try {
    const raw = localStorage.getItem(EXPORT_VAULT_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EXPORT_VAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ExportVaultPrefs>;
    return normalizeExportVaultPrefs(parsed);
  } catch {
    return { ...DEFAULT_EXPORT_VAULT_PREFS };
  }
}

export function saveExportVaultPrefs(prefs: ExportVaultPrefs): ExportVaultPrefs {
  const normalized = normalizeExportVaultPrefs(prefs);
  try {
    localStorage.setItem(EXPORT_VAULT_PREFS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // 忽略存储配额或隐私模式异常，不影响当前内存导出流程
  }
  return normalized;
}
