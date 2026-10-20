import test from "node:test";
import assert from "node:assert/strict";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";

// Mock localStorage for node environment
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

import {
  STORAGE_KEY,
  CONFIG_LIST_STORAGE_KEY,
  ACTIVE_CONFIG_ID_KEY,
} from "../../src/constants.ts";
import { useConfigStore } from "../../src/stores/config.ts";

test("配置凭据修改与 active-config-tag 自动清空测试套件", async (t) => {
  storage.clear();
  setActivePinia(createPinia());
  const store = useConfigStore();
  store.loadConfig();

  const mockItemA = {
    id: "cfg_a_123",
    name: "配置A",
    baseUrl: "https://api.test-a.com",
    apiKey: "sk-key-a",
    apiFormat: "chat_completions",
    modelName: "gpt-4o",
    reasoningEffort: "high",
    stream: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  store.configList = [mockItemA];

  await t.test("应用配置A后，activeConfigId 与 activeConfigName 正确展示", () => {
    store.applyConfig(mockItemA);
    assert.equal(store.activeConfigId, "cfg_a_123");
    assert.equal(store.activeConfigName, "配置A");
    assert.equal(store.config.baseUrl, "https://api.test-a.com");
    assert.equal(store.config.apiKey, "sk-key-a");
  });

  await t.test("仅修改 modelName 时，activeConfigName 保持不变", async () => {
    store.config.modelName = "deepseek-chat";
    await nextTick();
    assert.equal(store.activeConfigId, "cfg_a_123");
    assert.equal(store.activeConfigName, "配置A");
  });

  await t.test("修改 Base URL 后，active-config-tag (activeConfigName) 立即清空，activeConfigId 置空", async () => {
    store.config.baseUrl = "https://api.modified-url.com";
    await nextTick();
    // 计算属性即时清空
    assert.equal(store.activeConfigName, "");
    // watch 侦听器清空 activeConfigId
    assert.equal(store.activeConfigId, null);
  });

  await t.test("在凭据修改状态下打开保存弹窗，配置名称必须同步是空字符串", () => {
    store.openSaveCurrentModal();
    assert.equal(store.isConfigEditModalOpen, true);
    assert.equal(store.editingConfigItem?.name, "");
    assert.equal(store.editingConfigItem?.id, "");
    assert.equal(store.editingConfigItem?.baseUrl, "https://api.modified-url.com");
    store.closeConfigEditModal();
  });

  await t.test("将修改后的 Base URL 改回原配置地址时，active-config-tag (activeConfigName) 与 activeConfigId 自动恢复", async () => {
    store.config.baseUrl = "https://api.test-a.com";
    await nextTick();
    assert.equal(store.activeConfigName, "配置A");
    assert.equal(store.activeConfigId, "cfg_a_123");
  });

  await t.test("重新应用配置A后，修改 API Key，同样清空 activeConfigName 并重置保存弹窗名称为 \"\"", async () => {
    store.applyConfig(mockItemA);
    assert.equal(store.activeConfigId, "cfg_a_123");
    assert.equal(store.activeConfigName, "配置A");

    store.config.apiKey = "sk-new-key-123456";
    await nextTick();
    assert.equal(store.activeConfigName, "");
    assert.equal(store.activeConfigId, null);

    store.openSaveCurrentModal();
    assert.equal(store.editingConfigItem?.name, "");
    assert.equal(store.editingConfigItem?.id, "");
    assert.equal(store.editingConfigItem?.apiKey, "sk-new-key-123456");
    store.closeConfigEditModal();
  });

  await t.test("将修改后的 API Key 改回原密钥时，active-config-tag (activeConfigName) 与 activeConfigId 自动恢复", async () => {
    store.config.apiKey = "sk-key-a";
    await nextTick();
    assert.equal(store.activeConfigName, "配置A");
    assert.equal(store.activeConfigId, "cfg_a_123");
  });

  await t.test("在 pelican 模式下修改 Base URL，同样清空 activeConfigName 与 activeConfigId", async () => {
    store.applyConfig(mockItemA);
    store.setActiveMode("pelican");
    assert.equal(store.activeConfigId, "cfg_a_123");
    assert.equal(store.activeConfigName, "配置A");

    store.pelicanConfig.baseUrl = "https://api.pelican-custom.com";
    await nextTick();
    assert.equal(store.activeConfigName, "");
    assert.equal(store.activeConfigId, null);

    store.openSaveCurrentModal();
    assert.equal(store.editingConfigItem?.name, "");
    store.closeConfigEditModal();
  });

  await t.test("在 pelican 模式下改回原 Base URL，activeConfigName 与 activeConfigId 自动恢复", async () => {
    store.pelicanConfig.baseUrl = "https://api.test-a.com";
    await nextTick();
    assert.equal(store.activeConfigName, "配置A");
    assert.equal(store.activeConfigId, "cfg_a_123");
    store.setActiveMode("probe");
  });

  await t.test("修改 url 后保存为新配置「配置B」，activeConfigId 自动成为新配置 ID 并更新 activeConfigName", async () => {
    store.config.baseUrl = "https://api.pelican-custom.com";
    await nextTick();

    store.handleSaveConfigItem(
      {
        name: "配置B",
        baseUrl: "https://api.pelican-custom.com",
        apiKey: "sk-key-a",
        apiFormat: "chat_completions",
        modelName: "gpt-4o",
        reasoningEffort: "high",
        stream: true,
      },
      undefined,
      false
    );

    assert.equal(store.activeConfigName, "配置B");
    assert.ok(store.activeConfigId !== null);
    assert.ok(store.activeConfigId !== "cfg_a_123");
  });

  await t.test("切换回「配置A」的凭据后，activeConfigName 与 activeConfigId 自动切回「配置A」", async () => {
    store.config.baseUrl = "https://api.test-a.com";
    await nextTick();
    assert.equal(store.activeConfigName, "配置A");
    assert.equal(store.activeConfigId, "cfg_a_123");
  });

  await t.test("loadConfig 启动校验：若缓存表单凭据与缓存 activeConfigId 不一致，清空 activeConfigId", () => {
    // 模拟写入持久化数据：activeConfigId 记录为 cfg_a_123，但表单实际存储的是被修改过的 url
    storage.set(CONFIG_LIST_STORAGE_KEY, JSON.stringify([mockItemA]));
    storage.set(ACTIVE_CONFIG_ID_KEY, "cfg_a_123");
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        baseUrl: "https://api.some-other-domain.com",
        apiKey: "sk-key-a",
      })
    );

    setActivePinia(createPinia());
    const freshStore = useConfigStore();
    freshStore.loadConfig();

    assert.equal(freshStore.activeConfigId, null);
    assert.equal(freshStore.activeConfigName, "");
  });
});
