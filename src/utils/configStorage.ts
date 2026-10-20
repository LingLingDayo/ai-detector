import {
  STORAGE_KEY,
  CONFIG_LIST_STORAGE_KEY,
  ACTIVE_CONFIG_ID_KEY,
  resolveValidReasoningEffort,
} from "../constants";
import type { ClientConfig, ConfigItem } from "../types";
import { generateConfigId } from "./configHelpers";

export interface LoadedConfigData {
  configList: ConfigItem[];
  activeConfigId: string | null;
  savedConfig: Partial<ClientConfig>;
}

/**
 * 从本地存储加载配置列表、激活配置 ID 与表单持久化数据
 * 包含异常保护、数据自动迁移以及凭据自洽性校验
 */
export function loadStoredConfigs(): LoadedConfigData {
  try {
    // 1. 读取保存的配置列表
    const rawList = localStorage.getItem(CONFIG_LIST_STORAGE_KEY);
    let loadedList: ConfigItem[] = [];
    if (rawList) {
      try {
        const parsed = JSON.parse(rawList);
        if (Array.isArray(parsed)) {
          loadedList = parsed;
        }
      } catch {
        loadedList = [];
      }
    }

    // 2. 读取当前活跃配置 ID
    const savedActiveId = localStorage.getItem(ACTIVE_CONFIG_ID_KEY);

    // 3. 读取旧版或当前活跃表单配置
    const rawConfig = localStorage.getItem(STORAGE_KEY);
    let savedConfig: Partial<ClientConfig> = {};
    if (rawConfig) {
      try {
        savedConfig = JSON.parse(rawConfig) || {};
      } catch {
        savedConfig = {};
      }
    }

    let activeConfigId: string | null = null;

    // 4. 数据迁移：如果列表为空但旧单配置有有效数据，自动转为默认配置项
    if (loadedList.length === 0 && (savedConfig.baseUrl || savedConfig.apiKey)) {
      const defaultItem: ConfigItem = {
        id: generateConfigId(),
        name: "默认配置",
        baseUrl: savedConfig.baseUrl || "",
        apiKey: savedConfig.apiKey || "",
        apiFormat: savedConfig.apiFormat || "chat_completions",
        modelName: savedConfig.modelName || "",
        reasoningEffort: savedConfig.reasoningEffort || "high",
        stream: savedConfig.stream !== false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      loadedList = [defaultItem];
      activeConfigId = defaultItem.id;
    } else {
      let candidateActiveId: string | null = null;
      if (savedActiveId && loadedList.some((item) => item.id === savedActiveId)) {
        candidateActiveId = savedActiveId;
      } else if (
        loadedList.length > 0 &&
        !savedActiveId &&
        !savedConfig.baseUrl &&
        !savedConfig.apiKey
      ) {
        candidateActiveId = loadedList[0].id;
      }

      if (candidateActiveId) {
        const target = loadedList.find((item) => item.id === candidateActiveId);
        if (target) {
          const curUrl = (savedConfig.baseUrl || "").trim();
          const curKey = (savedConfig.apiKey || "").trim();
          const targetUrl = (target.baseUrl || "").trim();
          const targetKey = (target.apiKey || "").trim();
          if ((curUrl || curKey) && (curUrl !== targetUrl || curKey !== targetKey)) {
            candidateActiveId = null;
          }
        }
      }
      activeConfigId = candidateActiveId;
    }

    return {
      configList: loadedList,
      activeConfigId,
      savedConfig,
    };
  } catch (err) {
    console.warn("加载本地配置存储失败:", err);
    return {
      configList: [],
      activeConfigId: null,
      savedConfig: {},
    };
  }
}

/**
 * 将配置列表与激活配置 ID 持久化至本地存储
 */
export function persistConfigList(
  configList: ConfigItem[],
  activeConfigId: string | null
): void {
  try {
    localStorage.setItem(CONFIG_LIST_STORAGE_KEY, JSON.stringify(configList));
    if (activeConfigId) {
      localStorage.setItem(ACTIVE_CONFIG_ID_KEY, activeConfigId);
    } else {
      localStorage.removeItem(ACTIVE_CONFIG_ID_KEY);
    }
  } catch (err) {
    console.warn("保存配置列表到本地存储失败:", err);
  }
}

/**
 * 将当前表单的配置参数持久化至本地存储
 */
export function persistCurrentConfig(config: ClientConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn("保存当前配置参数失败:", err);
  }
}

/**
 * 清除本地缓存的当前配置参数
 */
export function clearCurrentConfigStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("清除配置缓存失败:", err);
  }
}

/**
 * 清除本地缓存的激活配置 ID
 */
export function clearActiveConfigIdStorage(): void {
  try {
    localStorage.removeItem(ACTIVE_CONFIG_ID_KEY);
  } catch {
    // 忽略异常
  }
}

/**
 * 将持久化恢复的配置应用到响应式配置对象中，并修正协议与思考强度
 */
export function applyPersistedConfigToTarget(
  savedConfig: Partial<ClientConfig>,
  target: ClientConfig
): void {
  if (savedConfig.baseUrl !== undefined) target.baseUrl = savedConfig.baseUrl;
  if (savedConfig.apiKey !== undefined) target.apiKey = savedConfig.apiKey;
  if (savedConfig.modelName !== undefined) target.modelName = savedConfig.modelName;

  if (savedConfig.apiFormat !== undefined) {
    if (
      savedConfig.apiFormat === "responses" ||
      savedConfig.apiFormat === "openai_responses" ||
      savedConfig.apiFormat === "openai_native"
    ) {
      target.apiFormat = "responses";
    } else if (savedConfig.apiFormat === "anthropic") {
      target.apiFormat = "anthropic";
    } else {
      target.apiFormat = "chat_completions";
    }
  }

  if (savedConfig.reasoningEffort !== undefined) {
    target.reasoningEffort = resolveValidReasoningEffort(
      target.modelName,
      savedConfig.reasoningEffort
    );
  } else {
    target.reasoningEffort = resolveValidReasoningEffort(target.modelName, "high");
  }

  if (savedConfig.stream !== undefined) {
    target.stream = savedConfig.stream !== false;
  } else {
    target.stream = true;
  }
}
