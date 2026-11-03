import { afterAll, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { CONNECTION_MODE_STORAGE_KEY } from "../constants";
import { useSettingsStore } from "./settings";

const SETTINGS_STORAGE_KEY = "modeltrace_settings";
const storage = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function newStore() {
  setActivePinia(createPinia());
  return useSettingsStore();
}

describe("settings store 通用设置", () => {
  it("提供全部通用设置的默认值", () => {
    storage.clear();
    const store = newStore();
    expect(store.defaultTestMode).toBe("probe");
    expect(store.streamTimeoutSeconds).toBe(120);
    expect(store.syncTimeoutSeconds).toBe(240);
    expect(store.requestRetryCount).toBe(3);
    expect(store.historyEnabled).toBe(true);
    expect(store.historyMaxCount).toBe(100);
    expect(store.defaultConnectionMode).toBe("chat");
  });

  it("非法的默认测试模式回退为模型测试", () => {
    storage.clear();
    const store = newStore();
    store.setValue("defaultTestMode", "unknown");
    expect(store.defaultTestMode).toBe("probe");
    store.setValue("defaultTestMode", "connection");
    expect(store.defaultTestMode).toBe("connection");
  });

  it("旧版独立存储的连接模式会迁移，已有设置时不被覆盖", () => {
    storage.clear();
    storage.set(CONNECTION_MODE_STORAGE_KEY, "quick");
    const store = newStore();
    expect(store.defaultConnectionMode).toBe("quick");

    store.setValue("defaultConnectionMode", "chat");
    setActivePinia(createPinia());
    expect(useSettingsStore().defaultConnectionMode).toBe("chat");
  });

  it("流式与非流式超时各自独立生效并夹在合法区间", () => {
    storage.clear();
    const store = newStore();
    expect(store.resolveRequestTimeout(true)).toBe(120);
    expect(store.resolveRequestTimeout(false)).toBe(240);

    store.setValue("streamTimeoutSeconds", 30);
    store.setValue("syncTimeoutSeconds", 60);
    expect(store.resolveRequestTimeout(true)).toBe(30);
    expect(store.resolveRequestTimeout(false)).toBe(60);

    store.setValue("streamTimeoutSeconds", 5);
    expect(store.streamTimeoutSeconds).toBe(10);
    store.setValue("syncTimeoutSeconds", 5000);
    expect(store.syncTimeoutSeconds).toBe(900);
  });

  it("历史开关关闭时 appendHistoryEntry 不落盘", () => {
    storage.clear();
    const store = newStore();
    store.setValue("historyEnabled", false);
    const persisted: number[][] = [];
    const result = store.appendHistoryEntry([1, 2], 3, (next) => persisted.push(next));
    expect(result).toBeNull();
    expect(persisted).toHaveLength(0);
  });

  it("历史上限裁剪最旧记录，0 表示不限", () => {
    storage.clear();
    const store = newStore();
    store.setValue("historyMaxCount", 2);
    const persisted: number[][] = [];
    const result = store.appendHistoryEntry([2, 1], 3, (next) => persisted.push(next));
    expect(result).toEqual([3, 2]);
    expect(persisted).toEqual([[3, 2]]);

    store.setValue("historyMaxCount", 0);
    expect(store.appendHistoryEntry([2, 1], 3, () => {})).toEqual([3, 2, 1]);
  });

  it("设置值写入 localStorage 并可在新 store 中恢复", () => {
    storage.clear();
    const store = newStore();
    store.setValue("requestRetryCount", "1");
    store.setValue("historyMaxCount", "50");

    const raw = storage.get(SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    setActivePinia(createPinia());
    const restored = useSettingsStore();
    expect(restored.requestRetryCount).toBe(1);
    expect(restored.historyMaxCount).toBe(50);
  });
});
