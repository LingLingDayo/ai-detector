import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import {
  generateConfigId,
  isSameConfigIdentity,
  isConfigEqual,
  formatSettingsSummary,
} from "../utils/configHelpers";
import {
  loadStoredConfigs,
  persistConfigList,
  persistCurrentConfig,
  clearCurrentConfigStorage,
  clearActiveConfigIdStorage,
} from "../utils/configStorage";
import { useConfigModal } from "./useConfigModal";
import { useConfig } from "./useConfig";
import {
  STORAGE_KEY,
  CONFIG_LIST_STORAGE_KEY,
  ACTIVE_CONFIG_ID_KEY,
} from "../constants";
import type { ClientConfig, ConfigItem } from "../types";

// Mock localStorage for node environment
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

describe("configHelpers 单元测试", () => {
  it("生成 ID、判断配置身份、配置相等性与设置摘要", () => {
    expect(typeof generateConfigId()).toBe("string");
    expect(generateConfigId().length).toBeGreaterThan(0);

    // isSameConfigIdentity
    expect(
      isSameConfigIdentity(" https://api.com ", "sk-123 ", "https://api.com", "sk-123")
    ).toBe(true);
    expect(isSameConfigIdentity("https://api.com", "sk-1", "https://api.com", "sk-2")).toBe(
      false
    );
    expect(isSameConfigIdentity("", "", "", "")).toBe(false);

    // isConfigEqual
    const cfgA: ClientConfig = {
      baseUrl: "https://api.com",
      apiKey: "sk-1",
      apiFormat: "chat_completions",
      modelName: "gpt-4o",
      reasoningEffort: "high",
      stream: true,
    };
    const itemA: ConfigItem = {
      ...cfgA,
      id: "1",
      name: "A",
      createdAt: 100,
      updatedAt: 100,
    };
    expect(isConfigEqual(cfgA, itemA)).toBe(true);
    expect(isConfigEqual({ ...cfgA, modelName: "gpt-5" }, itemA)).toBe(false);

    // formatSettingsSummary
    expect(formatSettingsSummary(cfgA)).toBe("/v1/chat/completions · 流式");
  });
});

describe("configStorage 单元测试", () => {
  it("持久化、加载与清理配置数据", () => {
    storage.clear();

    const mockItem: ConfigItem = {
      id: "cfg_test_1",
      name: "测试项",
      baseUrl: "https://api.test.com",
      apiKey: "sk-test",
      apiFormat: "chat_completions",
      modelName: "gpt-4o",
      reasoningEffort: "high",
      stream: true,
      createdAt: 1000,
      updatedAt: 1000,
    };

    persistConfigList([mockItem], mockItem.id);
    expect(storage.get(ACTIVE_CONFIG_ID_KEY)).toBe("cfg_test_1");

    persistCurrentConfig({
      baseUrl: "https://api.test.com",
      apiKey: "sk-test",
      apiFormat: "chat_completions",
      modelName: "gpt-4o",
      reasoningEffort: "high",
      stream: true,
    });

    const loaded = loadStoredConfigs();
    expect(loaded.configList).toHaveLength(1);
    expect(loaded.activeConfigId).toBe("cfg_test_1");
    expect(loaded.savedConfig.baseUrl).toBe("https://api.test.com");

    clearCurrentConfigStorage();
    expect(storage.get(STORAGE_KEY)).toBeUndefined();

    clearActiveConfigIdStorage();
    expect(storage.get(ACTIVE_CONFIG_ID_KEY)).toBeUndefined();
  });
});

describe("useConfigModal 单元测试", () => {
  it("管理配置列表与编辑弹窗状态", () => {
    const modal = useConfigModal();
    expect(modal.isConfigListModalOpen.value).toBe(false);
    modal.openConfigListModal();
    expect(modal.isConfigListModalOpen.value).toBe(true);
    modal.closeConfigListModal();
    expect(modal.isConfigListModalOpen.value).toBe(false);

    modal.openSaveCurrentModal({
      activeConfigId: null,
      activeConfigName: "",
      config: {
        baseUrl: "https://url.com",
        apiKey: "sk-key",
        apiFormat: "chat_completions",
        modelName: "m",
        reasoningEffort: "high",
        stream: true,
      },
    });
    expect(modal.isConfigEditModalOpen.value).toBe(true);
    expect(modal.configEditModalMode.value).toBe("save-current");
    expect(modal.editingConfigItem.value?.name).toBe("");
    modal.closeConfigEditModal();
    expect(modal.isConfigEditModalOpen.value).toBe(false);
  });
});

describe("重构后的 useConfig 核心集成逻辑测试", () => {
  let configService: ReturnType<typeof useConfig>;

  const mockItemA: ConfigItem = {
    id: "cfg_a_modular",
    name: "模块配置A",
    baseUrl: "https://api.mod-a.com",
    apiKey: "sk-mod-key-a",
    apiFormat: "chat_completions",
    modelName: "gpt-4o",
    reasoningEffort: "high",
    stream: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeAll(() => {
    storage.clear();
    configService = useConfig();
    configService.loadConfig();
    configService.configList.value = [mockItemA];
  });

  it("应用配置后正确展示名称与ID", () => {
    configService.applyConfig(mockItemA);
    expect(configService.activeConfigId.value).toBe("cfg_a_modular");
    expect(configService.activeConfigName.value).toBe("模块配置A");
  });

  it("修改 Base URL 时，activeConfigName 立即清空，activeConfigId 置空", async () => {
    configService.config.baseUrl = "https://api.mod-changed.com";
    await nextTick();
    expect(configService.activeConfigName.value).toBe("");
    expect(configService.activeConfigId.value).toBeNull();
  });

  it("凭据修改后打开保存弹窗，配置名称同步为空字符串", () => {
    configService.openSaveCurrentModal();
    expect(configService.isConfigEditModalOpen.value).toBe(true);
    expect(configService.editingConfigItem.value?.name).toBe("");
    configService.closeConfigEditModal();
  });

  it("改回原 Base URL 时，activeConfigName 与 activeConfigId 自动恢复", async () => {
    configService.config.baseUrl = "https://api.mod-a.com";
    await nextTick();
    expect(configService.activeConfigName.value).toBe("模块配置A");
    expect(configService.activeConfigId.value).toBe("cfg_a_modular");
  });
});
