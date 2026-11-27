# 版本发布指南（内部）

> 本文仅面向维护者与 AI 代理，说明版本发布 SOP、发版前校验与 GitHub Actions 自动化发布流程。调试诊断说明见 [diagnostics.md](diagnostics.md)，自动更新机制见 [auto-update.md](auto-update.md)。

---

## 发版前校验

```bash
# 运行全部单元测试
npm test

# 单独验证更新日志解析脚本
npm run test:changelog

# 类型检查与前端生产构建
npm run build

# 检查 Rust 后端编译
cd src-tauri && cargo check
```

---

## 版本发布流程 (Release SOP)

本项目配置了自动化发布流水线，**向远程仓库推送 `v*` Tag（或手动触发 `workflow_dispatch`）即会自动触发 GitHub Actions 编译、签名并发布 Release**。

### 1. 更新日志规范

发版前请在 [`CHANGELOG.md`](../CHANGELOG.md) 顶部添加待发布版本的变更记录，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式：

```markdown
## [1.3.1] - 2026-11-27

### Features
- feat: 新特性描述

### Fixes
- fix: 修复问题描述
```

### 2. 打 Tag 并发布

#### 方式一：使用内置发布辅助脚本（推荐）

```bash
# 1. 发版前演练检查（验证 CHANGELOG 与版本号匹配，不产生实际改动）
npm run release:tag -- --dry-run

# 2. 为当前 package.json 版本创建本地 Git Tag（如 v1.3.0）
npm run release:tag

# 3. 创建 Tag 并推送到远程仓库（直接触发 GitHub Actions 发版）
npm run release:tag -- --push

# 4. 指定升级新版本（自动同步 package.json、src-tauri/tauri.conf.json、src-tauri/Cargo.toml 并打 Tag）
npm run release:tag v1.3.1 -- --push
```

#### 方式二：手动 Git 打 Tag

确保 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 三个文件的版本号与目标 Tag 完全一致，否则 CI 的版本一致性校验会直接失败：

```bash
git commit -am "chore: 升级版本号至 v1.3.1"
git tag -a v1.3.1 -m "Release v1.3.1"
git push origin v1.3.1
```

---

## GitHub Actions 自动发版工作流

推送形如 `v*` 的 Tag（或在 Actions 页面通过 `workflow_dispatch` 指定 `tag_name`）后，[`.github/workflows/release.yml`](../.github/workflows/release.yml) 会按序执行：

1. **版本一致性校验**：校验语义化 Tag 与 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 的版本号完全一致；
2. **环境与依赖准备**：在 `windows-latest` 检出仓库，配置 Node.js 20 与 `x86_64-pc-windows-msvc` Rust 工具链，执行 `npm ci`；
3. **构建校验**：运行 `npm run build` 完成 TypeScript 类型检查与前端构建；
4. **提取发布说明**：通过 `scripts/extract-changelog.js` 从 `CHANGELOG.md` 截取对应版本内容生成 `RELEASE_NOTES.md`；
5. **编译与签名**：使用签名私钥执行 `npm run tauri build` 生成 Windows 安装包及签名文件；
6. **产物归档与清单生成**：
   - NSIS 安装程序及签名（`*-setup.exe`、`*.exe.sig`）
   - MSI 安装包及签名（`*.msi`、`*.msi.sig`）
   - 绿色便携版及独立签名（统一英文名 `AI-Detector.exe`、`AI-Detector.exe.sig`）
   - 自动更新清单（`scripts/generate-update-manifest.js` 生成的 `latest.json`）
   - SHA256 校验和清单（`checksums-sha256.txt`）
7. **发布 GitHub Release**：自动创建正式版或预发布版（Tag 含 `-alpha` / `-beta` / `-rc` 时标记为 prerelease）并上传全部产物。
