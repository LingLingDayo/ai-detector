# 贡献与版本发布指南 (Contributing & Release Guide)

感谢对 **AI 模型检测器 (AI Detector)** 的关注与贡献！本文档详细说明了本项目的本地开发、测试以及版本发布流程。

---

## 🛠 本地开发与质量检查

```bash
# 启动本地开发服务 (支持前端热重载)
npm run dev

# 启动桌面端调试窗口
npm run tauri dev

# 执行前端构建与 TypeScript 类型检查
npm run build

# 运行更新日志解析测试
npm run test:changelog
```

---

## 📦 版本发布流程 (Release SOP)

本项目配置了自动化发布流水线，**向远程仓库推送版本 Tag 即会自动触发 GitHub Actions 编译并发布 Release**。

### 1. 更新日志规范
在准备发版前，请在 [`CHANGELOG.md`](CHANGELOG.md) 中添加待发布版本的内容记录，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式：

```markdown
## [1.0.1] - 2026-10-12

### 🌟 Features
- feat: 新特性描述

### 🔧 Fixes
- fix: 修复问题描述
```

### 2. 打 Tag 并发布

#### 方式一：使用内置发布辅助工具（推荐）
```bash
# 1. 发版前演练检查（验证 CHANGELOG 与版本匹配，不产生实际改动）
npm run release:tag -- --dry-run

# 2. 为当前 package.json 版本创建本地 Git Tag (如 v1.0.0)
npm run release:tag

# 3. 一键创建 Tag 并推送到远程仓库（直接触发 GitHub Actions 发版）
npm run release:tag -- --push

# 4. 指定升级新版本（会自动同步 package.json、tauri.conf.json、Cargo.toml 并打 Tag）
npm run release:tag v1.0.1 -- --push
```

#### 方式二：手动 Git 打 Tag
```bash
# 提交版本变更与更新日志
git commit -am "chore: release v1.0.1"

# 创建带注释的 Git Tag 并推送到远程
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

---

## 🤖 GitHub Actions 自动发版工作流

当推送形如 `v*` 的 Tag 至远程仓库时，[`.github/workflows/release.yml`](.github/workflows/release.yml) 会自动执行：
1. **环境准备**：检出仓库、加载 Node.js 与 Rust MSVC 工具链、初始化依赖缓存；
2. **构建校验**：运行 `npm run build` 进行全量类型检查；
3. **日志截取**：通过 `scripts/extract-changelog.js` 自动从 `CHANGELOG.md` 中提取对应版本的 Release Notes；
4. **编译应用**：执行 `npm run tauri build` 编译 Windows 应用；
5. **收集与归档产物**：
   - NSIS 安装向导 (`*-setup.exe`)
   - MSI 安装包 (`*.msi`)
   - 绿色独立可执行程序 (`AI-Detector.exe` / `AI模型检测器.exe`)
   - SHA256 完整性清单 (`checksums-sha256.txt`)
6. **创建 GitHub Release**：自动发布包含所有安装包与更新说明的 Release 版本。
