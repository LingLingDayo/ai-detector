import test from "node:test";
import assert from "node:assert/strict";
import { ref, nextTick } from "vue";
import {
  generateConfigId,
  isSameConfigIdentity,
  isConfigEqual,
  formatSettingsSummary,
} from "../../src/utils/configHelpers.ts";
import {
  loadStoredConfigs,
  persistConfigList,
  persistCurrentConfig,
  clearCurrentConfigStorage,
  clearActiveConfigIdStorage,
  applyPersistedConfigToTarget,
} from "../../src/utils/configStorage.ts";
import { useConfigModal } from "../../src/composables/useConfigModal.ts";
import { useConfig } from "../../src/composables/useConfig.ts";
import {
  STORAGE_KEY,
  CONFIG_LIST_STORAGE_KEY,
  ACTIVE_CONFIG_ID_KEY,
} from "../../src/constants.ts";

// Mock localStorage for node environment
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

test("configHelpers 单元测试", () => {
  assert.ok(typeof generateConfigId() === "string" && generateConfigId().length > 0);

  // isSameConfigIdentity
  assert.equal(
    isSameConfigIdentity(" https://api.com ", "sk-123 ", "https://api.com", "sk-123"),
    true
  );
  assert.equal(isSameConfigIdentity("https://api.com", "sk-1", "https://api.com", "sk-2"), false);
  assert.equal(isSameConfigIdentity("", "", "", ""), false);

  // isConfigEqual
  const cfgA = {
    baseUrl: "https://api.com",
    apiKey: "sk-1",
    apiFormat: "chat_completions",
    modelName: "gpt-4o",
    reasoningEffort: "high",
    stream: true,
  };
  const itemA = {
    ...cfgA,
    id: "1",
    name: "A",
    createdAt: 100,
    updatedAt: 100,
  };
  assert.equal(isConfigEqual(cfgA, itemA), true);
  assert.equal(isConfigEqual({ ...cfgA, modelName: "gpt-5" }, itemA), false);

  // formatSettingsSummary
  assert.ok(formatSettingsSummary(cfgA).includes("/v1/chat/completions"));
  assert.ok(formatSettingsSummary(cfgA).includes("流式"));
  assert.ok(formatSettingsSummary(cfgA).includes("高"));
});

test("configStorage 单元测试", () => {
  storage.clear();

  const mockItem = {
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
  assert.equal(storage.get(ACTIVE_CONFIG_ID_KEY), "cfg_test_1");

  persistCurrentConfig({
    baseUrl: "https://api.test.com",
    apiKey: "sk-test",
    apiFormat: "chat_completions",
    modelName: "gpt-4o",
    reasoningEffort: "high",
    stream: true,
  });

  const loaded = loadStoredConfigs();
  assert.equal(loaded.configList.length, 1);
  assert.equal(loaded.activeConfigId, "cfg_test_1");
  assert.equal(loaded.savedConfig.baseUrl, "https://api.test.com");

  clearCurrentConfigStorage();
  assert.equal(storage.get(STORAGE_KEY), undefined);

  clearActiveConfigIdStorage();
  assert.equal(storage.get(ACTIVE_CONFIG_ID_KEY), undefined);
});

test("useConfigModal 单元测试", () => {
  const modal = useConfigModal();
  assert.equal(modal.isConfigListModalOpen.value, false);
  modal.openConfigListModal();
  assert.equal(modal.isConfigListModalOpen.value, true);
  modal.closeConfigListModal();
  assert.equal(modal.isConfigListModalOpen.value, false);

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
  assert.equal(modal.isConfigEditModalOpen.value, true);
  assert.equal(modal.configEditModalMode.value, "save-current");
  assert.equal(modal.editingConfigItem.value?.name, "");
  modal.closeConfigEditModal();
  assert.equal(modal.isConfigEditModalOpen.value, false);
});

test("重构后的 useConfig 核心集成逻辑测试", async (t) => {
  storage.clear();
  const configService = useConfig();
  configService.loadConfig();

  const mockItemA = {
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

  configService.configList.value = [mockItemA];

  await t.test("应用配置后正确展示名称与ID", () => {
    configService.applyConfig(mockItemA);
    assert.equal(configService.activeConfigId.value, "cfg_a_modular");
    assert.equal(configService.activeConfigName.value, "模块配置A");
  });

  await t.test("修改 Base URL 时，activeConfigName 立即清空，activeConfigId 置空", async () => {
    configService.config.baseUrl = "https://api.mod-changed.com";
    await nextTick();
    assert.equal(configService.activeConfigName.value, "");
    assert.equal(configService.activeConfigId.value, null);
  });

  await t.test("凭据修改后打开保存弹窗，配置名称同步为空字符串", () => {
    configService.openSaveCurrentModal();
    assert.equal(configService.isConfigEditModalOpen.value, true);
    assert.equal(configService.editingConfigItem.value?.name, "");
    configService.closeConfigEditModal();
  });
});
