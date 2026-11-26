# 应用自动更新架构与配置说明

## 总体架构

- **检查机制**：桌面端基于 `tauri-plugin-updater`（v2）从 GitHub Releases 的 `latest.json` 拉取最新版本信息并校验签名。
- **安装类型识别**（`src-tauri/src/platform/updater/mod.rs`）：
  - `nsis`：程序同目录存在 `uninstall.exe`，走官方插件被动静默安装流程并自动重启。
  - `msi`：存在 MSI 打包标记时走官方插件安装流程（按系统策略触发 UAC）。
  - `portable`：其余发布版独立 `.exe`。检查更新时指定 `windows-<arch>-portable` 目标，通过插件 `download()` 完成签名校验并获取字节流，随后在原地执行自替换（写入 `.new` → 原文件重命名为 `.old` → `.new` 移入原路径 → 延迟拉起新进程并退出；下次启动自动清理残留文件）。若程序所在目录无写入权限，则提示用户手动前往发布页下载。
  - `dev` / `unsupported`：支持检查更新并展示更新日志，安装操作引导至 GitHub Release 页面。
- **检查策略**：支持每天自动检查一次（在“设置 → 关于”中可关闭），也支持点击“检查更新”手动触发，并支持“跳过此版本”。

## `latest.json` 清单结构

由 `scripts/generate-update-manifest.js` 在 CI 发布阶段自动生成：

```json
{
  "version": "1.3.0",
  "notes": "...",
  "pub_date": "2026-11-26T00:00:00.000Z",
  "platforms": {
    "windows-x86_64": { "signature": "...", "url": "..." },
    "windows-x86_64-nsis": { "signature": "...", "url": "..." },
    "windows-x86_64-msi": { "signature": "...", "url": "..." },
    "windows-x86_64-portable": { "signature": "...", "url": "..." }
  }
}
```

## GitHub Actions Secrets 配置

在仓库 **Settings → Secrets and variables → Actions** 中配置以下两个 Secret：

1. `TAURI_SIGNING_PRIVATE_KEY`：签名私钥文件（`%USERPROFILE%\.tauri\ai-detector.key`）的完整文本内容。
2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：私钥密码文件（`%USERPROFILE%\.tauri\ai-detector.key.password`）的内容。

> ⚠️ **密钥备份警告**：`src-tauri/tauri.conf.json` 中内置了对应的公钥。请务必妥善备份私钥与密码文件；一旦丢失，已发布版本的客户端将无法验证新生成密钥签名的更新包。

## 开发环境测试与联调

1. **UI 与交互快速模拟**（`npm run dev` 与 `npm run tauri dev` 均可用）：
   打开 **设置 → 关于 → 开发调试**（仅 `import.meta.env.DEV` 可见），可切换安装类型（安装版 / 便携版 / 开发环境），一键预览更新弹窗样式、模拟下载进度条、模拟失败提示与重置本地状态。
2. **本地真实端到端联调**（桌面端 `npm run tauri dev`）：
   - 终端 1 运行 `npm run dev:update-server`，使用本机私钥为测试载荷真实签名并在 `http://127.0.0.1:4199/latest.json` 提供限速下载服务（日志自动从 `CHANGELOG.md` 提取）。
   - 终端 2 运行 `npm run tauri dev`，在 **设置 → 关于 → 开发调试** 点击 **真实拉取**（也可在启动时设置环境变量 `AI_DETECTOR_DEV_UPDATE_ENDPOINT` 与 `AI_DETECTOR_DEV_INSTALL_KIND`）。
   - 仅在 `#[cfg(debug_assertions)]` 下允许连接本地 HTTP 更新源，完整走通 `tauri-plugin-updater` 检查、Channel 进度推送与 minisign 公钥验签；下载验签完成后仅落地至 `.temp/dev-update-downloaded/`（便携版对副本演练自替换），不会覆盖开发进程或触发真实安装重启。

