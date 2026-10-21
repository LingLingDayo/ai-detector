import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useModelsStore } from "./models";
import { getModelStorageKey } from "../components/model-combobox/modelStorage";
import * as api from "../services/api";

describe("useModelsStore 单元测试套件", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
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
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("当本地没有缓存时，getModels 返回空数组且状态为默认文案", () => {
    const store = useModelsStore();
    const models = store.getModels("https://api.openai.com");
    expect(models).toEqual([]);

    const status = store.getStatus("https://api.openai.com");
    expect(status.isFetched).toBe(false);
    expect(status.statusBarText).toContain("未获取模型");
  });

  it("当缺少 URL 或 Key 时，fetchModels 应提示并直接返回已有模型", async () => {
    const store = useModelsStore();
    const result = await store.fetchModels("", "");
    expect(result).toEqual([]);

    const status = store.getStatus("");
    expect(status.statusColor).toBe("var(--warning)");
    expect(status.statusBarText).toContain("请先填写");
  });

  it("fetchModels 成功拉取远程模型并写入缓存与持久化存储", async () => {
    vi.spyOn(api, "fetchRemoteModels").mockResolvedValue(["gpt-4o", "claude-3-5-sonnet"]);

    const store = useModelsStore();
    const result = await store.fetchModels("https://api.openai.com", "sk-test-12345678");

    expect(result).toEqual(["gpt-4o", "claude-3-5-sonnet"]);
    const status = store.getStatus("https://api.openai.com");
    expect(status.isFetched).toBe(true);
    expect(status.statusBarText).toContain("已成功获取 2 个模型");
    expect(status.statusColor).toBe("var(--success)");

    // 再次调用 getModels 应该命中缓存
    expect(store.getModels("https://api.openai.com")).toEqual(["gpt-4o", "claude-3-5-sonnet"]);
  });

  it("并发调用 fetchModels 时能复用同一正在进行中的请求", async () => {
    const fetchSpy = vi.spyOn(api, "fetchRemoteModels").mockImplementation(
      async () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(["model-a", "model-b"]), 20);
        })
    );

    const store = useModelsStore();
    const p1 = store.fetchModels("https://api.openai.com", "sk-test-12345678");
    const p2 = store.fetchModels("https://api.openai.com", "sk-test-12345678");

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toEqual(["model-a", "model-b"]);
    expect(res2).toEqual(["model-a", "model-b"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("resetModels 能正确重置内存缓存并重新载入存储", () => {
    const store = useModelsStore();
    const key = getModelStorageKey("https://api.openai.com");
    storage.set(key, JSON.stringify(["saved-model"]));

    expect(store.getModels("https://api.openai.com")).toEqual(["saved-model"]);
    store.resetModels("https://api.openai.com");
    expect(store.getModels("https://api.openai.com")).toEqual(["saved-model"]);
  });
});
