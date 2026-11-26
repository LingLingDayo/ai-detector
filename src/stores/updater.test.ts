import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { UPDATE_LAST_CHECK_STORAGE_KEY, UPDATE_SKIPPED_VERSION_STORAGE_KEY } from "../constants";

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

const mockCheckAppUpdate = vi.fn();
const mockInstallAppUpdate = vi.fn();
const mockGetAppInstallInfo = vi.fn();

vi.mock("../services/updater", () => ({
  checkAppUpdate: (...args: unknown[]) => mockCheckAppUpdate(...args),
  installAppUpdate: (...args: unknown[]) => mockInstallAppUpdate(...args),
  getAppInstallInfo: (...args: unknown[]) => mockGetAppInstallInfo(...args),
}));

import { useUpdaterStore } from "./updater";
import { useToastStore } from "./toast";

const sampleUpdate = {
  version: "1.4.0",
  currentVersion: "1.3.0",
  notes: "feat: 新版本功能",
  pubDate: "2026-11-27T00:00:00Z",
  downloadUrl: "https://example.com/AI-Detector_1.4.0_x64-setup.exe",
  installKind: "nsis" as const,
  canAutoInstall: true,
};

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe("updater store", () => {
  it("silent 模式下发现已跳过版本时不自动弹窗，手动检查时忽略跳过", async () => {
    storage.set(UPDATE_SKIPPED_VERSION_STORAGE_KEY, "1.4.0");
    mockCheckAppUpdate.mockResolvedValue(sampleUpdate);

    const store = useUpdaterStore();
    await store.checkForUpdate({ silent: true });

    expect(store.status).toBe("available");
    expect(store.isDialogOpen).toBe(false);

    await store.checkForUpdate({ silent: false });
    expect(store.isDialogOpen).toBe(true);
  });

  it("无可用更新时状态为 upToDate 并持久化检查时间", async () => {
    mockCheckAppUpdate.mockResolvedValue(null);

    const store = useUpdaterStore();
    const res = await store.checkForUpdate({ silent: false });

    expect(res).toBeNull();
    expect(store.status).toBe("upToDate");
    expect(store.lastCheckedAt).not.toBeNull();
    expect(storage.get(UPDATE_LAST_CHECK_STORAGE_KEY)).toBe(String(store.lastCheckedAt));
  });

  it("silent 检查失败时静默回到 idle，不设置 checkError", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCheckAppUpdate.mockRejectedValue(new Error("网络超时"));

    const store = useUpdaterStore();
    await store.checkForUpdate({ silent: true });

    expect(store.status).toBe("idle");
    expect(store.checkError).toBeNull();
    warnSpy.mockRestore();
  });

  it("手动检查失败时状态为 error 且记录 checkError", async () => {
    mockCheckAppUpdate.mockRejectedValue(new Error("检查更新失败: 404"));

    const store = useUpdaterStore();
    await store.checkForUpdate({ silent: false });

    expect(store.status).toBe("error");
    expect(store.checkError).toBe("检查更新失败: 404");
  });

  it("installUpdate 失败时记录 installError 并恢复 available 状态", async () => {
    mockCheckAppUpdate.mockResolvedValue(sampleUpdate);
    mockInstallAppUpdate.mockRejectedValue(new Error("当前目录无写入权限"));

    const store = useUpdaterStore();
    await store.checkForUpdate({ silent: false });
    await store.installUpdate();

    expect(store.status).toBe("available");
    expect(store.installError).toBe("当前目录无写入权限");
  });

  it("openDevMockDialog 与 triggerDevMockError 能打开模拟弹窗并注入错误提示", () => {
    const store = useUpdaterStore();
    store.openDevMockDialog("portable");
    expect(store.isDialogOpen).toBe(true);
    expect(store.isMockPreview).toBe(true);
    expect(store.updateInfo?.installKind).toBe("portable");

    store.triggerDevMockError("nsis");
    expect(store.installError).toContain("模拟网络中断");
  });

  it("installUpdate 在后端返回 dryRun 时弹出提示并保持 available 状态", async () => {
    mockCheckAppUpdate.mockResolvedValue(sampleUpdate);
    mockInstallAppUpdate.mockResolvedValue({
      dryRun: true,
      savedPath: ".temp/dev-update-downloaded/AI-Detector-dev-mock.exe",
      message: "开发演练完成：已通过签名校验",
    });

    const store = useUpdaterStore();
    await store.checkForUpdate({ silent: false });
    await store.installUpdate();

    expect(store.status).toBe("available");
    expect(useToastStore().toastState).toMatchObject({
      isOpen: true,
      type: "success",
      title: "开发联调下载与验签通过",
      filePath: ".temp/dev-update-downloaded/AI-Detector-dev-mock.exe",
    });
  });

  it("resetDevUpdaterState 重置内存状态并清除本地存储", async () => {
    storage.set(UPDATE_LAST_CHECK_STORAGE_KEY, "123456");
    storage.set(UPDATE_SKIPPED_VERSION_STORAGE_KEY, "1.4.0");
    const store = useUpdaterStore();
    store.openDevMockDialog("nsis");

    store.resetDevUpdaterState();

    expect(store.status).toBe("idle");
    expect(store.updateInfo).toBeNull();
    expect(store.isDialogOpen).toBe(false);
    expect(store.isMockPreview).toBe(false);
    expect(store.lastCheckedAt).toBeNull();
    expect(store.skippedVersion).toBeNull();
    expect(storage.has(UPDATE_LAST_CHECK_STORAGE_KEY)).toBe(false);
    expect(storage.has(UPDATE_SKIPPED_VERSION_STORAGE_KEY)).toBe(false);
  });
});
