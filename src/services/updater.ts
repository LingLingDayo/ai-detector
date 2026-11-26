import { getTauriInvoke, isTauriApp } from "./api";

export type AppInstallKind = "nsis" | "msi" | "portable" | "dev" | "unsupported";

export interface AppInstallInfo {
  kind: AppInstallKind;
  canAutoInstall: boolean;
  currentVersion: string;
}

export interface AppUpdateInfo {
  version: string;
  currentVersion: string;
  notes: string;
  pubDate: string | null;
  downloadUrl: string;
  installKind: AppInstallKind;
  canAutoInstall: boolean;
}

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

function ensureDesktopInvoke() {
  if (!isTauriApp()) {
    throw new Error("仅桌面端支持检查更新");
  }
  const invoke = getTauriInvoke();
  if (!invoke) {
    throw new Error("桌面端更新接口尚未就绪");
  }
  return invoke;
}

export async function getAppInstallInfo(): Promise<AppInstallInfo> {
  const invoke = ensureDesktopInvoke();
  return invoke<AppInstallInfo>("get_app_install_info");
}

export async function checkAppUpdate(): Promise<AppUpdateInfo | null> {
  const invoke = ensureDesktopInvoke();
  return invoke<AppUpdateInfo | null>("check_app_update");
}

export async function installAppUpdate(
  onProgress?: (progress: UpdateProgress) => void
): Promise<void> {
  const invoke = ensureDesktopInvoke();
  const { Channel } = await import("@tauri-apps/api/core");
  const channel = new Channel<UpdateProgress>();
  channel.onmessage = (payload) => {
    if (payload && onProgress) {
      onProgress(payload);
    }
  };
  await invoke("install_app_update", { onProgress: channel });
}
