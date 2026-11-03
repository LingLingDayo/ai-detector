import type { CandyHistoryItem } from "../types";
import { CANDY_HISTORY_STORAGE_KEY } from "../constants";

export function loadInitialCandyHistory(): CandyHistoryItem[] {
  try {
    const raw = localStorage.getItem(CANDY_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is CandyHistoryItem =>
          Boolean(
            item &&
              typeof item.passed === "boolean" &&
              typeof item.correctCount === "number" &&
              Array.isArray(item.diagnostics)
          )
      );
    }
  } catch (err) {
    console.error("加载糖果测试历史记录失败:", err);
  }
  return [];
}

export function persistCandyHistory(list: CandyHistoryItem[]): void {
  try {
    localStorage.setItem(CANDY_HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("保存糖果测试历史记录失败:", err);
  }
}

export function generateCandyHistoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `candy_hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createCandyHistoryRecord(
  item: Omit<CandyHistoryItem, "id" | "createdAt">
): CandyHistoryItem {
  return {
    ...item,
    id: generateCandyHistoryId(),
    createdAt: Date.now(),
  };
}

export function clearCandyHistoryStorage(): void {
  try {
    localStorage.removeItem(CANDY_HISTORY_STORAGE_KEY);
  } catch {
    // 忽略存储删除异常
  }
}
