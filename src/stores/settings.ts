import { defineStore } from "pinia";
import { computed, reactive, watch } from "vue";
import { settingsPages } from "../settings";
import type { AppTheme, SettingsContext, SettingsValue } from "../settings/types";
import type { ActiveTestMode, ConnectionTestMode } from "../types";
import { CONNECTION_MODE_STORAGE_KEY } from "../constants";

const STORAGE_KEY = "modeltrace_settings";

function collectDefaultValues(): Record<string, SettingsValue> {
  const defaults: Record<string, SettingsValue> = {};
  for (const page of settingsPages) {
    for (const section of page.sections) {
      for (const field of section.fields) {
        defaults[field.key] = field.defaultValue;
      }
    }
  }
  return defaults;
}

function loadStoredValues(): Record<string, SettingsValue> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toNumber(value: SettingsValue | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampTimeout(value: SettingsValue | undefined, fallback: number, max: number): number {
  return Math.min(max, Math.max(10, Math.round(toNumber(value, fallback))));
}

export const useSettingsStore = defineStore("settings", () => {
  const defaults = collectDefaultValues();
  const stored = loadStoredValues();
  const values = reactive<Record<string, SettingsValue>>({ ...defaults });

  for (const key of Object.keys(defaults)) {
    if (key in stored) {
      values[key] = stored[key];
    }
  }

  // 旧版本用 dark 表示默认深色，升级后归一为 default，避免与新暗色皮肤混淆
  if (values.theme === "dark") {
    values.theme = "default";
    persist();
  }

  // 迁移早期独立存储的连接测试模式，避免老用户升级后丢失偏好
  if (!("defaultConnectionMode" in stored)) {
    try {
      const legacy = localStorage.getItem(CONNECTION_MODE_STORAGE_KEY);
      if (legacy === "quick" || legacy === "chat") {
        values.defaultConnectionMode = legacy;
      }
    } catch {
      // 存储不可用时使用默认模式
    }
  }

  // 校验并纠正失败重试次数，避免旧版本残存的非预期选项（如 2 次）导致分段选择器无高亮
  const VALID_RETRY_COUNTS: ReadonlySet<SettingsValue> = new Set(["0", "1", "3", "5", 0, 1, 3, 5]);
  if (!VALID_RETRY_COUNTS.has(values.requestRetryCount)) {
    values.requestRetryCount = "3";
    persist();
  }

  const theme = computed<AppTheme>(() => {
    if (values.theme === "light") return "light";
    if (values.theme === "midnight") return "midnight";
    return "default";
  });

  const defaultTestMode = computed<ActiveTestMode>(() => {
    const mode = values.defaultTestMode;
    return mode === "pelican" || mode === "candy" || mode === "connection" ? mode : "probe";
  });

  /** 流式请求等待上游响应的超时（秒） */
  const streamTimeoutSeconds = computed<number>(() =>
    clampTimeout(values.streamTimeoutSeconds, 90, 600)
  );

  /** 非流式请求等待完整响应的超时（秒） */
  const syncTimeoutSeconds = computed<number>(() =>
    clampTimeout(values.syncTimeoutSeconds, 240, 900)
  );

  const requestRetryCount = computed<number>(() => {
    const parsed = Number(values.requestRetryCount);
    return parsed === 0 || parsed === 1 || parsed === 3 || parsed === 5 ? parsed : 3;
  });

  const historyEnabled = computed<boolean>(() => values.historyEnabled !== false);

  /** 单类历史记录保留上限，0 表示不限制 */
  const historyMaxCount = computed<number>(() =>
    Math.max(0, Math.round(toNumber(values.historyMaxCount, 100)))
  );

  const defaultConnectionMode = computed<ConnectionTestMode>(() =>
    values.defaultConnectionMode === "quick" ? "quick" : "chat"
  );

  function resolveRequestTimeout(isStream: boolean): number {
    return isStream ? streamTimeoutSeconds.value : syncTimeoutSeconds.value;
  }

  /** 按历史上限裁剪列表，上限为 0 时不裁剪 */
  function trimHistoryList<T>(list: T[]): T[] {
    return historyMaxCount.value > 0 ? list.slice(0, historyMaxCount.value) : list;
  }

  /** 历史开关开启时追加新记录并按上限裁剪持久化，关闭时返回 null 表示不落盘 */
  function appendHistoryEntry<T>(list: T[], entry: T, persist: (next: T[]) => void): T[] | null {
    if (!historyEnabled.value) return null;
    const next = trimHistoryList([entry, ...list]);
    persist(next);
    return next;
  }

  function getValue(key: string): SettingsValue | undefined {
    return values[key];
  }

  function setValue(key: string, value: SettingsValue): void {
    values[key] = value;
    persist();
  }

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      // 存储不可用时仅保留内存中的设置
    }
  }

  function applyTheme(): void {
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.dataset.theme = theme.value;
    }
  }

  const context: SettingsContext = { values, setValue };

  watch(theme, applyTheme, { immediate: true });

  return {
    values,
    theme,
    context,
    defaultTestMode,
    streamTimeoutSeconds,
    syncTimeoutSeconds,
    requestRetryCount,
    historyEnabled,
    historyMaxCount,
    defaultConnectionMode,
    resolveRequestTimeout,
    trimHistoryList,
    appendHistoryEntry,
    getValue,
    setValue,
  };
});
