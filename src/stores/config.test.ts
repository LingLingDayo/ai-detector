import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import {
  STORAGE_KEY,
  CONFIG_LIST_STORAGE_KEY,
  ACTIVE_CONFIG_ID_KEY,
} from "../constants";
import { useConfigStore } from "./config";
import { useProbeTestStore } from "./probeTest";
import { usePelicanTestStore } from "./pelicanTest";
import { useConnectionTestStore } from "./connectionTest";
import { useConfirmStore } from "./confirm";
import type { ConfigItem } from "../types";

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

describe("配置凭据修改与 active-config-tag 自动清空测试套件", () => {
  const mockItemA: ConfigItem = {
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

  let store: ReturnType<typeof useConfigStore>;

  beforeAll(() => {
    storage.clear();
    setActivePinia(createPinia());
    store = useConfigStore();
    store.loadConfig();
    store.configList = [mockItemA];
  });

  it("应用配置A后，activeConfigId 与 activeConfigName 正确展示", () => {
    store.applyConfig(mockItemA);
    expect(store.activeConfigId).toBe("cfg_a_123");
    expect(store.activeConfigName).toBe("配置A");
    expect(store.config.baseUrl).toBe("https://api.test-a.com");
    expect(store.config.apiKey).toBe("sk-key-a");
  });

  it("仅修改 modelName 时，activeConfigName 保持不变", async () => {
    store.config.modelName = "deepseek-chat";
    await nextTick();
    expect(store.activeConfigId).toBe("cfg_a_123");
    expect(store.activeConfigName).toBe("配置A");
  });

  it("修改 Base URL 后，active-config-tag (activeConfigName) 立即清空，activeConfigId 置空", async () => {
    store.config.baseUrl = "https://api.modified-url.com";
    await nextTick();
    // 计算属性即时清空
    expect(store.activeConfigName).toBe("");
    // watch 侦听器清空 activeConfigId
    expect(store.activeConfigId).toBeNull();
  });

  it("在凭据修改状态下打开保存弹窗，配置名称必须同步是空字符串", () => {
    store.openSaveCurrentModal();
    expect(store.isConfigEditModalOpen).toBe(true);
    expect(store.editingConfigItem?.name).toBe("");
    expect(store.editingConfigItem?.id).toBe("");
    expect(store.editingConfigItem?.baseUrl).toBe("https://api.modified-url.com");
    store.closeConfigEditModal();
  });

  it("将修改后的 Base URL 改回原配置地址时，active-config-tag (activeConfigName) 与 activeConfigId 自动恢复", async () => {
    store.config.baseUrl = "https://api.test-a.com";
    await nextTick();
    expect(store.activeConfigName).toBe("配置A");
    expect(store.activeConfigId).toBe("cfg_a_123");
  });

  it('重新应用配置A后，修改 API Key，同样清空 activeConfigName 并重置保存弹窗名称为 ""', async () => {
    store.applyConfig(mockItemA);
    expect(store.activeConfigId).toBe("cfg_a_123");
    expect(store.activeConfigName).toBe("配置A");

    store.config.apiKey = "sk-new-key-123456";
    await nextTick();
    expect(store.activeConfigName).toBe("");
    expect(store.activeConfigId).toBeNull();

    store.openSaveCurrentModal();
    expect(store.editingConfigItem?.name).toBe("");
    expect(store.editingConfigItem?.id).toBe("");
    expect(store.editingConfigItem?.apiKey).toBe("sk-new-key-123456");
    store.closeConfigEditModal();
  });

  it("将修改后的 API Key 改回原密钥时，active-config-tag (activeConfigName) 与 activeConfigId 自动恢复", async () => {
    store.config.apiKey = "sk-key-a";
    await nextTick();
    expect(store.activeConfigName).toBe("配置A");
    expect(store.activeConfigId).toBe("cfg_a_123");
  });

  it("在 pelican 模式下修改 Base URL，同样清空 activeConfigName 与 activeConfigId", async () => {
    store.applyConfig(mockItemA);
    store.setActiveMode("pelican");
    expect(store.activeConfigId).toBe("cfg_a_123");
    expect(store.activeConfigName).toBe("配置A");

    store.pelicanConfig.baseUrl = "https://api.pelican-custom.com";
    await nextTick();
    expect(store.activeConfigName).toBe("");
    expect(store.activeConfigId).toBeNull();

    store.openSaveCurrentModal();
    expect(store.editingConfigItem?.name).toBe("");
    store.closeConfigEditModal();
  });

  it("在 pelican 模式下改回原 Base URL，activeConfigName 与 activeConfigId 自动恢复", async () => {
    store.pelicanConfig.baseUrl = "https://api.test-a.com";
    await nextTick();
    expect(store.activeConfigName).toBe("配置A");
    expect(store.activeConfigId).toBe("cfg_a_123");
    store.setActiveMode("probe");
  });

  it("修改 url 后保存为新配置「配置B」，activeConfigId 自动成为新配置 ID 并更新 activeConfigName", async () => {
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

    expect(store.activeConfigName).toBe("配置B");
    expect(store.activeConfigId).not.toBeNull();
    expect(store.activeConfigId).not.toBe("cfg_a_123");
  });

  it("切换回「配置A」的凭据后，activeConfigName 与 activeConfigId 自动切回「配置A」", async () => {
    store.config.baseUrl = "https://api.test-a.com";
    await nextTick();
    expect(store.activeConfigName).toBe("配置A");
    expect(store.activeConfigId).toBe("cfg_a_123");
  });

  it("loadConfig 启动校验：若缓存表单凭据与缓存 activeConfigId 不一致，清空 activeConfigId", () => {
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

    expect(freshStore.activeConfigId).toBeNull();
    expect(freshStore.activeConfigName).toBe("");
  });
});

describe("切换不同测试时(test-mode-tabs)配置同步与保持规则测试", () => {
  it("未运行时从 probe 切换到 pelican，顺延继承 probe 配置", () => {
    storage.clear();
    setActivePinia(createPinia());

    const configStore = useConfigStore();
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();

    expect(configStore.activeMode).toBe("probe");
    expect(probeStore.isRunning).toBe(false);
    expect(pelicanStore.isPelicanRunning).toBe(false);

    // 用户在 probe 模式下输入配置
    configStore.probeConfig.baseUrl = "https://api.openai.com";
    configStore.probeConfig.apiKey = "sk-test-key-123";
    configStore.probeConfig.modelName = "gpt-4o";
    configStore.probeConfig.apiFormat = "chat_completions";
    configStore.probeConfig.reasoningEffort = "medium";
    configStore.probeConfig.stream = false;

    // 切换到鹈鹕测试
    configStore.setActiveMode("pelican");

    expect(configStore.activeMode).toBe("pelican");
    expect(configStore.pelicanConfig.baseUrl).toBe("https://api.openai.com");
    expect(configStore.pelicanConfig.apiKey).toBe("sk-test-key-123");
    expect(configStore.pelicanConfig.modelName).toBe("gpt-4o");
    expect(configStore.pelicanConfig.apiFormat).toBe("chat_completions");
    expect(configStore.pelicanConfig.reasoningEffort).toBe("medium");
    expect(configStore.pelicanConfig.stream).toBe(false);

    // 动态代理 config 也同步指向 pelicanConfig 且内容一致
    expect(configStore.config.modelName).toBe("gpt-4o");
    expect(configStore.config.stream).toBe(false);
  });

  it("未运行时从 pelican 切换回 probe，顺延继承 pelican 配置", () => {
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

    expect(configStore.activeMode).toBe("probe");
    expect(configStore.probeConfig.baseUrl).toBe("https://api.anthropic.com");
    expect(configStore.probeConfig.apiKey).toBe("sk-ant-test-456");
    expect(configStore.probeConfig.modelName).toBe("claude-3-7-sonnet");
    expect(configStore.probeConfig.apiFormat).toBe("anthropic");
    expect(configStore.probeConfig.reasoningEffort).toBe("high");
    expect(configStore.probeConfig.stream).toBe(true);
  });

  it("当切换后的测试正在进行中时，不应同步覆盖该测试的配置", () => {
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

    expect(configStore.activeMode).toBe("probe");
    // probe 的配置必须保留正在运行的内容，不能被 pelican 覆盖
    expect(configStore.probeConfig.baseUrl).toBe("https://probe-api.com");
    expect(configStore.probeConfig.apiKey).toBe("sk-probe-run");
    expect(configStore.probeConfig.modelName).toBe("deepseek-reasoner");
    expect(configStore.probeConfig.reasoningEffort).toBe("high");

    // 2. 反向测试：pelican 正在进行中，probe 切换到 pelican
    probeStore.isRunning = false;
    pelicanStore.isPelicanRunning = true;
    configStore.probeConfig.modelName = "modified-probe-model";

    configStore.setActiveMode("pelican");
    expect(configStore.activeMode).toBe("pelican");
    // pelican 正在进行中，其配置不能被 probe 覆盖
    expect(configStore.pelicanConfig.modelName).toBe("gpt-4o-mini");
    expect(configStore.pelicanConfig.modelName).not.toBe("modified-probe-model");
  });

  it("测试运行结束后，再次切换可恢复平滑顺延", () => {
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
    expect(configStore.pelicanConfig.modelName).toBe("new-final-model");
    expect(configStore.pelicanConfig.stream).toBe(false);
  });
});

describe("重置当前配置的作用范围", () => {
  it("只清空主页面配置，不删除或修改已保存的配置预设", async () => {
    storage.clear();
    setActivePinia(createPinia());

    const savedItem: ConfigItem = {
      id: "cfg_saved_001",
      name: "已保存配置",
      baseUrl: "https://api.saved.com",
      apiKey: "sk-saved-key",
      apiFormat: "chat_completions",
      modelName: "gpt-4o",
      reasoningEffort: "high",
      stream: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    storage.set(CONFIG_LIST_STORAGE_KEY, JSON.stringify([savedItem]));
    storage.set(ACTIVE_CONFIG_ID_KEY, savedItem.id);
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        baseUrl: savedItem.baseUrl,
        apiKey: savedItem.apiKey,
        apiFormat: savedItem.apiFormat,
        modelName: savedItem.modelName,
        reasoningEffort: savedItem.reasoningEffort,
        stream: savedItem.stream,
      })
    );

    const store = useConfigStore();
    const confirmStore = useConfirmStore();
    store.loadConfig();

    expect(store.activeConfigId).toBe(savedItem.id);
    const savedListSnapshot = storage.get(CONFIG_LIST_STORAGE_KEY);

    const resetPromise = store.resetConfig();
    expect(confirmStore.confirmState.isOpen).toBe(true);
    confirmStore.handleConfirm();

    await expect(resetPromise).resolves.toBe(true);

    expect(store.config.baseUrl).toBe("");
    expect(store.config.apiKey).toBe("");
    expect(store.config.modelName).toBe("");
    expect(store.probeConfig.baseUrl).toBe("");
    expect(store.pelicanConfig.baseUrl).toBe("");
    expect(store.connectionConfig.baseUrl).toBe("");

    expect(store.activeConfigId).toBeNull();
    expect(storage.get(ACTIVE_CONFIG_ID_KEY)).toBeUndefined();

    expect(store.configList).toHaveLength(1);
    expect(store.configList[0]).toEqual(savedItem);
    expect(storage.get(CONFIG_LIST_STORAGE_KEY)).toBe(savedListSnapshot);
  });
});

describe("连接测试作为第三模式时的配置同步规则", () => {
  it("未运行时从 probe 切换到 connection，完整继承当前配置", () => {
    storage.clear();
    setActivePinia(createPinia());

    const configStore = useConfigStore();
    configStore.probeConfig.baseUrl = "https://api.connection-test.com";
    configStore.probeConfig.apiKey = "sk-connection-key";
    configStore.probeConfig.modelName = "gemini-4-argon";
    configStore.probeConfig.apiFormat = "anthropic";
    configStore.probeConfig.reasoningEffort = "medium";
    configStore.probeConfig.stream = false;

    configStore.setActiveMode("connection");

    expect(configStore.activeMode).toBe("connection");
    expect(configStore.connectionConfig.baseUrl).toBe("https://api.connection-test.com");
    expect(configStore.connectionConfig.apiKey).toBe("sk-connection-key");
    expect(configStore.connectionConfig.modelName).toBe("gemini-4-argon");
    expect(configStore.connectionConfig.apiFormat).toBe("anthropic");
    expect(configStore.connectionConfig.reasoningEffort).toBe("medium");
    expect(configStore.connectionConfig.stream).toBe(false);
    expect(configStore.config.modelName).toBe("gemini-4-argon");
  });

  it("connection 模式修改凭据会同步到其他未运行模式", async () => {
    storage.clear();
    setActivePinia(createPinia());

    const configStore = useConfigStore();
    configStore.setActiveMode("connection");
    configStore.connectionConfig.baseUrl = "https://api.shared.com";
    configStore.connectionConfig.apiKey = "sk-shared";
    await nextTick();

    expect(configStore.probeConfig.baseUrl).toBe("https://api.shared.com");
    expect(configStore.probeConfig.apiKey).toBe("sk-shared");
    expect(configStore.pelicanConfig.baseUrl).toBe("https://api.shared.com");
    expect(configStore.pelicanConfig.apiKey).toBe("sk-shared");
  });

  it("connection 正在运行时切换模式不会覆盖其配置", () => {
    storage.clear();
    setActivePinia(createPinia());

    const configStore = useConfigStore();
    const connectionStore = useConnectionTestStore();
    configStore.connectionConfig.modelName = "connection-running-model";
    connectionStore.isConnectionRunning = true;

    configStore.activeMode = "probe";
    configStore.probeConfig.modelName = "probe-model";
    configStore.setActiveMode("connection");

    expect(configStore.connectionConfig.modelName).toBe("connection-running-model");
  });
});

describe("配置列表拖动插入排序 moveConfigItem 测试套件", () => {
  function createMockConfig(id: string, name: string): ConfigItem {
    return {
      id,
      name,
      baseUrl: `https://api.${id}.com`,
      apiKey: `key-${id}`,
      apiFormat: "chat_completions",
      modelName: "test-model",
      reasoningEffort: "off",
      stream: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  it("支持向前拖动插入到目标项上方（before）与下方（after）", () => {
    storage.clear();
    setActivePinia(createPinia());
    const store = useConfigStore();

    store.configList = [
      createMockConfig("c1", "配置1"),
      createMockConfig("c2", "配置2"),
      createMockConfig("c3", "配置3"),
      createMockConfig("c4", "配置4"),
    ];

    // 将 c4 插入到 c2 之前 (before) -> [c1, c4, c2, c3]
    store.moveConfigItem("c4", "c2", "before");
    expect(store.configList.map((c) => c.id)).toEqual(["c1", "c4", "c2", "c3"]);

    // 将 c3 插入到 c1 之后 (after) -> [c1, c3, c4, c2]
    store.moveConfigItem("c3", "c1", "after");
    expect(store.configList.map((c) => c.id)).toEqual(["c1", "c3", "c4", "c2"]);
  });

  it("支持向后拖动插入到目标项上方（before）与下方（after）", () => {
    storage.clear();
    setActivePinia(createPinia());
    const store = useConfigStore();

    store.configList = [
      createMockConfig("c1", "配置1"),
      createMockConfig("c2", "配置2"),
      createMockConfig("c3", "配置3"),
      createMockConfig("c4", "配置4"),
    ];

    // 将 c1 插入到 c3 之前 (before) -> [c2, c1, c3, c4]
    store.moveConfigItem("c1", "c3", "before");
    expect(store.configList.map((c) => c.id)).toEqual(["c2", "c1", "c3", "c4"]);

    // 将 c2 插入到 c4 之后 (after) -> [c1, c3, c4, c2]
    store.moveConfigItem("c2", "c4", "after");
    expect(store.configList.map((c) => c.id)).toEqual(["c1", "c3", "c4", "c2"]);
  });

  it("拖动自身或传入无效 ID 时列表保持原样且不报错", () => {
    storage.clear();
    setActivePinia(createPinia());
    const store = useConfigStore();

    const initial = [
      createMockConfig("c1", "配置1"),
      createMockConfig("c2", "配置2"),
    ];
    store.configList = [...initial];

    store.moveConfigItem("c1", "c1", "before");
    expect(store.configList.map((c) => c.id)).toEqual(["c1", "c2"]);

    store.moveConfigItem("non-exist", "c1", "before");
    expect(store.configList.map((c) => c.id)).toEqual(["c1", "c2"]);

    store.moveConfigItem("c1", "non-exist", "after");
    expect(store.configList.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("拖动插入后自动同步并保存至 localStorage", () => {
    storage.clear();
    setActivePinia(createPinia());
    const store = useConfigStore();

    store.configList = [
      createMockConfig("c1", "配置1"),
      createMockConfig("c2", "配置2"),
    ];

    store.moveConfigItem("c2", "c1", "before");
    const raw = storage.get(CONFIG_LIST_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.map((item: ConfigItem) => item.id)).toEqual(["c2", "c1"]);
  });
});

