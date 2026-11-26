import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  APP_VERSION,
  GITHUB_RELEASES_URL,
  UPDATE_LAST_CHECK_STORAGE_KEY,
  UPDATE_SKIPPED_VERSION_STORAGE_KEY,
} from "../constants";
import { isTauriApp, openExternalUrl } from "../services/api";
import {
  checkAppUpdate,
  getAppInstallInfo,
  installAppUpdate,
  type AppInstallInfo,
  type AppInstallKind,
  type AppUpdateInfo,
  type DevUpdateOverride,
  type UpdateProgress,
} from "../services/updater";
import { isAutoCheckDue } from "../utils/updateSchedule";
import { createMockUpdateInfo, runMockDownload } from "../utils/updaterDevMock";
import { useSettingsStore } from "./settings";
import { useToastStore } from "./toast";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "restarting"
  | "error";

function loadLastCheckedAt(): number | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(UPDATE_LAST_CHECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveLastCheckedAt(ts: number): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(UPDATE_LAST_CHECK_STORAGE_KEY, String(ts));
    }
  } catch {
    // 忽略存储异常
  }
}

function loadSkippedVersion(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(UPDATE_SKIPPED_VERSION_STORAGE_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function saveSkippedVersion(version: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(UPDATE_SKIPPED_VERSION_STORAGE_KEY, version);
    }
  } catch {
    // 忽略存储异常
  }
}

function clearUpdaterStorage(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(UPDATE_LAST_CHECK_STORAGE_KEY);
      localStorage.removeItem(UPDATE_SKIPPED_VERSION_STORAGE_KEY);
    }
  } catch {
    // 忽略存储异常
  }
}

export const useUpdaterStore = defineStore("updater", () => {
  const status = ref<UpdaterStatus>("idle");
  const updateInfo = ref<AppUpdateInfo | null>(null);
  const installInfo = ref<AppInstallInfo | null>(null);
  const progress = ref<UpdateProgress | null>(null);
  const checkError = ref<string | null>(null);
  const installError = ref<string | null>(null);
  const lastCheckedAt = ref<number | null>(loadLastCheckedAt());
  const skippedVersion = ref<string | null>(loadSkippedVersion());
  const isDialogOpen = ref(false);
  const isMockPreview = ref(false);

  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let periodicTimer: ReturnType<typeof setInterval> | null = null;

  const progressPercent = computed<number | null>(() => {
    const p = progress.value;
    if (!p || !p.total || p.total <= 0) return null;
    return Math.min(100, Math.round((p.downloaded / p.total) * 100));
  });

  const isBusy = computed<boolean>(
    () =>
      status.value === "checking" ||
      status.value === "downloading" ||
      status.value === "restarting"
  );

  async function loadInstallInfo(): Promise<void> {
    if (!isTauriApp()) return;
    try {
      installInfo.value = await getAppInstallInfo();
    } catch (err) {
      console.warn("获取安装类型信息失败:", err);
    }
  }

  async function checkForUpdate(
    options: { silent?: boolean; devOverride?: DevUpdateOverride } = {}
  ): Promise<AppUpdateInfo | null> {
    const silent = options.silent === true;
    if (isBusy.value) return null;

    isMockPreview.value = false;
    status.value = "checking";
    checkError.value = null;
    installError.value = null;

    try {
      const overrideArg =
        import.meta.env.DEV && options.devOverride ? options.devOverride : undefined;
      const info = await checkAppUpdate(overrideArg);
      const now = Date.now();
      lastCheckedAt.value = now;
      saveLastCheckedAt(now);

      if (!info) {
        updateInfo.value = null;
        status.value = "upToDate";
        return null;
      }

      updateInfo.value = info;
      status.value = "available";
      if (!silent || info.version !== skippedVersion.value) {
        isDialogOpen.value = true;
      }
      return info;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (silent) {
        console.warn("自动检查更新失败:", message);
        status.value = "idle";
      } else {
        checkError.value = message;
        status.value = "error";
      }
      return null;
    }
  }

  async function installUpdate(): Promise<void> {
    if (!updateInfo.value) return;
    if (!updateInfo.value.canAutoInstall) {
      openReleasePage();
      return;
    }
    if (status.value === "downloading" || status.value === "restarting") {
      return;
    }

    status.value = "downloading";
    installError.value = null;
    progress.value = { downloaded: 0, total: null };

    if (import.meta.env.DEV && isMockPreview.value) {
      try {
        await runMockDownload((nextProgress) => {
          progress.value = nextProgress;
        });
        status.value = "restarting";
        await new Promise((resolve) => setTimeout(resolve, 900));
        useToastStore().showToast({
          type: "success",
          title: "开发模式模拟更新完成",
          message: "已完成下载与重启状态演练，未执行真实安装",
          duration: 3500,
        });
        status.value = "available";
      } catch (err) {
        installError.value = err instanceof Error ? err.message : String(err);
        status.value = "available";
      }
      return;
    }

    try {
      const res = await installAppUpdate((nextProgress) => {
        progress.value = nextProgress;
      });
      if (res?.dryRun) {
        useToastStore().showToast({
          type: "success",
          title: "开发联调下载与验签通过",
          message: res.message || "已通过签名校验（未触发真实重启）",
          filePath: res.savedPath || undefined,
          duration: 5000,
        });
        status.value = "available";
      } else {
        status.value = "restarting";
      }
    } catch (err) {
      installError.value = err instanceof Error ? err.message : String(err);
      status.value = "available";
    }
  }

  function skipCurrentVersion(): void {
    const version = updateInfo.value?.version;
    if (version) {
      skippedVersion.value = version;
      saveSkippedVersion(version);
    }
    isDialogOpen.value = false;
  }

  function openDialog(): void {
    isDialogOpen.value = true;
  }

  function closeDialog(): void {
    if (status.value === "downloading" || status.value === "restarting") {
      return;
    }
    isDialogOpen.value = false;
  }

  function openReleasePage(): void {
    const version = updateInfo.value?.version;
    const url = version
      ? `${GITHUB_RELEASES_URL}/tag/v${version.replace(/^v/i, "")}`
      : `${GITHUB_RELEASES_URL}/latest`;
    void openExternalUrl(url);
  }

  function openDevMockDialog(installKind: AppInstallKind): void {
    if (!import.meta.env.DEV) return;
    isMockPreview.value = true;
    updateInfo.value = createMockUpdateInfo(
      installKind,
      installInfo.value?.currentVersion || APP_VERSION
    );
    status.value = "available";
    checkError.value = null;
    installError.value = null;
    progress.value = null;
    isDialogOpen.value = true;
  }

  function triggerDevMockDownload(installKind: AppInstallKind): Promise<void> {
    if (!import.meta.env.DEV) return Promise.resolve();
    openDevMockDialog(installKind);
    return installUpdate();
  }

  function triggerDevMockError(installKind: AppInstallKind): void {
    if (!import.meta.env.DEV) return;
    openDevMockDialog(installKind);
    installError.value =
      installKind === "portable"
        ? "当前目录无写入权限，请手动下载新版本替换"
        : "下载更新失败: 模拟网络中断 (connection reset)";
  }

  function resetDevUpdaterState(): void {
    if (!import.meta.env.DEV) return;
    status.value = "idle";
    updateInfo.value = null;
    progress.value = null;
    checkError.value = null;
    installError.value = null;
    isDialogOpen.value = false;
    isMockPreview.value = false;
    lastCheckedAt.value = null;
    skippedVersion.value = null;
    clearUpdaterStorage();
  }

  function disposeAutoCheck(): void {
    if (startupTimer !== null) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    if (periodicTimer !== null) {
      clearInterval(periodicTimer);
      periodicTimer = null;
    }
  }

  function initAutoCheck(): void {
    if (!isTauriApp()) return;
    disposeAutoCheck();
    void loadInstallInfo();

    const settingsStore = useSettingsStore();
    const run = () => {
      if (settingsStore.autoCheckUpdate && isAutoCheckDue(lastCheckedAt.value, Date.now())) {
        void checkForUpdate({ silent: true });
      }
    };

    startupTimer = setTimeout(run, 5_000);
    periodicTimer = setInterval(run, 3_600_000);
  }

  return {
    status,
    updateInfo,
    installInfo,
    progress,
    checkError,
    installError,
    lastCheckedAt,
    skippedVersion,
    isDialogOpen,
    isMockPreview,
    progressPercent,
    isBusy,
    loadInstallInfo,
    checkForUpdate,
    installUpdate,
    skipCurrentVersion,
    openDialog,
    closeDialog,
    openReleasePage,
    openDevMockDialog,
    triggerDevMockDownload,
    triggerDevMockError,
    resetDevUpdaterState,
    initAutoCheck,
    disposeAutoCheck,
  };
});
