import test from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";

// Mock localStorage for node environment
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

import { useConfigStore } from "../../src/stores/config.ts";
import { useProbeTestStore } from "../../src/stores/probeTest.ts";
import { usePelicanTestStore } from "../../src/stores/pelicanTest.ts";

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
