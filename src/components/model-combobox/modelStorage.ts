/**
 * 模型存储与配置校验工具函数
 */

export function getModelStorageKey(url: string): string {
  const clean = (url || "").trim().toLowerCase().replace(/\/+$/, "");
  return clean ? `modeltrace_models_${encodeURIComponent(clean)}` : "modeltrace_models_default";
}

export function saveModelsToStorage(url: string, models: string[]): void {
  try {
    const key = getModelStorageKey(url);
    localStorage.setItem(key, JSON.stringify(models));
  } catch (err) {
    console.warn("保存模型列表失败:", err);
  }
}

export function loadSavedModels(url: string): string[] | null {
  try {
    const key = getModelStorageKey(url);
    const data = localStorage.getItem(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    return null;
  }
  return null;
}

export function mergeModelList(saved: string[] | null, remote: string[]): string[] {
  if (saved && saved.length > 0) {
    const remoteSet = new Set(remote);
    const savedSet = new Set(saved);
    const retained = saved.filter((m) => remoteSet.has(m));
    const newlyAdded = remote.filter((m) => !savedSet.has(m));
    return [...retained, ...newlyAdded];
  }
  return remote;
}

export function isValidBaseUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return false;
    if (parsed.hostname.endsWith(".")) return false;
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname);
    const hasDot = parsed.hostname.includes(".");
    if (!isLocalhost && !isIp && !hasDot) return false;
    if (!isLocalhost && !isIp) {
      const parts = parsed.hostname.split(".");
      const tld = parts[parts.length - 1];
      if (tld.length < 2) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isValidApiKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  // 长度至少 8 位，且不包含空白字符与中文字符
  if (trimmed.length < 8) return false;
  if (/[\u4e00-\u9fa5\s]/.test(trimmed)) return false;
  return true;
}
