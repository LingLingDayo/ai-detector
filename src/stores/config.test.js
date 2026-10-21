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
} from "../constants.ts";
import { useConfigStore } from "./config.ts";
import { useProbeTestStore } from "./probeTest.ts";
import { usePelicanTestStore } from "./pelicanTest.ts";

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

test("切换不同测试时(test-mode-tabs)配置同步与保持规则测试", async (t) => {
  await t.test("未运行时从 probe 切换到 pelican，顺延继承 probe 配置", () => {
    storage.clear();
    setActivePinia(createPinia());

    const configStore = useConfigStore();
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();

    assert.equal(configStore.activeMode, "probe");
    assert.equal(probeStore.isRunning, false);
    assert.equal(pelicanStore.isPelicanRunning, false);

    // 用户在 probe 模式下输入配置
    configStore.probeConfig.baseUrl = "https://api.openai.com";
    configStore.probeConfig.apiKey = "sk-test-key-123";
    configStore.probeConfig.modelName = "gpt-4o";
    configStore.probeConfig.apiFormat = "chat_completions";
    configStore.probeConfig.reasoningEffort = "medium";
    configStore.probeConfig.stream = false;

    // 切换到鹈鹕测试
    configStore.setActiveMode("pelican");

    assert.equal(configStore.activeMode, "pelican");
    assert.equal(configStore.pelicanConfig.baseUrl, "https://api.openai.com");
    assert.equal(configStore.pelicanConfig.apiKey, "sk-test-key-123");
    assert.equal(configStore.pelicanConfig.modelName, "gpt-4o");
    assert.equal(configStore.pelicanConfig.apiFormat, "chat_completions");
    assert.equal(configStore.pelicanConfig.reasoningEffort, "medium");
    assert.equal(configStore.pelicanConfig.stream, false);

    // 动态代理 config 也同步指向 pelicanConfig 且内容一致
    assert.equal(configStore.config.modelName, "gpt-4o");
    assert.equal(configStore.config.stream, false);
  });

  await t.test("未运行时从 pelican 切换回 probe，顺延继承 pelican 配置", () => {
    storage.clear();
    setActivePinia(createPinia());

    const configStore = useConfigStore();
    configStore.activeMode = "pelican";

    configStore.pelicanConfig.baseUrl = "https://api.anthropic.com";
    configStore.pelicanConfig.apiKey = "sk-ant-test-456";
    configStore.pelicanConfig.modelName = "claude-3-7-sonnet";
    configStore.pelicanConfig.apiFormat = "anthropic";
    configStore.pelicanConfig.reasoningEffort = "high";
    configStore.pelicanConfig.stream = true;

    // 切换回模型测试
    configStore.setActiveMode("probe");

    assert.equal(configStore.activeMode, "probe");
    assert.equal(configStore.probeConfig.baseUrl, "https://api.anthropic.com");
    assert.equal(configStore.probeConfig.apiKey, "sk-ant-test-456");
    assert.equal(configStore.probeConfig.modelName, "claude-3-7-sonnet");
    assert.equal(configStore.probeConfig.apiFormat, "anthropic");
    assert.equal(configStore.probeConfig.reasoningEffort, "high");
    assert.equal(configStore.probeConfig.stream, true);
  });

  await t.test("当切换后的测试正在进行中时，不应同步覆盖该测试的配置", () => {
    storage.clear();
    setActivePinia(createPinia());

    const configStore = useConfigStore();
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();

    // 1. 假设 probe 正在进行测试，拥有专属配置
    configStore.probeConfig.baseUrl = "https://probe-api.com";
    configStore.probeConfig.apiKey = "sk-probe-run";
    configStore.probeConfig.modelName = "deepseek-reasoner";
    configStore.probeConfig.reasoningEffort = "high";
    probeStore.isRunning = true;

    // 此时用户在 pelican 模式下，修改了配置
    configStore.activeMode = "pelican";
    configStore.pelicanConfig.baseUrl = "https://pelican-different.com";
    configStore.pelicanConfig.apiKey = "sk-pelican-edit";
    configStore.pelicanConfig.modelName = "gpt-4o-mini";
    configStore.pelicanConfig.reasoningEffort = "low";

    // 用户在此时点击 tab 切换回 probe 模式（注意：probe 正在进行中！）
    configStore.setActiveMode("probe");

    assert.equal(configStore.activeMode, "probe");
    // probe 的配置必须保留正在运行的内容，不能被 pelican 覆盖
    assert.equal(configStore.probeConfig.baseUrl, "https://probe-api.com");
    assert.equal(configStore.probeConfig.apiKey, "sk-probe-run");
    assert.equal(configStore.probeConfig.modelName, "deepseek-reasoner");
    assert.equal(configStore.probeConfig.reasoningEffort, "high");

    // 2. 反向测试：pelican 正在进行中，probe 切换到 pelican
    probeStore.isRunning = false;
    pelicanStore.isPelicanRunning = true;
    configStore.probeConfig.modelName = "modified-probe-model";

    configStore.setActiveMode("pelican");
    assert.equal(configStore.activeMode, "pelican");
    // pelican 正在进行中，其配置不能被 probe 覆盖
    assert.equal(configStore.pelicanConfig.modelName, "gpt-4o-mini");
    assert.notEqual(configStore.pelicanConfig.modelName, "modified-probe-model");
  });

  await t.test("测试运行结束后，再次切换可恢复平滑顺延", () => {
    storage.clear();
    setActivePinia(createPinia());

    const configStore = useConfigStore();
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();

    // 测试均已结束
    probeStore.isRunning = false;
    pelicanStore.isPelicanRunning = false;

    configStore.activeMode = "probe";
    configStore.probeConfig.modelName = "new-final-model";
    configStore.probeConfig.stream = false;

    configStore.setActiveMode("pelican");
    assert.equal(configStore.pelicanConfig.modelName, "new-final-model");
    assert.equal(configStore.pelicanConfig.stream, false);
  });
});
