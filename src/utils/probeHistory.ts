import type { ProbeHistoryItem } from "../types";
import { PROBE_HISTORY_STORAGE_KEY } from "../constants";

export const MAX_PROBE_HISTORY_COUNT = 60;

export function loadInitialProbeHistory(): ProbeHistoryItem[] {
  try {
    const raw = localStorage.getItem(PROBE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is ProbeHistoryItem =>
          Boolean(item && typeof item.prediction === "string" && typeof item.probability === "number")
      );
    }
  } catch (err) {
    console.error("加载模型测试历史记录失败:", err);
  }
  return [];
}

export function persistProbeHistory(list: ProbeHistoryItem[]): void {
  try {
    localStorage.setItem(PROBE_HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("保存模型测试历史记录失败:", err);
  }
}

export function generateProbeHistoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `probe_hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createProbeHistoryRecord(
  item: Omit<ProbeHistoryItem, "id" | "createdAt">
): ProbeHistoryItem {
  return {
    ...item,
    id: generateProbeHistoryId(),
    createdAt: Date.now(),
  };
}

export function clearProbeHistoryStorage(): void {
  try {
    localStorage.removeItem(PROBE_HISTORY_STORAGE_KEY);
  } catch {
    // 忽略存储删除异常
  }
}
