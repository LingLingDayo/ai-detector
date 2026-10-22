import type { UnifiedBank } from "../utils/fingerprint";
import rawUnifiedBank from "../data/unified_bank.json" with { type: "json" };

export const FINGERPRINT_UPDATE_AVAILABLE_KEY = "modeltrace_fingerprint_update_available";
export const CUSTOM_UNIFIED_BANK_KEY = "modeltrace_custom_unified_bank";

export const UPSTREAM_BANK_PRIMARY_URL =
  "https://raw.githubusercontent.com/xqy2006/ModelTrace/main/data/unified_bank.json";
export const UPSTREAM_BANK_FALLBACK_URL =
  "https://cdn.jsdelivr.net/gh/xqy2006/ModelTrace@main/data/unified_bank.json";

/**
 * 校验指纹库结构是否合法
 */
export function validateUnifiedBank(bank: unknown): bank is UnifiedBank {
  if (!bank || typeof bank !== "object") return false;
  const b = bank as Record<string, unknown>;
  if (!Array.isArray(b.models) || b.models.length === 0) return false;
  if (!b.calibration || typeof b.calibration !== "object") return false;
  if (!b.robust || typeof b.robust !== "object") return false;
  return true;
}

/**
 * 规范化文本以排除换行符与首尾空白差异
 */
export function normalizeBankText(text: string): string {
  if (typeof text !== "string") return "";
  return text.replace(/\r\n/g, "\n").trim();
}

/**
 * 从本地持久化存储中读取生效中的指纹库（优先使用用户同步的最新缓存，回退为内置打包题库）
 */
export function loadActiveUnifiedBank(): UnifiedBank {
  try {
    if (typeof localStorage !== "undefined") {
      const cached = localStorage.getItem(CUSTOM_UNIFIED_BANK_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (validateUnifiedBank(parsed)) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn("读取自定义指纹库失败，降级回退内置指纹库:", err);
  }
  return rawUnifiedBank as unknown as UnifiedBank;
}

/**
 * 读取当前是否持久化标记为“需要更新”
 */
export function getPersistedUpdateStatus(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(FINGERPRINT_UPDATE_AVAILABLE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * 写入持久化更新状态
 */
export function setPersistedUpdateStatus(hasUpdate: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(FINGERPRINT_UPDATE_AVAILABLE_KEY, hasUpdate ? "true" : "false");
  } catch {
    // 忽略存储异常
  }
}

/**
 * 对比本地指纹库与远端指纹库是否存在实质差异
 */
export function areBanksDifferent(
  localBank: UnifiedBank,
  remoteBank: UnifiedBank,
  localRaw?: string,
  remoteRaw?: string
): boolean {
  if (!localBank || !remoteBank) return true;
  if (!Array.isArray(localBank.models) || !Array.isArray(remoteBank.models)) return true;

  // 1. 模型数量不一致
  if (localBank.models.length !== remoteBank.models.length) return true;

  // 2. 模型清单 ID 存在差异
  const localModelIds = new Set(localBank.models.map((m) => m.id));
  for (const m of remoteBank.models) {
    if (!localModelIds.has(m.id)) return true;
  }

  // 3. 原始文本比对
  if (localRaw && remoteRaw) {
    return normalizeBankText(localRaw) !== normalizeBankText(remoteRaw);
  }

  // 4. 深度 JSON 序列化快速比对
  return JSON.stringify(localBank) !== JSON.stringify(remoteBank);
}

/**
 * 从远端下载指纹库文本并解析校验（支持主通道与 CDN 备用通道，带超时控制）
 */
export async function fetchRemoteUnifiedBank(timeoutMs = 12000): Promise<{
  rawText: string;
  parsedBank: UnifiedBank;
}> {
  const urls = [UPSTREAM_BANK_PRIMARY_URL, UPSTREAM_BANK_FALLBACK_URL];
  let lastError: Error | null = null;

  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 自定义 Cache-Control 头会触发 CORS 预检，改用 fetch 缓存选项
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-cache",
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }

      const rawText = await res.text();
      const parsedBank = JSON.parse(rawText);

      if (!validateUnifiedBank(parsedBank)) {
        throw new Error("下载的指纹库结构不完整或损坏");
      }

      return { rawText, parsedBank };
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("无法连接上游指纹库");
}

/**
 * 检测上游指纹库是否有更新
 */
export async function checkFingerprintUpdate(currentBank?: UnifiedBank): Promise<boolean> {
  const localBank = currentBank || loadActiveUnifiedBank();
  const { rawText: remoteRaw, parsedBank: remoteBank } = await fetchRemoteUnifiedBank();
  return areBanksDifferent(localBank, remoteBank, undefined, remoteRaw);
}

/**
 * 执行指纹库更新并持久化保存
 */
export async function executeFingerprintUpdate(): Promise<UnifiedBank> {
  const { rawText, parsedBank } = await fetchRemoteUnifiedBank();

  // 持久化到 localStorage 并清除更新提示标记
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(CUSTOM_UNIFIED_BANK_KEY, rawText);
    localStorage.setItem(FINGERPRINT_UPDATE_AVAILABLE_KEY, "false");
  }

  return parsedBank;
}
