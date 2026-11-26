import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
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
  type AppUpdateInfo,
  type UpdateProgress,
} from "../services/updater";
import { isAutoCheckDue } from "../utils/updateSchedule";
import { useSettingsStore } from "./settings";

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
    options: { silent?: boolean } = {}
  ): Promise<AppUpdateInfo | null> {
    const silent = options.silent === true;
    if (isBusy.value) return null;

    status.value = "checking";
    checkError.value = null;
    installError.value = null;

    try {
      const info = await checkAppUpdate();
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

    try {
      await installAppUpdate((nextProgress) => {
        progress.value = nextProgress;
      });
      status.value = "restarting";
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
    progressPercent,
    isBusy,
    loadInstallInfo,
    checkForUpdate,
    installUpdate,
    skipCurrentVersion,
    openDialog,
    closeDialog,
    openReleasePage,
    initAutoCheck,
    disposeAutoCheck,
  };
});
