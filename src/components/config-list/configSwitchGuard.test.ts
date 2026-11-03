import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useConfigStore } from "../../stores/config";
import { useAppStore } from "../../stores/app";
import { useProbeTestStore } from "../../stores/probeTest";
import { usePelicanTestStore } from "../../stores/pelicanTest";
import { useCandyTestStore } from "../../stores/candyTest";
import { useConnectionTestStore } from "../../stores/connectionTest";
import { useToastStore } from "../../stores/toast";
import type { ConfigItem } from "../../types";

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

describe("配置列表在当前选中的测试进行中时禁止切换及顶部提示测试套件", () => {
  const configA: ConfigItem = {
    id: "cfg_a",
    name: "测试配置A",
    baseUrl: "https://api.a.com",
    apiKey: "sk-a",
    apiFormat: "chat_completions",
    modelName: "model-a",
    reasoningEffort: "high",
    stream: true,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const configB: ConfigItem = {
    id: "cfg_b",
    name: "测试配置B",
    baseUrl: "https://api.b.com",
    apiKey: "sk-b",
    apiFormat: "chat_completions",
    modelName: "model-b",
    reasoningEffort: "high",
    stream: true,
    createdAt: 2000,
    updatedAt: 2000,
  };

  let configStore: ReturnType<typeof useConfigStore>;
  let appStore: ReturnType<typeof useAppStore>;
  let probeStore: ReturnType<typeof useProbeTestStore>;
  let pelicanStore: ReturnType<typeof usePelicanTestStore>;
  let candyStore: ReturnType<typeof useCandyTestStore>;
  let connectionStore: ReturnType<typeof useConnectionTestStore>;
  let toastStore: ReturnType<typeof useToastStore>;

  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
    configStore = useConfigStore();
    appStore = useAppStore();
    probeStore = useProbeTestStore();
    pelicanStore = usePelicanTestStore();
    candyStore = useCandyTestStore();
    connectionStore = useConnectionTestStore();
    toastStore = useToastStore();

    configStore.configList = [configA, configB];
    configStore.applyConfig(configA);
  });

  it("当当前选中的模式为 probe 时，isCurrentRunning 正确反映 probe 运行状态", () => {
    appStore.setActiveMode("probe");
    expect(appStore.isCurrentRunning).toBe(false);

    probeStore.isRunning = true;
    expect(appStore.isCurrentRunning).toBe(true);

    probeStore.isRunning = false;
    expect(appStore.isCurrentRunning).toBe(false);
  });

  it("当当前选中的模式为 pelican 时，isCurrentRunning 正确反映 pelican 运行状态", () => {
    appStore.setActiveMode("pelican");
    expect(appStore.isCurrentRunning).toBe(false);

    pelicanStore.isPelicanRunning = true;
    expect(appStore.isCurrentRunning).toBe(true);

    pelicanStore.isPelicanRunning = false;
    expect(appStore.isCurrentRunning).toBe(false);
  });

  it("当当前选中的模式为 candy 时，isCurrentRunning 正确反映 candy 运行状态", () => {
    appStore.setActiveMode("candy");
    expect(appStore.isCurrentRunning).toBe(false);

    candyStore.isRunning = true;
    expect(appStore.isCurrentRunning).toBe(true);

    candyStore.isRunning = false;
    expect(appStore.isCurrentRunning).toBe(false);
  });

  it("当当前选中的模式为 connection 时，isCurrentRunning 正确反映 connection 运行状态", () => {
    appStore.setActiveMode("connection");
    expect(appStore.isCurrentRunning).toBe(false);

    connectionStore.isConnectionRunning = true;
    expect(appStore.isCurrentRunning).toBe(true);

    connectionStore.isConnectionRunning = false;
    expect(appStore.isCurrentRunning).toBe(false);
  });

  it("如果后台其他模式运行，但当前选中的模式未在运行，isCurrentRunning 必须为 false", () => {
    appStore.setActiveMode("probe");
    probeStore.isRunning = false;
    pelicanStore.isPelicanRunning = true;

    expect(appStore.isCurrentRunning).toBe(false);
  });

  it("模拟配置列表切换守卫：当前测试进行中时，禁止切换配置并在顶部触发 warning Toast", () => {
    appStore.setActiveMode("probe");
    probeStore.isRunning = true;

    // 守卫拦截逻辑（对应 ConfigListModal / App.vue 的防御）
    function attemptApply(targetItem: ConfigItem) {
      if (targetItem.id === configStore.activeConfigId) return;
      if (appStore.isCurrentRunning) {
        toastStore.showToast({
          type: "warning",
          title: "当前测试正在进行中，无法切换配置",
          message: "请等待当前测试完成或停止后再切换配置。",
          duration: 3000,
        });
        return;
      }
      configStore.applyConfig(targetItem);
    }

    attemptApply(configB);

    // 验证配置未发生切换
    expect(configStore.activeConfigId).toBe("cfg_a");
    expect(configStore.config.baseUrl).toBe("https://api.a.com");

    // 验证在顶部弹出 tip 提示
    expect(toastStore.toastState.isOpen).toBe(true);
    expect(toastStore.toastState.type).toBe("warning");
    expect(toastStore.toastState.title).toBe("当前测试正在进行中，无法切换配置");
    expect(toastStore.toastState.message).toContain("请等待当前测试完成或停止后再切换配置");
  });

  it("模拟配置列表切换守卫：当前测试未进行（已停止或完成）时，允许顺利切换配置", () => {
    appStore.setActiveMode("probe");
    probeStore.isRunning = false;

    function attemptApply(targetItem: ConfigItem) {
      if (targetItem.id === configStore.activeConfigId) return;
      if (appStore.isCurrentRunning) {
        toastStore.showToast({
          type: "warning",
          title: "当前测试正在进行中，无法切换配置",
          message: "请等待当前测试完成或停止后再切换配置。",
          duration: 3000,
        });
        return;
      }
      configStore.applyConfig(targetItem);
    }

    attemptApply(configB);

    // 验证配置成功切换至配置B
    expect(configStore.activeConfigId).toBe("cfg_b");
    expect(configStore.config.baseUrl).toBe("https://api.b.com");
    // 未触发 warning toast
    expect(toastStore.toastState.isOpen).toBe(false);
  });

  it("模拟双击切换已激活的同一个配置时，不触发拦截提示", () => {
    appStore.setActiveMode("probe");
    probeStore.isRunning = true;

    function attemptQuickApply(targetItem: ConfigItem) {
      if (targetItem.id !== configStore.activeConfigId) {
        if (appStore.isCurrentRunning) {
          toastStore.showToast({
            type: "warning",
            title: "当前测试正在进行中，无法切换配置",
            message: "请等待当前测试完成或停止后再切换配置。",
            duration: 3000,
          });
          return;
        }
        configStore.applyConfig(targetItem);
      }
      // 关窗
    }

    attemptQuickApply(configA);

    expect(configStore.activeConfigId).toBe("cfg_a");
    expect(toastStore.toastState.isOpen).toBe(false);
  });
});
