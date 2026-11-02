import { defineStore } from "pinia";
import { computed, reactive, watch } from "vue";
import { settingsPages } from "../settings";
import type { SettingsContext, SettingsValue } from "../settings/types";

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

export const useSettingsStore = defineStore("settings", () => {
  const defaults = collectDefaultValues();
  const stored = loadStoredValues();
  const values = reactive<Record<string, SettingsValue>>({ ...defaults });

  for (const key of Object.keys(defaults)) {
    if (key in stored) {
      values[key] = stored[key];
    }
  }

  const theme = computed<"dark" | "light">(() => (values.theme === "light" ? "light" : "dark"));

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
    getValue,
    setValue,
  };
});
