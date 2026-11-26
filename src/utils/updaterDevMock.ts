import type { AppInstallKind, AppUpdateInfo, UpdateProgress } from "../services/updater";

export const DEFAULT_DEV_UPDATE_ENDPOINT = "http://127.0.0.1:4199/latest.json";

const MOCK_RELEASE_NOTES = `✨ Features
feat: 新增开发模式更新弹窗与下载进度模拟工具
feat: 支持本地更新服务器签名验签与安全演练

🎨 UI & Style
style: 优化更新说明分组排版与暗色主题对比度

🔧 Fixes
fix: 修复部分环境下便携版更新残留文件未及时清理的问题`;

export function createMockUpdateInfo(
  installKind: AppInstallKind,
  currentVersion: string
): AppUpdateInfo {
  return {
    version: "9.9.9",
    currentVersion: currentVersion.replace(/^v/i, ""),
    notes: MOCK_RELEASE_NOTES,
    pubDate: new Date().toISOString(),
    downloadUrl: "http://127.0.0.1:4199/AI-Detector.exe",
    installKind,
    canAutoInstall:
      installKind === "nsis" || installKind === "msi" || installKind === "portable",
  };
}

export async function runMockDownload(
  onProgress: (progress: UpdateProgress) => void,
  stepDelayMs: number = 120
): Promise<void> {
  const total = 15 * 1024 * 1024;
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
    const downloaded = i === steps ? total : Math.round((total * i) / steps);
    onProgress({ downloaded, total });
  }
}
